# 🔮 Ether TCG Scanner & Duel System

> **Um sistema de duelo online que conecta o mundo físico ao digital.**

O **Ether TCG Scanner** é uma aplicação web que utiliza Visão Computacional (OpenCV) para identificar cartas de Trading Card Games em tempo real através da webcam. Além de identificar as cartas, o sistema permite criar **salas de duelo multiplayer**, onde jogadores podem se ver via vídeo (P2P), compartilhar jogadas e até "espionar" o campo do oponente clicando na tela.

---

## ✨ Funcionalidades Principais

### 👁️ Visão Computacional (OpenCV)
- **Reconhecimento Instantâneo:** Identifica cartas em frações de segundo usando algoritmos ORB/SIFT.
- **Scanner HD:** Funciona com alta precisão mesmo via webcam.
- **Metadados:** Exibe Nome, Tipo, Efeito e Ataque/Defesa da carta identificada.

### ⚔️ Multiplayer & Duelo (Socket.IO + PeerJS)
- **Salas Privadas:** Crie uma sala (ex: "123") e jogue contra um amigo em qualquer lugar do mundo.
- **Videochamada Integrada:** Veja seu oponente em tempo real com áudio e vídeo.
- **Layout Picture-in-Picture (PiP):** Interface inteligente estilo FaceTime/Discord (sua câmera fica pequena, a do oponente grande).
- **Sincronização de Jogadas:** Quando você escaneia uma carta, o nome e a imagem aparecem na tela do seu oponente instantaneamente.

### 🕵️ Modo Espião (Clique Remoto)
- **Interação Real:** Viu uma carta na mesa do oponente que ele não anunciou?
- **Clique para Escanear:** Clique no vídeo do oponente para tirar uma "foto remota" e processar a carta no seu computador.
- **Privacidade:** O sistema recorta a imagem e identifica apenas para você.

### 🎨 Interface Imersiva
- **Tema Dark Fantasy:** Visual inspirado em jogos de RPG (Roxo/Dourado).
- **Cartas 3D:** Efeito de inclinação (Tilt) holográfico ao passar o mouse.
- **Histórico Inteligente:** Salva as últimas cartas jogadas sem duplicatas.

---

## 🛠️ Tecnologias Utilizadas

- **Backend:** Python 3, Flask, OpenCV (cv2), Eventlet.
- **Frontend:** HTML5, CSS3 (Responsivo), JavaScript (Vanilla).
- **Comunicação Real-Time:** Flask-SocketIO (WebSockets).
- **Vídeo P2P:** PeerJS (WebRTC simplificado).
- **Infraestrutura:** Render (Deploy com Gunicorn).

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- Python 3.8+
- Webcam

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/paulosnp/ethertcg_identifier](hhttps://github.com/paulosnp/ethertcg_identifier)
   cd ethertcg-scanner