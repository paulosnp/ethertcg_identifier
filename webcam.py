import cv2
import os

# --- CONFIGURAÇÕES ---
PASTA_BANCO = 'banco_cartas'
MINIMO_MATCHES = 20  
# Tamanho da caixa de mira (300x400 pixels - tamanho de uma carta em pé)
LARGURA_MIRA = 300
ALTURA_MIRA = 420

# 1. SETUP: Carregar a "memória"
print("Carregando banco de cartas na memória...")
orb = cv2.ORB_create(nfeatures=2000)
banco_memoria = []

lista_cartas = os.listdir(PASTA_BANCO)
for arquivo in lista_cartas:
    caminho = os.path.join(PASTA_BANCO, arquivo)
    img = cv2.imread(caminho, 0)
    if img is None: continue
    
    kp, des = orb.detectAndCompute(img, None)
    if des is not None:
        banco_memoria.append((arquivo, des))

print(f"Pronto! {len(banco_memoria)} cartas aprendidas.")

cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret: break

    # Pegar dimensões da tela
    altura_tela, largura_tela, _ = frame.shape
    
    # Calcular o centro da tela para desenhar a mira
    centro_x = int(largura_tela / 2)
    centro_y = int(altura_tela / 2)
    
    # Coordenadas do retângulo da mira
    x1 = int(centro_x - LARGURA_MIRA / 2)
    y1 = int(centro_y - ALTURA_MIRA / 2)
    x2 = int(centro_x + LARGURA_MIRA / 2)
    y2 = int(centro_y + ALTURA_MIRA / 2)

    # --- O TRUQUE MÁGICO ---
    # Recortar APENAS a área da mira para processar (ROI - Region of Interest)
    # O computador vai "ficar cego" para o playmat fora desse quadrado
    recorte_mira = frame[y1:y2, x1:x2]
    
    # Converter só o recorte para cinza
    recorte_gray = cv2.cvtColor(recorte_mira, cv2.COLOR_BGR2GRAY)

    # Detectar características APENAS no recorte
    kp_frame, des_frame = orb.detectAndCompute(recorte_gray, None)

    melhor_match_nome = "..."
    maior_matches = 0

    if des_frame is not None:
        bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        
        for nome_carta, des_carta in banco_memoria:
            try:
                matches = bf.knnMatch(des_carta, des_frame, k=2)
            except:
                continue

            bons_matches = []
            for m, n in matches:
                if m.distance < 0.75 * n.distance:
                    bons_matches.append(m)
            
            qtd_bons = len(bons_matches)

            if qtd_bons > maior_matches:
                maior_matches = qtd_bons
                melhor_match_nome = nome_carta

    # Decisão Visual
    cor_box = (0, 0, 255) # Vermelho (padrão)
    texto_display = "Coloque a carta na mira"

    if maior_matches > MINIMO_MATCHES:
        cor_box = (0, 255, 0) # Verde (Sucesso)
        texto_display = f"{melhor_match_nome} ({maior_matches})"
        
        # Opcional: Remover a extensão .png/.jpg do nome para ficar bonito
        texto_display = texto_display.replace(".jpg", "").replace(".png", "")

    # --- DESENHAR NA TELA ---
    # Desenhar o quadrado da mira no vídeo original
    cv2.rectangle(frame, (x1, y1), (x2, y2), cor_box, 2)
    
    # Escrever o nome em cima da caixa
    cv2.putText(frame, texto_display, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, cor_box, 2)
    
    cv2.imshow('Identificador TCG com Mira', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()