import cv2
import os
import numpy as np

# --- CONFIGURAÇÕES ---
PASTA_BANCO = 'banco_cartas'

# AUMENTEI AQUI: De 22 para 35.
# Se ficar difícil de reconhecer as cartas certas, diminua para 30.
MINIMO_MATCHES = 35 

LARGURA_BOX = 180 
ALTURA_BOX = 260
LARGURA_PIP = 225
ALTURA_PIP = 315 

ponto_clicado = None
modo_scan = False

def mouse_callback(event, x, y, flags, param):
    global ponto_clicado, modo_scan
    if event == cv2.EVENT_LBUTTONDOWN:
        ponto_clicado = (x, y)
        modo_scan = True

# 1. CARREGAR SISTEMA
print("Carregando sistema...")
orb = cv2.ORB_create(nfeatures=2000)
banco_memoria = []

lista_cartas = os.listdir(PASTA_BANCO)
for arquivo in lista_cartas:
    caminho = os.path.join(PASTA_BANCO, arquivo)
    img_color = cv2.imread(caminho)
    if img_color is None: continue
    img_gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
    kp, des = orb.detectAndCompute(img_gray, None)
    if des is not None:
        banco_memoria.append((arquivo, des, img_color))

print(f"Pronto! {len(banco_memoria)} cartas.")

# 2. INICIAR WEBCAM
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)

nome_janela = 'Identificador Clean (Rigoroso)'
cv2.namedWindow(nome_janela)
cv2.setMouseCallback(nome_janela, mouse_callback)

while True:
    ret, frame = cap.read()
    if not ret: break
    h_tela, w_tela, _ = frame.shape

    if modo_scan:
        cx, cy = ponto_clicado
        
        x1 = max(0, int(cx - LARGURA_BOX / 2))
        y1 = max(0, int(cy - ALTURA_BOX / 2))
        x2 = min(w_tela, int(cx + LARGURA_BOX / 2))
        y2 = min(h_tela, int(cy + ALTURA_BOX / 2))

        recorte = frame[y1:y2, x1:x2]
        
        if recorte.size != 0:
            recorte_gray = cv2.cvtColor(recorte, cv2.COLOR_BGR2GRAY)
            kp_frame, des_frame = orb.detectAndCompute(recorte_gray, None)

            maior_matches = 0
            img_vencedora = None 

            if des_frame is not None:
                bf = cv2.BFMatcher(cv2.NORM_HAMMING)
                for nome_carta, des_carta, img_original in banco_memoria:
                    try: matches = bf.knnMatch(des_carta, des_frame, k=2)
                    except: continue
                    bons_matches = []
                    for m, n in matches:
                        if m.distance < 0.75 * n.distance: bons_matches.append(m)
                    
                    if len(bons_matches) > maior_matches:
                        maior_matches = len(bons_matches)
                        img_vencedora = img_original

            # --- EXIBIÇÃO ---
            imagem_display = np.zeros((ALTURA_PIP, LARGURA_PIP, 3), dtype=np.uint8)
            
            # Só entra aqui se tiver MAIS que 35 pontos de certeza
            if maior_matches > MINIMO_MATCHES and img_vencedora is not None:
                imagem_display = cv2.resize(img_vencedora, (LARGURA_PIP, ALTURA_PIP))
            else:
                # Caso contrário, mantém preto com aviso
                cv2.putText(imagem_display, "NAO", (80, int(ALTURA_PIP/2) - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)
                cv2.putText(imagem_display, "IDENTIFICADA", (10, int(ALTURA_PIP/2) + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)

            try:
                frame[0:ALTURA_PIP, 0:LARGURA_PIP] = imagem_display
                cv2.rectangle(frame, (0,0), (LARGURA_PIP, ALTURA_PIP), (255,255,255), 1)
            except:
                pass

    cv2.imshow(nome_janela, frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'): break
    elif key == ord('r'): modo_scan = False

cap.release()
cv2.destroyAllWindows()