import cv2
import numpy as np
import os
import base64
import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, emit
import eventlet

# --- CORREÇÃO DE CONFLITO EVENTLET ---
eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'segredo_ether_tcg_master'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# --- CONFIGURAÇÕES ---
PASTA_BANCO = 'banco_cartas'
ARQUIVO_DADOS = 'cartas.json'
MINIMO_VOTOS = 4      
MINIMO_INLIERS = 5    

# --- CARREGAR DADOS ---
METADADOS = {}
if os.path.exists(ARQUIVO_DADOS):
    try:
        with open(ARQUIVO_DADOS, 'r', encoding='utf-8') as f:
            METADADOS = json.load(f)
    except: pass

def ler_imagem_com_acentos(caminho):
    try:
        stream = np.fromfile(caminho, dtype=np.uint8)
        img = cv2.imdecode(stream, cv2.IMREAD_COLOR)
        return img
    except: return None

# --- INDEXAÇÃO ---
if not os.path.exists(PASTA_BANCO): os.makedirs(PASTA_BANCO)
orb = cv2.ORB_create(nfeatures=3000)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
nomes_cartas = []
imagens_b64 = []
descritores_db = []
dados_para_homografia = []

arquivos = os.listdir(PASTA_BANCO)
for arquivo in arquivos:
    caminho = os.path.join(PASTA_BANCO, arquivo)
    img = ler_imagem_com_acentos(caminho)
    if img is None: continue
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    kp, des = orb.detectAndCompute(clahe.apply(gray), None)
    if des is not None:
        nomes_cartas.append(arquivo)
        _, buffer = cv2.imencode('.jpg', img)
        imagens_b64.append(base64.b64encode(buffer).decode('utf-8'))
        dados_para_homografia.append(kp)
        descritores_db.append(des)

index_params = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
search_params = dict(checks=70)
flann = cv2.FlannBasedMatcher(index_params, search_params)
if len(descritores_db) > 0:
    flann.add(descritores_db)
    flann.train()

# --- FUNÇÃO NOVA: RECORTE INTELIGENTE (AUTO-CROP) ---
# --- FUNÇÃO NOVA: RECORTE COM MIRA CENTRAL ---
def recorte_inteligente(img):
    try:
        h_img, w_img = img.shape[:2]
        centro_x, centro_y = w_img // 2, h_img // 2 # O ponto exato onde você clicou

        # 1. Pré-processamento
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 30, 150) # Ajustei sensibilidade
        
        # 2. Dilatação para fechar buracos nas bordas da carta (ajuda se o sleeve brilhar)
        kernel = np.ones((3,3), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=1)

        # 3. Acha contornos
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return img

        melhor_candidato = None
        maior_area = 0

        for c in contours:
            area = cv2.contourArea(c)
            # Ignora ruídos muito pequenos
            if area < (h_img * w_img * 0.05): continue

            # --- A LÓGICA DA PRECISÃO ---
            # Verifica se o ponto central da imagem (seu clique) está DENTRO deste contorno
            # A função pointPolygonTest retorna > 0 se estiver dentro
            if cv2.pointPolygonTest(c, (centro_x, centro_y), False) >= 0:
                if area > maior_area:
                    maior_area = area
                    melhor_candidato = c
        
        # Se nenhum contorno contiver o centro (ex: borda muito falhada),
        # pegamos o contorno mais próximo do centro ou o maior geral (fallback)
        if melhor_candidato is None:
             melhor_candidato = max(contours, key=cv2.contourArea)

        # 4. Recorte final
        x, y, w, h = cv2.boundingRect(melhor_candidato)
        
        # Padding (Margem de segurança)
        pad = 15
        x = max(0, x - pad)
        y = max(0, y - pad)
        w = min(w_img - x, w + 2*pad)
        h = min(h_img - y, h + 2*pad)
        
        print(f"Auto-Crop: Carta detectada no centro. Área: {w}x{h}")
        return img[y:y+h, x:x+w]
        
    except Exception as e:
        print("Erro no Auto-Crop:", e)
        return img
# --- SOCKETS ---
@socketio.on('entrar_sala')
def handle_join(data):
    join_room(data['sala'])
    emit('status_sala', {'msg': 'Conectado'}, room=data['sala'])

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
    emit('receber_chat', data, room=data['sala'])

@socketio.on('atualizar_vida')
def handle_life(data):
    emit('receber_vida', data, room=data['sala'], include_self=False)
    hora_atual = datetime.now().strftime("%H:%M")
    log_data = {
        'remetente': request.sid,
        'alvo_clicado': data['alvo'],
        'delta': data['delta'],
        'valor_final': data['valor'],
        'hora': hora_atual
    }
    emit('log_vida', log_data, room=data['sala'])

# --- ROTAS HTTP ---
@app.route('/')
def index(): return render_template('index.html')

@app.route('/identificar', methods=['POST'])
def identificar():
    try:
        dados = request.json
        np_arr = np.frombuffer(base64.b64decode(dados['imagem'].split(',')[1]), np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None: return jsonify({'sucesso': False})

        # --- AQUI ESTÁ A MÁGICA ---
        # Tenta focar na carta automaticamente antes de processar
        frame_recortado = recorte_inteligente(frame)
        # --------------------------

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
            # Atenção: Homografia aqui é opcional/arriscada no auto-crop, 
            # mas mantivemos a validação de inliers para garantir que não é falso positivo.
            src_pts = np.float32([dados_para_homografia[vencedor][m.trainIdx].pt for m in good]).reshape(-1,1,2)
            dst_pts = np.float32([kp_frame[m.queryIdx].pt for m in good]).reshape(-1,1,2)
            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 6.0)
            
            if mask is not None and mask.ravel().tolist().count(1) >= MINIMO_INLIERS:
                arq = nomes_cartas[vencedor]
                info = METADADOS.get(arq, {"nome": os.path.splitext(arq)[0], "tipo": "?", "especial": "", "efeito": ""})
                return jsonify({'sucesso': True, 'imagem': imagens_b64[vencedor], 'dados': info})
                
        return jsonify({'sucesso': False})
    except Exception as e:
        print("Erro geral:", e)
        return jsonify({'sucesso': False})

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)