# 🃏 TCG Card Identifier (Computer Vision)

Um sistema de identificação de cartas para TCGs (Trading Card Games) em tempo real via webcam, similar à tecnologia utilizada no *SpellTable*.

O projeto utiliza **Visão Computacional** (OpenCV) e algoritmos de **Feature Matching (ORB)** para identificar cartas jogadas na mesa, mesmo a uma certa distância, e exibir a versão digital em alta resolução na tela (Picture-in-Picture).

![Screenshot do Projeto](screenshot.png)
*(Se você tiver um print do projeto, salve como screenshot.png na raiz e ele aparecerá aqui)*

## 🚀 Funcionalidades

-   **Identificação por Clique:** O usuário clica na carta na transmissão da webcam para focar a análise.
-   **Picture-in-Picture (PIP):** Exibe a imagem digital da carta em alta resolução no canto da tela quando identificada.
-   **Feedback Visual Claro:**
    -   Mostra a carta digital quando o "Match" é confirmado.
    -   Mostra tela preta com aviso "NÃO IDENTIFICADA" caso a confiança seja baixa.
-   **Interface "Clean":** Sem poluição visual (caixas ou textos) sobre a mesa de jogo até que o usuário interaja.
-   **Calibrado para "Table Distance":** Otimizado para identificar cartas que estão na mesa (longe da câmera) usando recorte dinâmico e resolução HD.

## 🛠️ Tecnologias Utilizadas

-   **Python 3.x**
-   **OpenCV (cv2):** Processamento de imagem e algoritmo ORB.
-   **NumPy:** Manipulação de matrizes de imagem.

## 📦 Instalação

1.  Clone este repositório:
    ```bash
    git clone [https://github.com/SEU_USUARIO/NOME_DO_REPO.git](https://github.com/SEU_USUARIO/NOME_DO_REPO.git)
    cd NOME_DO_REPO
    ```

2.  Instale as dependências:
    ```bash
    pip install -r requirements.txt
    ```
    *Ou instale manualmente: `pip install opencv-python numpy`*

3.  **Prepare o Banco de Imagens:**
    -   Crie uma pasta chamada `banco_cartas` na raiz do projeto.
    -   Coloque as imagens `.jpg` ou `.png` das cartas que você quer identificar.
    -   *Dica: Use imagens apenas da arte ou da carta completa sem bordas para melhor precisão.*

## 🎮 Como Usar

1.  Execute o script principal:
    ```bash
    python main.py
    ```
    *(Substitua main.py pelo nome do seu arquivo, ex: webcam_clean.py)*

2.  A webcam será aberta.
3.  **Para identificar uma carta:** Clique com o botão esquerdo do mouse sobre o centro de uma carta na mesa.
4.  **Para resetar:** Pressione a tecla `R` para limpar a seleção e clicar em outra carta.
5.  **Para sair:** Pressione a tecla `Q`.

## ⚙️ Configuração e Ajustes

Você pode ajustar a sensibilidade do sistema alterando as variáveis no início do código:

```python
# Aumente este valor se o sistema estiver identificando cartas erradas (Ex: 35, 40)
# Diminua se ele não estiver reconhecendo nada (Ex: 25, 20)
MINIMO_MATCHES = 35 

# Tamanho da área de recorte ao redor do clique (em pixels)
LARGURA_BOX = 180 
ALTURA_BOX = 260
