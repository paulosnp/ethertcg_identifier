import cv2
import os

# --- CONFIGURAÇÕES ---
PASTA_BANCO = 'banco_cartas'
CAMINHO_TESTE = 'foto_teste/teste.jpg'
MINIMO_MATCHES = 15

def encontrar_carta():
    img_teste = cv2.imread(CAMINHO_TESTE, 0)
    if img_teste is None:
        print("Erro: Imagem de teste não encontrada.")
        return

    # Aumentei o número de pontos buscados para 2000 para tentar achar mais detalhes
    orb = cv2.ORB_create(nfeatures=2000)
    kp1, des1 = orb.detectAndCompute(img_teste, None)
    
    melhor_match_nome = "Nenhuma"
    maior_numero_matches = 0
    melhores_matches_dados = None
    melhor_img_banco = None
    melhor_kp2 = None

    print(f"--- Iniciando varredura ---")
    lista_cartas = os.listdir(PASTA_BANCO)
    
    for arquivo_carta in lista_cartas:
        caminho_completo = os.path.join(PASTA_BANCO, arquivo_carta)
        img_banco = cv2.imread(caminho_completo, 0)
        if img_banco is None: continue

        kp2, des2 = orb.detectAndCompute(img_banco, None)

        # Usando KNN para comparar
        bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        matches = bf.knnMatch(des1, des2, k=2)

        # Filtragem (Lowe's Ratio Test)
        bons_matches = []
        for m, n in matches:
            if m.distance < 0.75 * n.distance:
                bons_matches.append(m)
        
        numero_matches = len(bons_matches)
        print(f"Comparando com {arquivo_carta}: {numero_matches} matches.")

        if numero_matches > maior_numero_matches:
            maior_numero_matches = numero_matches
            melhor_match_nome = arquivo_carta
            # Salvamos os dados do "vencedor" para desenhar depois
            melhores_matches_dados = bons_matches
            melhor_img_banco = img_banco
            melhor_kp2 = kp2

    print("\n" + "="*30)
    print(f"VENCEDOR: {melhor_match_nome} com {maior_numero_matches} matches.")
    
    # --- PARTE NOVA: GERAR IMAGEM DE DEBUG ---
    if melhor_img_banco is not None:
        print("Gerando imagem de diagnóstico 'debug_match.jpg'...")
        img_matches = cv2.drawMatches(
            img_teste, kp1, 
            melhor_img_banco, melhor_kp2, 
            melhores_matches_dados, None, 
            flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
        )
        cv2.imwrite('debug_match.jpg', img_matches)
        print("Imagem salva na pasta do projeto!")
    print("="*30)

if __name__ == "__main__":
    encontrar_carta()