import eventlet
import logging
eventlet.monkey_patch()

# Configuração de Logging para debug
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit
import os
import cv2
import numpy as np
import base64
import json
from datetime import datetime

# Inicialização do App Flask e SocketIO
app = Flask(__name__)
app.config['SECRET_KEY'] = 'segredo_ether_tcg_master'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# --- ESTRUTURAS DE DADOS GLOBAIS ---

# 1. Salas do Lobby (Apenas nomes e lista de nicks para exibição)
LOBBY_ROOMS = {}
for i in range(1, 11):
    room_id = f"mesa_{i}"
    LOBBY_ROOMS[room_id] = {
        "name": f"Arena {i:02d}",
        "players": [] 
    }

# 2. Mapeamento de Sessão (Socket ID -> Dados do Usuário)
SID_MAP = {} 

# 3. Estado Real do Jogo (Fonte da Verdade)
# Estrutura: 'mesa_1': { 'p1': {...}, 'p2': {...}, 'specs': [...] }
SALAS = {}

# --- CONFIGURAÇÃO DE VISÃO COMPUTACIONAL (OPENCV) ---

PASTA_BANCO = 'banco_cartas'
ARQUIVO_DADOS = 'cartas.json'
METADADOS = {}

# Carrega metadados (nomes, descrições) se existirem
if os.path.exists(ARQUIVO_DADOS):
    try:
        with open(ARQUIVO_DADOS, 'r', encoding='utf-8') as f:
            METADADOS = json.load(f)
    except Exception as e:
        logging.error(f"Erro ao carregar json: {e}")

# Inicializa Detector ORB e CLAHE (Melhoria de contraste)
orb = cv2.ORB_create(nfeatures=1000)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))

nomes_cartas = []
imagens_b64 = []
descritores_db = []
dados_para_homografia = []

# Função auxiliar para ler imagens com caracteres especiais no caminho (Windows)
def ler_imagem(caminho):
    try:
        stream = np.fromfile(caminho, dtype=np.uint8)
        return cv2.imdecode(stream, cv2.IMREAD_COLOR)
    except:
        return None

# Carregamento e Indexação das Cartas na Inicialização
if os.path.exists(PASTA_BANCO):
    logging.info("Iniciando indexação de cartas...")
    for arquivo in os.listdir(PASTA_BANCO):
        try:
            path = os.path.join(PASTA_BANCO, arquivo)
            img = ler_imagem(path)
            if img is None: continue
            
            # Redimensiona imagens muito grandes para otimizar memória
            h, w = img.shape[:2]
            altura_max = 600
            if h > altura_max:
                fator = altura_max / h
                img = cv2.resize(img, (int(w * fator), altura_max), interpolation=cv2.INTER_AREA)
            
            # Pré-processamento
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            gray = clahe.apply(gray)
            
            # Detecção de Features
            kp, des = orb.detectAndCompute(gray, None)
            
            if des is not None:
                nomes_cartas.append(arquivo)
                # Guarda versão base64 para exibir no frontend
                _, buffer = cv2.imencode('.jpg', img)
                imagens_b64.append(base64.b64encode(buffer).decode('utf-8'))
                
                descritores_db.append(des)
                dados_para_homografia.append(kp)
        except Exception as e:
            logging.error(f"Erro ao processar {arquivo}: {e}")
    logging.info(f"Indexação concluída. {len(nomes_cartas)} cartas carregadas.")

# Configuração do Matcher (FLANN LSH para ORB)
index_params = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
search_params = dict(checks=50)
flann = cv2.FlannBasedMatcher(index_params, search_params)

if len(descritores_db) > 0:
    flann.add(descritores_db)
    flann.train()

# Função de Recorte Automático (Remove o fundo da mesa)
def recorte_inteligente(img):
    try:
        h_img, w_img = img.shape[:2]
        centro_x, centro_y = w_img // 2, h_img // 2 
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 30, 150)
        
        # Dilata para fechar bordas
        kernel = np.ones((3,3), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=1)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return img
            
        melhor_candidato = None
        maior_area = 0
        
        # Busca o maior contorno que esteja próximo ao centro (onde a carta geralmente está)
        for c in contours:
            area = cv2.contourArea(c)
            if area < (h_img * w_img * 0.05): continue # Ignora muito pequenos
            
            if cv2.pointPolygonTest(c, (centro_x, centro_y), False) >= 0:
                if area > maior_area:
                    maior_area = area
                    melhor_candidato = c
        
        # Se não achou no centro, pega o maior de todos
        if melhor_candidato is None:
            melhor_candidato = max(contours, key=cv2.contourArea)
            
        x, y, w, h = cv2.boundingRect(melhor_candidato)
        
        # Margem de segurança
        pad = 10
        x = max(0, x - pad)
        y = max(0, y - pad)
        w = min(w_img - x, w + 2*pad)
        h = min(h_img - y, h + 2*pad)
        
        return img[y:y+h, x:x+w]
    except Exception as e:
        return img

# --- FUNÇÕES AUXILIARES DO JOGO ---

def get_sala_state(room_id):
    """Retorna ou cria o estado de uma sala."""
    if room_id not in SALAS:
        SALAS[room_id] = {
            'p1': {'sid': None, 'nick': 'Vazio', 'hp': 20, 'peer_id': None},
            'p2': {'sid': None, 'nick': 'Vazio', 'hp': 20, 'peer_id': None},
            'specs': []
        }
    return SALAS[room_id]

def update_lobby():
    """Envia a lista de salas atualizada para quem está no lobby."""
    data = {}
    for rid, r in LOBBY_ROOMS.items():
        state = SALAS.get(rid)
        nicks = []
        if state:
            if state['p1']['sid']: nicks.append(state['p1']['nick'])
            if state['p2']['sid']: nicks.append(state['p2']['nick'])
        else:
            nicks = r['players']
        data[rid] = {"name": r["name"], "count": len(nicks), "nicks": nicks}
    socketio.emit('lobby_update', data)

def broadcast_game_state(room_id):
    """Envia HP, Nomes e IDs de Vídeo para todos na sala."""
    state = get_sala_state(room_id)
    payload = {
        'p1': {
            'nick': state['p1']['nick'], 
            'hp': state['p1']['hp'], 
            'peer_id': state['p1']['peer_id'],
            'sid': state['p1']['sid']
        },
        'p2': {
            'nick': state['p2']['nick'], 
            'hp': state['p2']['hp'], 
            'peer_id': state['p2']['peer_id'],
            'sid': state['p2']['sid']
        }
    }
    socketio.emit('atualizar_estado_jogo', payload, room=room_id)

# --- EVENTOS SOCKET.IO ---

@socketio.on('connect')
def on_connect():
    update_lobby()

@socketio.on('entrar_sala')
def on_join(data):
    room = data['sala']
    nick = data.get('nickname', 'Player')
    sid = request.sid
    
    join_room(room)
    
    state = get_sala_state(room)
    my_slot = 'spec'
    
    # Lógica de Ocupação: Preenche P1, depois P2, resto é Spec
    if state['p1']['sid'] is None:
        state['p1']['sid'] = sid
        state['p1']['nick'] = nick
        my_slot = 'p1'
    elif state['p2']['sid'] is None:
        state['p2']['sid'] = sid
        state['p2']['nick'] = nick
        my_slot = 'p2'
    else:
        # Verifica se já não está na lista
        if sid not in state['specs']:
            state['specs'].append(sid)
        my_slot = 'spec'

    # Salva mapeamento reverso
    SID_MAP[sid] = {'sala': room, 'nick': nick, 'slot': my_slot}
    
    # Atualiza lista do lobby global se for jogador
    if my_slot != 'spec':
        if nick not in LOBBY_ROOMS[room]['players']:
            LOBBY_ROOMS[room]['players'].append(nick)
            
    update_lobby()
    
    # 1. Configura o cliente (avisa se é P1 ou P2)
    emit('configurar_papel', {'slot': my_slot}, room=sid)
    
    # 2. Manda estado atual (Vida, Nomes, IDs de vídeo se já existirem)
    broadcast_game_state(room)
    
    # 3. Contagem de specs
    emit('update_specs_count', {'count': len(state['specs'])}, room=room)

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    if sid in SID_MAP:
        user = SID_MAP[sid]
        room = user['sala']
        slot = user['slot']
        state = get_sala_state(room)
        
        # Limpa slot correspondente
        if slot == 'p1':
            state['p1']['sid'] = None
            state['p1']['nick'] = 'Vazio'
            state['p1']['peer_id'] = None
            # Remove do lobby visual
            if user['nick'] in LOBBY_ROOMS[room]['players']:
                LOBBY_ROOMS[room]['players'].remove(user['nick'])
                
        elif slot == 'p2':
            state['p2']['sid'] = None
            state['p2']['nick'] = 'Vazio'
            state['p2']['peer_id'] = None
            if user['nick'] in LOBBY_ROOMS[room]['players']:
                LOBBY_ROOMS[room]['players'].remove(user['nick'])
                
        elif slot == 'spec':
            if sid in state['specs']:
                state['specs'].remove(sid)
            
        del SID_MAP[sid]
        
        update_lobby()
        broadcast_game_state(room)
        emit('update_specs_count', {'count': len(state['specs'])}, room=room)

@socketio.on('aviso_peer_id')
def on_peer(data):
    """Recebe o ID do PeerJS do cliente e armazena no estado da sala"""
    room = data['sala']
    peer_id = data['peerId']
    sid = request.sid
    
    state = get_sala_state(room)
    
    # Verifica quem mandou e salva no slot correto
    target_slot = None
    if state['p1']['sid'] == sid:
        target_slot = 'p1'
    elif state['p2']['sid'] == sid:
        target_slot = 'p2'
    
    if target_slot:
        state[target_slot]['peer_id'] = peer_id
        # Avisa todos que um novo vídeo está disponível
        broadcast_game_state(room)

@socketio.on('atualizar_vida')
def on_life(data):
    room = data['sala']
    target_slot = data['target_slot'] # 'p1' ou 'p2'
    delta = data['delta']
    
    state = get_sala_state(room)
    
    # Atualiza no servidor
    current_hp = state[target_slot]['hp']
    new_hp = current_hp + delta
    
    # Limites de segurança
    if new_hp < 0: new_hp = 0
    if new_hp > 999: new_hp = 999
    
    state[target_slot]['hp'] = new_hp
    
    # Pega nome de quem clicou
    try:
        autor = SID_MAP[request.sid]['nick']
    except:
        autor = "Alguém"
    
    # Sincroniza todos os clientes com o novo valor
    broadcast_game_state(room)
    
    # Gera Log
    hora = datetime.now().strftime("%H:%M")
    sinal = "+" if delta > 0 else ""
    alvo_nick = state[target_slot]['nick']
    
    msg = f"{autor} alterou vida de {alvo_nick}: {sinal}{delta} (Total: {new_hp})"
    
    emit('log_vida', {'texto': msg, 'hora': hora}, room=room)

# --- EVENTOS PASS-THROUGH (Repassa para os outros) ---

@socketio.on('enviar_chat')
def on_chat(data):
    # Reenvia para todos na sala
    emit('receber_chat', data, room=data['sala'])

@socketio.on('jogar_carta')
def on_play(data):
    # Envia para todos exceto quem jogou (para evitar duplicidade visual se necessário)
    emit('oponente_jogou', data, room=data['sala'], include_self=False)

@socketio.on('pedido_scan_remoto')
def on_scan_req(data):
    # Pede para o dono do vídeo recortar e enviar a imagem
    emit('executar_crop_local', data, room=data['sala'], include_self=False)

@socketio.on('devolver_scan_remoto')
def on_scan_res(data):
    # Devolve a imagem recortada apenas para quem pediu
    emit('receber_imagem_remota', data, room=data['destinatario'])

# --- ROTAS HTTP ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/identificar', methods=['POST'])
def identificar():
    """Rota de Visão Computacional"""
    try:
        dados = request.json
        # Decodifica Base64
        imagem_data = base64.b64decode(dados['imagem'].split(',')[1])
        np_arr = np.frombuffer(imagem_data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if frame is None: return jsonify({'sucesso': False})

        # Redimensiona se for muito grande para agilizar
        if frame.shape[0] > 800:
            fator = 800 / frame.shape[0]
            frame = cv2.resize(frame, (0,0), fx=fator, fy=fator)

        # Recorte Inteligente
        frame_recortado = recorte_inteligente(frame)
        
        # Detecção
        gray = cv2.cvtColor(frame_recortado, cv2.COLOR_BGR2GRAY)
        kp_frame, des_frame = orb.detectAndCompute(clahe.apply(gray), None)

        if des_frame is None or len(des_frame) < 5:
            return jsonify({'sucesso': False})

        # Matching
        matches = flann.knnMatch(des_frame, k=2)
        
        votos = {}
        bons_matches = {}
        
        # Filtro de Lowe
        for m, n in matches:
            if m.distance < 0.8 * n.distance:
                votos[m.imgIdx] = votos.get(m.imgIdx, 0) + 1
                if m.imgIdx not in bons_matches:
                    bons_matches[m.imgIdx] = []
                bons_matches[m.imgIdx].append(m)
        
        if not votos:
            return jsonify({'sucesso': False})
            
        vencedor = max(votos, key=votos.get)
        
        # Validação mínima
        if votos[vencedor] < 4:
            
            return jsonify({'sucesso': False})
            
        # Homografia para confirmar geometria
        good = bons_matches[vencedor]
        if len(good) > 5:
            src_pts = np.float32([dados_para_homografia[vencedor][m.trainIdx].pt for m in good]).reshape(-1,1,2)
            dst_pts = np.float32([kp_frame[m.queryIdx].pt for m in good]).reshape(-1,1,2)
            
            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 6.0)
            
            if mask is not None:
                matchesMask = mask.ravel().tolist()
                inliers = matchesMask.count(1)
                
                
                if inliers >= 5:
                    arq = nomes_cartas[vencedor]
                    nome_simples = os.path.splitext(arq)[0]
                    # Tenta pegar metadados do JSON, se não usa o nome do arquivo
                    info = METADADOS.get(arq, {"nome": nome_simples})
                    
                    return jsonify({
                        'sucesso': True,
                        'imagem': imagens_b64[vencedor],
                        'dados': info
                    })

        return jsonify({'sucesso': False})

    except Exception as e:
        logging.error(f"Erro no processamento: {e}")
        return jsonify({'sucesso': False})

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)