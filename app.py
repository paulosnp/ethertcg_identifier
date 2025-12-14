import eventlet
from dotenv import load_dotenv
load_dotenv()
import logging
eventlet.monkey_patch()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit
import os
import cv2
import numpy as np
import base64
import json
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fallback_secret_key_para_dev')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# --- DADOS GLOBAIS ---
LOBBY_ROOMS = {}
for i in range(1, 11):
    room_id = f"mesa_{i}"
    LOBBY_ROOMS[room_id] = {"name": f"Arena {i:02d}", "players": []}

SID_MAP = {}
SALAS = {}

# --- VISÃO COMPUTACIONAL (MANTIDA IGUAL) ---
PASTA_BANCO = 'banco_cartas'
ARQUIVO_DADOS = 'cartas.json'
METADADOS = {}

if os.path.exists(ARQUIVO_DADOS):
    try:
        with open(ARQUIVO_DADOS, 'r', encoding='utf-8') as f: METADADOS = json.load(f)
    except Exception as e: logging.error(f"Erro: {e}")

if not os.path.exists(PASTA_BANCO): os.makedirs(PASTA_BANCO)

orb = cv2.ORB_create(nfeatures=1000)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
nomes_cartas = []
imagens_b64 = []
descritores_db = []
dados_para_homografia = []

# Indexação
if os.path.exists(PASTA_BANCO):
    for arquivo in os.listdir(PASTA_BANCO):
        try:
            path = os.path.join(PASTA_BANCO, arquivo)
            stream = np.fromfile(path, dtype=np.uint8)
            img = cv2.imdecode(stream, cv2.IMREAD_COLOR)
            if img is None: continue
            
            h, w = img.shape[:2]
            if h > 600:
                fator = 600 / h
                img = cv2.resize(img, (int(w * fator), 600), interpolation=cv2.INTER_AREA)

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            kp, des = orb.detectAndCompute(clahe.apply(gray), None)
            
            if des is not None:
                nomes_cartas.append(arquivo)
                _, buffer = cv2.imencode('.jpg', img)
                imagens_b64.append(base64.b64encode(buffer).decode('utf-8'))
                descritores_db.append(des)
                dados_para_homografia.append(kp)
        except Exception as e: logging.error(f"Erro: {e}")

index_params = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
search_params = dict(checks=50)
flann = cv2.FlannBasedMatcher(index_params, search_params)
if len(descritores_db) > 0: flann.add(descritores_db); flann.train()

def recorte_inteligente(img):
    try:
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 30, 150)
        kernel = np.ones((3,3), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours: return img
        
        c = max(contours, key=cv2.contourArea)
        x, y, w_c, h_c = cv2.boundingRect(c)
        pad = 10
        x=max(0,x-pad); y=max(0,y-pad); w_c=min(w-x,w_c+2*pad); h_c=min(h-y,h_c+2*pad)
        return img[y:y+h_c, x:x+w_c]
    except Exception as e: logging.warning(f"Erro no recorte inteligente: {e}"); return img

# --- AUXILIARES OTIMIZADOS ---
def get_sala_state(rid):
    if rid not in SALAS:
        SALAS[rid] = {
            'p1': {'sid': None, 'nick': 'Vazio', 'hp': 20, 'peer_id': None},
            'p2': {'sid': None, 'nick': 'Vazio', 'hp': 20, 'peer_id': None}
            # Removido: 'specs': []
        }
    return SALAS[rid]

def update_lobby():
    data = {}
    for rid, r in LOBBY_ROOMS.items():
        st = SALAS.get(rid)
        nicks = []
        if st:
            if st['p1']['sid']: nicks.append(st['p1']['nick'])
            if st['p2']['sid']: nicks.append(st['p2']['nick'])
        else:
            nicks = r['players'] # Fallback para o estado inicial
        
        data[rid] = {"name": r["name"], "count": len(nicks), "nicks": nicks}
    socketio.emit('lobby_update', data)

def broadcast_game_state(rid):
    st = get_sala_state(rid)
    payload = {
        'p1': st['p1'],
        'p2': st['p2']
    }
    socketio.emit('atualizar_estado_jogo', payload, room=rid)

# --- SOCKET EVENTS ---
@socketio.on('connect')
def on_connect(): update_lobby()

@socketio.on('entrar_sala')
def on_join(data):
    room = data['sala']
    nick = data.get('nickname', 'Player')
    sid = request.sid
    
    st = get_sala_state(room)
    my_slot = None
    
    # Lógica de Vagas Restrita (Bouncer)
    if st['p1']['sid'] is None:
        my_slot = 'p1'
    elif st['p2']['sid'] is None:
        my_slot = 'p2'
    else:
        # SALA CHEIA - REJEITA CONEXÃO
        emit('erro_sala_cheia', {'msg': 'Sala Cheia!'}, room=sid)
        return

    join_room(room)
    st[my_slot].update({'sid': sid, 'nick': nick})
    
    SID_MAP[sid] = {'sala': room, 'nick': nick, 'slot': my_slot}
    
    # Atualiza lista do lobby global
    if nick not in LOBBY_ROOMS[room]['players']:
        LOBBY_ROOMS[room]['players'].append(nick)
            
    update_lobby()
    emit('configurar_papel', {'slot': my_slot}, room=sid)
    broadcast_game_state(room)

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    if sid in SID_MAP:
        user = SID_MAP[sid]
        room = user['sala']
        slot = user['slot']
        st = get_sala_state(room)
        
        # Só precisamos limpar slots de jogadores reais
        if slot in ['p1', 'p2']:
            st[slot].update({'sid': None, 'nick': 'Vazio', 'peer_id': None})
            if user['nick'] in LOBBY_ROOMS[room]['players']:
                try: LOBBY_ROOMS[room]['players'].remove(user['nick'])
                except Exception as e: logging.error(f"Erro: {e}")
            
        del SID_MAP[sid]
        update_lobby()
        broadcast_game_state(room)

@socketio.on('aviso_peer_id')
def on_peer(data):
    room = data['sala']; peer_id = data['peerId']; sid = request.sid
    st = get_sala_state(room)
    # Validação extra de segurança
    if st['p1']['sid'] == sid: st['p1']['peer_id'] = peer_id
    elif st['p2']['sid'] == sid: st['p2']['peer_id'] = peer_id
    broadcast_game_state(room)

@socketio.on('atualizar_vida')
def on_life(data):
    room = data['sala']; target = data['target_slot']; delta = data['delta']
    st = get_sala_state(room)
    
    # Apenas update se o slot alvo existir
    if target in ['p1', 'p2']:
        st[target]['hp'] = max(0, min(999, st[target]['hp'] + delta))
        
        try: autor = SID_MAP[request.sid]['nick']
        except: autor = "?"
        
        broadcast_game_state(room)
        hora = datetime.now().strftime("%H:%M")
        emit('log_vida', {'texto': f"{autor} > {st[target]['nick']}: {delta} HP", 'hora': hora}, room=room)

@socketio.on('enviar_chat')
def on_chat(data): 
    # Chat simplificado, sem filtro de spec
    emit('receber_chat', data, room=data['sala'])

@socketio.on('jogar_carta')
def on_play(data): emit('oponente_jogou', data, room=data['sala'], include_self=False)

@socketio.on('pedido_scan_remoto')
def on_scan(data): emit('executar_crop_local', data, room=data['sala'], include_self=False)

@socketio.on('devolver_scan_remoto')
def on_scan_res(data): emit('receber_imagem_remota', data, room=data['destinatario'])

@app.route('/')
def index(): return render_template('index.html')

@app.route('/identificar', methods=['POST'])
def identificar():
    # Lógica de identificação mantida idêntica
    try:
        if len(descritores_db) == 0: return jsonify({'sucesso': False})
        d = request.json
        b64 = d['imagem'].split(',')[1] if ',' in d['imagem'] else d['imagem']
        np_arr = np.frombuffer(base64.b64decode(b64), np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None: return jsonify({'sucesso': False})
        if frame.shape[0] > 800:
            f = 800 / frame.shape[0]
            frame = cv2.resize(frame, (0,0), fx=f, fy=f)
        
        frame = recorte_inteligente(frame)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        kp, des = orb.detectAndCompute(clahe.apply(gray), None)
        if des is None or len(des) < 5: return jsonify({'sucesso': False})
        
        matches = flann.knnMatch(des, k=2)
        votos = {}
        for m, n in matches:
            if m.distance < 0.8 * n.distance:
                votos[m.imgIdx] = votos.get(m.imgIdx, 0) + 1
        
        if not votos: return jsonify({'sucesso': False})
        winner = max(votos, key=votos.get)
        if votos[winner] < 4: return jsonify({'sucesso': False})
        
        return jsonify({
            'sucesso': True,
            'imagem': imagens_b64[winner],
            'dados': METADADOS.get(nomes_cartas[winner], {"nome": os.path.splitext(nomes_cartas[winner])[0]})
        })
    except Exception as e: logging.error(f"Erro na identificação: {e}"); return jsonify({'sucesso': False})

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)