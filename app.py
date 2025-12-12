import cv2
import numpy as np
import os
import base64
import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit
import eventlet

# Correção para WebSockets
eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'segredo_ether_tcg_master'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# --- ESTADO DAS SALAS ---
# {'sala_id': {'players': [id1, id2], 'specs': [id3, id4...]}}
SALAS = {}

# --- CONFIGURAÇÕES DE ARQUIVOS ---
PASTA_BANCO = 'banco_cartas'
ARQUIVO_DADOS = 'cartas.json'
MINIMO_VOTOS = 4      
MINIMO_INLIERS = 5    

# --- 1. CARREGAR METADADOS (JSON) ---
METADADOS = {}
if os.path.exists(ARQUIVO_DADOS):
    try:
        with open(ARQUIVO_DADOS, 'r', encoding='utf-8') as f:
            METADADOS = json.load(f)
    except:
        print("Aviso: cartas.json não encontrado ou inválido.")

# --- 2. FUNÇÃO AUXILIAR PARA LER IMAGENS ---
def ler_imagem_com_acentos(caminho):
    try:
        # Lê o arquivo como bytes e decodifica (resolve problemas de acento no Windows)
        stream = np.fromfile(caminho, dtype=np.uint8)
        img = cv2.imdecode(stream, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Erro ao ler imagem {caminho}: {e}")
        return None

# --- 3. INDEXAÇÃO DAS CARTAS (ORB) ---
# Esta parte é CRÍTICA. Se falhar, o scanner não funciona.
if not os.path.exists(PASTA_BANCO):
    os.makedirs(PASTA_BANCO)

orb = cv2.ORB_create(nfeatures=3000)
# CLAHE melhora o contraste para identificar cartas foil/escuras
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))

nomes_cartas = []
imagens_b64 = []
descritores_db = []
dados_para_homografia = []

print("--- INICIANDO INDEXAÇÃO DAS CARTAS ---")
arquivos = os.listdir(PASTA_BANCO)
for arquivo in arquivos:
    caminho = os.path.join(PASTA_BANCO, arquivo)
    img = ler_imagem_com_acentos(caminho)
    
    if img is None:
        continue
    
    # Prepara imagem para o banco
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    kp, des = orb.detectAndCompute(clahe.apply(gray), None)
    
    if des is not None:
        nomes_cartas.append(arquivo)
        
        # Salva imagem base64 para enviar ao frontend
        _, buffer = cv2.imencode('.jpg', img)
        imagens_b64.append(base64.b64encode(buffer).decode('utf-8'))
        
        # Salva dados matemáticos para comparação
        dados_para_homografia.append(kp)
        descritores_db.append(des)

# Treina o comparador FLANN
index_params = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
search_params = dict(checks=70)
flann = cv2.FlannBasedMatcher(index_params, search_params)

if len(descritores_db) > 0:
    flann.add(descritores_db)
    flann.train()
    print(f"--- SUCESSO: {len(descritores_db)} cartas indexadas! ---")
else:
    print("--- AVISO: Nenhuma carta encontrada em 'banco_cartas' ---")

# --- 4. FUNÇÃO DE RECORTE INTELIGENTE (AUTO-CROP) ---
def recorte_inteligente(img):
    try:
        h_img, w_img = img.shape[:2]
        centro_x, centro_y = w_img // 2, h_img // 2 

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 30, 150)
        
        # Dilatação fecha buracos
        kernel = np.ones((3,3), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=1)

        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return img

        melhor_candidato = None
        maior_area = 0

        for c in contours:
            area = cv2.contourArea(c)
            if area < (h_img * w_img * 0.05): continue

            # Verifica se o clique (centro) está dentro do contorno
            if cv2.pointPolygonTest(c, (centro_x, centro_y), False) >= 0:
                if area > maior_area:
                    maior_area = area
                    melhor_candidato = c
        
        if melhor_candidato is None:
             melhor_candidato = max(contours, key=cv2.contourArea)

        x, y, w, h = cv2.boundingRect(melhor_candidato)
        pad = 15
        x = max(0, x - pad); y = max(0, y - pad)
        w = min(w_img - x, w + 2*pad); h = min(h_img - y, h + 2*pad)
        
        return img[y:y+h, x:x+w]
        
    except Exception as e:
        print("Erro no Auto-Crop:", e)
        return img

# --- 5. LÓGICA DE SOCKETS E SALAS ---

def emitir_contagem_specs(room):
    if room in SALAS:
        count = len(SALAS[room]['specs'])
        emit('update_specs_count', {'count': count}, room=room)

@socketio.on('entrar_sala')
def handle_join(data):
    room = data['sala']
    sid = request.sid
    join_room(room)

    if room not in SALAS:
        SALAS[room] = {'players': [], 'specs': []}

    role = 'spectator'
    if len(SALAS[room]['players']) < 2:
        SALAS[room]['players'].append(sid)
        role = 'player'
    else:
        SALAS[room]['specs'].append(sid)
    
    emit('configurar_papel', {'role': role, 'sala': room})
    emit('status_sala', {'msg': f'Entrou como {role}'}, room=room)
    emitir_contagem_specs(room)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    sala_afetada = None
    for room in SALAS:
        if sid in SALAS[room]['players']:
            SALAS[room]['players'].remove(sid)
            sala_afetada = room
        elif sid in SALAS[room]['specs']:
            SALAS[room]['specs'].remove(sid)
            sala_afetada = room
    if sala_afetada:
        emitir_contagem_specs(sala_afetada)

@socketio.on('aviso_peer_id')
def handle_peer_id(data):
    emit('novo_peer_na_sala', data, room=data['sala'], include_self=False)

@socketio.on('jogar_carta')
def handle_play(data):
    emit('oponente_jogou', data, room=data['sala'], include_self=False)

@socketio.on('pedido_scan_remoto')
def handle_scan_req(data):
    emit('executar_crop_local', data, room=data['sala'], include_self=False)

@socketio.on('devolver_scan_remoto')
def handle_scan_res(data):
    emit('receber_imagem_remota', data, room=data['destinatario'])

@socketio.on('enviar_chat')
def handle_chat(data):
    room = data['sala']
    tipo = data.get('tipo', 'duel')
    sid = request.sid
    is_spectator = sid in SALAS.get(room, {}).get('specs', [])
    
    # Espectador não fala no chat de duelo
    if tipo == 'duel' and is_spectator: return 
    
    emit('receber_chat', data, room=room)

@socketio.on('atualizar_vida')
def handle_life(data):
    emit('receber_vida', data, room=data['sala'], include_self=False)
    hora = datetime.now().strftime("%H:%M")
    log = {'remetente': request.sid, 'alvo_clicado': data['alvo'], 'delta': data['delta'], 'valor_final': data['valor'], 'hora': hora}
    emit('log_vida', log, room=data['sala'])

# --- 6. ROTAS HTTP E SCANNER ---

@app.route('/')
def index(): return render_template('index.html')

@app.route('/identificar', methods=['POST'])
def identificar():
    try:
        dados = request.json
        np_arr = np.frombuffer(base64.b64decode(dados['imagem'].split(',')[1]), np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None: return jsonify({'sucesso': False})

        # Recorte Inteligente
        frame_recortado = recorte_inteligente(frame)

        gray = cv2.cvtColor(frame_recortado, cv2.COLOR_BGR2GRAY)
        kp_frame, des_frame = orb.detectAndCompute(clahe.apply(gray), None)

        if des_frame is None or len(des_frame) < 5: return jsonify({'sucesso': False})

        matches = flann.knnMatch(des_frame, k=2)
        votos = {}
        bons_matches = {}

        for m, n in matches:
            if m.distance < 0.8 * n.distance:
                votos[m.imgIdx] = votos.get(m.imgIdx, 0) + 1
                if m.imgIdx not in bons_matches: bons_matches[m.imgIdx] = []
                bons_matches[m.imgIdx].append(m)

        if not votos: return jsonify({'sucesso': False})
        
        vencedor = max(votos, key=votos.get)
        if votos[vencedor] < MINIMO_VOTOS: return jsonify({'sucesso': False})

        good = bons_matches[vencedor]
        if len(good) > 5:
            # Validação geométrica
            src_pts = np.float32([dados_para_homografia[vencedor][m.trainIdx].pt for m in good]).reshape(-1,1,2)
            dst_pts = np.float32([kp_frame[m.queryIdx].pt for m in good]).reshape(-1,1,2)
            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 6.0)
            
            if mask is not None and mask.ravel().tolist().count(1) >= MINIMO_INLIERS:
                arq = nomes_cartas[vencedor]
                info = METADADOS.get(arq, {"nome": os.path.splitext(arq)[0]})
                return jsonify({'sucesso': True, 'imagem': imagens_b64[vencedor], 'dados': info})
                
        return jsonify({'sucesso': False})
    except Exception as e:
        print("Erro no servidor:", e)
        return jsonify({'sucesso': False})

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)