import cv2
import numpy as np
import os
import base64
import json
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__)
# Chave de segurança para criptografar as sessões do SocketIO
app.config['SECRET_KEY'] = 'segredo_ether_tcg_master'
# cors_allowed_origins="*" libera conexão de qualquer lugar (útil para testes locais)
socketio = SocketIO(app, cors_allowed_origins="*")

# --- CONFIGURAÇÕES DO SISTEMA ---
PASTA_BANCO = 'banco_cartas'
ARQUIVO_DADOS = 'cartas.json'

# Calibragem (Ajustada para a carta Sangue/Rastejante)
MINIMO_VOTOS = 4      # Candidatos fracos entram na disputa
MINIMO_INLIERS = 5    # Geometria flexível para aceitar variações de luz

# --- 1. CARREGAR DADOS (TEXTOS DAS CARTAS) ---
METADADOS = {}
if os.path.exists(ARQUIVO_DADOS):
    try:
        with open(ARQUIVO_DADOS, 'r', encoding='utf-8') as f:
            METADADOS = json.load(f)
        print(f"Banco de dados carregado: {len(METADADOS)} descrições encontradas.")
    except Exception as e:
        print(f"Erro ao ler JSON: {e}")
else:
    print("AVISO: 'cartas.json' não encontrado. O sistema usará textos padrão.")

# --- FUNÇÃO AUXILIAR: LER IMAGEM COM ACENTOS ---
def ler_imagem_com_acentos(caminho):
    try:
        # Corrige erro do OpenCV com 'ç', 'ã', etc no Windows
        stream = np.fromfile(caminho, dtype=np.uint8)
        img = cv2.imdecode(stream, cv2.IMREAD_COLOR)
        return img
    except: return None

# --- 2. INDEXAÇÃO (BOOT DO SERVIDOR) ---
print("\n--- INICIANDO SISTEMA ETHER TCG ---")
if not os.path.exists(PASTA_BANCO): os.makedirs(PASTA_BANCO)

# Configuração Otimizada (Balanced HD)
# 3000 features é o ponto ideal entre velocidade e precisão
orb = cv2.ORB_create(nfeatures=3000)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))

nomes_cartas = []
imagens_b64 = []
descritores_db = []
dados_para_homografia = []

arquivos = os.listdir(PASTA_BANCO)
count = 0

print(f"Indexando imagens da pasta '{PASTA_BANCO}'...")

for arquivo in arquivos:
    caminho = os.path.join(PASTA_BANCO, arquivo)
    
    img_color = ler_imagem_com_acentos(caminho)
    if img_color is None: 
        continue

    # Processamento em Alta Resolução (Sem resize para não perder detalhes)
    gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
    gray_clahe = clahe.apply(gray)
    kp, des = orb.detectAndCompute(gray_clahe, None)
    
    if des is not None:
        nomes_cartas.append(arquivo)
        
        # Prepara a imagem bonita para devolver ao site
        _, buffer = cv2.imencode('.jpg', img_color)
        imagens_b64.append(base64.b64encode(buffer).decode('utf-8'))
        
        # Guarda dados matemáticos
        dados_para_homografia.append(kp)
        descritores_db.append(des)
        count += 1

print(f"Sucesso! {count} cartas prontas para duelo.")

# --- TREINAMENTO DO FLANN (BUSCA RÁPIDA) ---
index_params = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
search_params = dict(checks=70) # 70 checks é rápido e preciso
flann = cv2.FlannBasedMatcher(index_params, search_params)

if len(descritores_db) > 0:
    flann.add(descritores_db)
    flann.train()

# --- 3. EVENTOS WEBSOCKET (MULTIPLAYER) ---

@socketio.on('entrar_sala')
def handle_join(data):
    sala = data['sala']
    join_room(sala)
    print(f">> Jogador entrou na sala: {sala}")
    emit('status_sala', {'msg': f'Conectado à sala {sala}'}, room=sala)

@socketio.on('jogar_carta')
def handle_play_card(data):
    sala = data['sala']
    nome_carta = data['nome']
    print(f">> Carta jogada na sala {sala}: {nome_carta}")
    
    # Envia para todos na sala (exceto quem enviou, se include_self=False)
    # Mas aqui queremos que o oponente receba.
    emit('oponente_jogou', data, room=sala, include_self=False)

# --- NOVOS EVENTOS PARA VÍDEO E ESPIONAGEM ---

@socketio.on('aviso_peer_id')
def handle_peer_id(data):
    # Um usuário manda o ID de vídeo dele pra sala. 
    # O servidor avisa todo mundo: "Ei, o ID de vídeo do fulano é X"
    sala = data['sala']
    emit('novo_peer_na_sala', data, room=sala, include_self=False)

@socketio.on('pedido_scan_remoto')
def handle_scan_request(data):
    # Jogador A clicou na tela do Jogador B.
    # O servidor encaminha o pedido para a sala (mas só B vai processar)
    sala = data['sala']
    emit('executar_crop_local', data, room=sala, include_self=False)

@socketio.on('devolver_scan_remoto')
def handle_return_scan(data):
    # Jogador B cortou a imagem e mandou de volta.
    # O servidor entrega EXCLUSIVAMENTE para o Jogador A (destinatario).
    # Usamos o ID do socket (request.sid) para mandar privado.
    emit('receber_imagem_remota', data, room=data['destinatario'])    

# --- 4. ROTAS HTTP (SITE) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/identificar', methods=['POST'])
def identificar():
    try:
        # Recebe imagem da câmera
        dados = request.json
        imagem_data = dados['imagem'].split(',')[1]
        np_arr = np.frombuffer(base64.b64decode(imagem_data), np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None: return jsonify({'sucesso': False})

        # Processamento da imagem recebida
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frame_clahe = clahe.apply(gray)
        kp_frame, des_frame = orb.detectAndCompute(frame_clahe, None)

        if des_frame is None or len(des_frame) < 5:
            return jsonify({'sucesso': False, 'msg': 'Sem foco'})

        # Busca no banco
        matches = flann.knnMatch(des_frame, k=2)

        votos_por_carta = {}
        bons_matches_por_carta = {}

        for match_pair in matches:
            if len(match_pair) < 2: continue
            m, n = match_pair
            
            # Ratio Test (0.8 para aceitar variações)
            if m.distance < 0.8 * n.distance:
                id_carta = m.imgIdx
                votos_por_carta[id_carta] = votos_por_carta.get(id_carta, 0) + 1
                
                if id_carta not in bons_matches_por_carta:
                    bons_matches_por_carta[id_carta] = []
                bons_matches_por_carta[id_carta].append(m)

        if not votos_por_carta: return jsonify({'sucesso': False})

        # Vencedor
        candidato_vencedor = max(votos_por_carta, key=votos_por_carta.get)
        total_votos = votos_por_carta[candidato_vencedor]
        
        # Filtro de votos mínimos
        if total_votos < MINIMO_VOTOS: return jsonify({'sucesso': False})

        # Prova Real (Homografia)
        good_matches = bons_matches_por_carta[candidato_vencedor]
        if len(good_matches) > 5:
            kp_banco = dados_para_homografia[candidato_vencedor]
            src_pts = np.float32([ kp_banco[m.trainIdx].pt for m in good_matches ]).reshape(-1,1,2)
            dst_pts = np.float32([ kp_frame[m.queryIdx].pt for m in good_matches ]).reshape(-1,1,2)
            
            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 6.0)

            if mask is not None:
                inliers = mask.ravel().tolist().count(1)
                
                if inliers >= MINIMO_INLIERS:
                    arquivo_vencedor = nomes_cartas[candidato_vencedor]
                    
                    # Recupera metadados do JSON
                    info = METADADOS.get(arquivo_vencedor, {
                        "nome": os.path.splitext(arquivo_vencedor)[0].replace('_', ' ').title(),
                        "tipo": "Desconhecido",
                        "especial": "Sem dados no JSON.",
                        "efeito": "-"
                    })
                    
                    return jsonify({
                        'sucesso': True,
                        'imagem': imagens_b64[candidato_vencedor],
                        'dados': info
                    })

        return jsonify({'sucesso': False, 'msg': 'Não confirmado'})

    except Exception as e:
        print(f"Erro Fatal: {e}")
        return jsonify({'sucesso': False})

# --- INICIALIZAÇÃO COM SOCKETIO ---
if __name__ == '__main__':
    # Usamos socketio.run em vez de app.run para habilitar o WebSocket
    print("Servidor Online em: http://localhost:5000")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)