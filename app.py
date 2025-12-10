import cv2
import numpy as np
import os
import base64
import json  # <--- NOVO
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# --- CONFIGURAÇÕES ---
PASTA_BANCO = 'banco_cartas'
ARQUIVO_DADOS = 'cartas.json' # <--- ONDE ESTÃO OS DADOS
MINIMO_VOTOS = 4      
MINIMO_INLIERS = 5    

# --- CARREGAR DADOS DAS CARTAS (JSON) ---
METADADOS = {}
if os.path.exists(ARQUIVO_DADOS):
    with open(ARQUIVO_DADOS, 'r', encoding='utf-8') as f:
        METADADOS = json.load(f)
    print(f"Banco de dados carregado: {len(METADADOS)} descrições.")
else:
    print("AVISO: 'cartas.json' não encontrado. Criando vazio.")
    METADADOS = {}

def ler_imagem_com_acentos(caminho):
    try:
        stream = np.fromfile(caminho, dtype=np.uint8)
        img = cv2.imdecode(stream, cv2.IMREAD_COLOR)
        return img
    except: return None

# --- INDEXAÇÃO (Igual ao anterior) ---
print("\n--- INICIANDO SERVIDOR ---")
if not os.path.exists(PASTA_BANCO): os.makedirs(PASTA_BANCO)

orb = cv2.ORB_create(nfeatures=3000)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))

nomes_cartas = []
imagens_b64 = []
descritores_db = []
dados_para_homografia = []

arquivos = os.listdir(PASTA_BANCO)
count = 0

print(f"Lendo imagens...")
for arquivo in arquivos:
    caminho = os.path.join(PASTA_BANCO, arquivo)
    img_color = ler_imagem_com_acentos(caminho)
    if img_color is None: continue

    gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
    gray_clahe = clahe.apply(gray)
    kp, des = orb.detectAndCompute(gray_clahe, None)
    
    if des is not None:
        nomes_cartas.append(arquivo)
        _, buffer = cv2.imencode('.jpg', img_color)
        imagens_b64.append(base64.b64encode(buffer).decode('utf-8'))
        dados_para_homografia.append(kp)
        descritores_db.append(des)
        count += 1
print(f"Sucesso! {count} cartas indexadas.")

index_params = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
search_params = dict(checks=70) 
flann = cv2.FlannBasedMatcher(index_params, search_params)
if len(descritores_db) > 0:
    flann.add(descritores_db)
    flann.train()

# --- SERVIDOR ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/identificar', methods=['POST'])
def identificar():
    try:
        dados = request.json
        imagem_data = dados['imagem'].split(',')[1]
        np_arr = np.frombuffer(base64.b64decode(imagem_data), np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None: return jsonify({'sucesso': False})

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frame_clahe = clahe.apply(gray)
        kp_frame, des_frame = orb.detectAndCompute(frame_clahe, None)

        if des_frame is None or len(des_frame) < 5:
            return jsonify({'sucesso': False, 'msg': 'Sem foco'})

        matches = flann.knnMatch(des_frame, k=2)
        votos_por_carta = {}
        bons_matches_por_carta = {}

        for match_pair in matches:
            if len(match_pair) < 2: continue
            m, n = match_pair
            if m.distance < 0.8 * n.distance:
                id_carta = m.imgIdx
                votos_por_carta[id_carta] = votos_por_carta.get(id_carta, 0) + 1
                if id_carta not in bons_matches_por_carta:
                    bons_matches_por_carta[id_carta] = []
                bons_matches_por_carta[id_carta].append(m)

        if not votos_por_carta: return jsonify({'sucesso': False})

        candidato_vencedor = max(votos_por_carta, key=votos_por_carta.get)
        total_votos = votos_por_carta[candidato_vencedor]
        
        if total_votos < MINIMO_VOTOS: return jsonify({'sucesso': False})

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
                    
                    # Busca dados ou usa padrão se não existir no JSON
                    info = METADADOS.get(arquivo_vencedor, {
                        "nome": os.path.splitext(arquivo_vencedor)[0].replace('_', ' ').title(),
                        "tipo": "Desconhecido",
                        "especial": "Sem habilidade especial.",
                        "efeito": "-"
                    })
                    
                    return jsonify({
                        'sucesso': True,
                        'imagem': imagens_b64[candidato_vencedor],
                        'dados': info
                    })

        return jsonify({'sucesso': False, 'msg': 'Não confirmado'})

    except Exception as e:
        print(f"Erro: {e}")
        return jsonify({'sucesso': False})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)