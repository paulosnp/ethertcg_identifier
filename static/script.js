// ======================================================
// 1. REFERÊNCIAS DO DOM
// ======================================================
// Vídeos e Canvas
const video = document.getElementById('videoInput');
const remoteVideo = document.getElementById('remoteVideo');
const remoteWrapper = document.getElementById('remote-wrapper');
const localWrapper = document.querySelector('.video-wrapper.local');
const canvas = document.getElementById('canvasHidden');
const ctx = canvas.getContext('2d');

// HUD Principal (Carta em Destaque)
const resultImg = document.getElementById('result-img');
const resultText = document.getElementById('result-text');
const spinner = document.getElementById('loading');
const resultBox = document.getElementById('result-box');
const historyList = document.getElementById('history-list');

// Painel de Detalhes (Texto da Carta)
const detailPanel = document.getElementById('card-details');
const typeText = document.getElementById('card-type');
const specialText = document.getElementById('card-special');
const effectText = document.getElementById('card-effect');

// Interface de Sala e Login (NOVOS)
const loginPanel = document.getElementById('login-panel');
const roomInput = document.getElementById('room-input');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');

// ======================================================
// 2. CONFIGURAÇÕES GLOBAIS
// ======================================================
const CROP_W = 500;
const CROP_H = 700;

// Inicializa Socket.IO
const socket = io();

// Variáveis de Controle
let peer = null;       // Objeto de Vídeo P2P
let myPeerId = null;   // Meu ID
let salaAtual = "";
let isLocalMain = true; // Controla o Layout (Quem é grande/pequeno)

// ======================================================
// 3. VÍDEO P2P (PEERJS)
// ======================================================

function iniciarVideoCall() {
    // Cria identidade de vídeo
    peer = new Peer(); 

    peer.on('open', (id) => {
        myPeerId = id;
        console.log("Meu Peer ID:", id);
    });

    // Quando alguém me liga
    peer.on('call', (call) => {
        call.answer(video.srcObject); // Atende enviando meu vídeo
        
        call.on('stream', (remoteStream) => {
            mostrarVideoOponente(remoteStream);
        });
    });
}

function mostrarVideoOponente(stream) {
    if (remoteVideo) {
        remoteVideo.srcObject = stream;
        
        // Lógica Automática: Oponente chega e vira destaque (Full)
        // Você vai para o cantinho (PiP)
        isLocalMain = false; 
        atualizarLayout();
    }
}

// ======================================================
// 4. CONTROLE DE LAYOUT (PICTURE-IN-PICTURE)
// ======================================================

function atualizarLayout() {
    // Limpa classes antigas
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');

    if (isLocalMain) {
        // MODO 1: Eu sou Grande (Fundo)
        if (localWrapper) localWrapper.classList.add('video-full');
        
        // Oponente é Pequeno (PiP), se existir
        if (remoteVideo.srcObject && remoteWrapper) {
            remoteWrapper.classList.add('video-pip');
            remoteWrapper.style.display = 'flex';
        } else if (remoteWrapper) {
            remoteWrapper.style.display = 'none';
        }
    } else {
        // MODO 2: Oponente é Grande (Fundo)
        if (remoteWrapper) {
            remoteWrapper.classList.add('video-full');
            remoteWrapper.style.display = 'flex';
        }
        // Eu sou Pequeno (PiP)
        if (localWrapper) localWrapper.classList.add('video-pip');
    }
}

function toggleLayout() {
    // Só troca se tiver vídeo remoto conectado
    if (!remoteVideo.srcObject) return;
    isLocalMain = !isLocalMain;
    atualizarLayout();
}

// ======================================================
// 5. SALAS, LOGIN E UI (ATUALIZADO)
// ======================================================

function conectarSala() {
    if (!roomInput || roomInput.value.trim() === "") {
        alert("Digite o número da sala!");
        return;
    }
    
    salaAtual = roomInput.value.trim();
    
    // Conecta no Socket
    socket.emit('entrar_sala', { sala: salaAtual });

    // --- ANIMAÇÃO DE UI ---
    // 1. Esconde o painel de login na barra lateral
    if (loginPanel) {
        loginPanel.style.opacity = '0';
        setTimeout(() => {
            loginPanel.style.display = 'none';
        }, 500);
    }

    // 2. Mostra o status flutuante lá embaixo
    if (statusOverlay) {
        statusOverlay.style.display = 'flex';
        if (statusText) statusText.innerText = "CONECTANDO...";
    }

    // 3. Avisa o PeerID para vídeo (com delay de segurança)
    setTimeout(() => {
        if (myPeerId) {
            socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId });
        }
    }, 1000);
}

// Resposta do servidor sobre a sala
socket.on('status_sala', (data) => {
    if (statusText) {
        statusText.innerText = `CONECTADO: SALA ${salaAtual}`;
        statusText.style.color = "var(--ether-blue)";
    }
});

// Novo peer entrou (Liga para ele)
socket.on('novo_peer_na_sala', (data) => {
    if (data.peerId !== myPeerId) {
        console.log("Ligando para:", data.peerId);
        const call = peer.call(data.peerId, video.srcObject);
        call.on('stream', (remoteStream) => {
            mostrarVideoOponente(remoteStream);
        });
    }
});

// Oponente jogou carta (Atualiza histórico)
socket.on('oponente_jogou', (data) => {
    addToHistory(`[RIVAL] ${data.nome}`, data.imagem);
});

// ======================================================
// 6. INTERAÇÃO DE CLIQUES (LOCAL E REMOTO)
// ======================================================

// --- CLIQUE NA MINHA CÂMERA ---
if (localWrapper) {
    const handleLocalClick = (e) => {
        // Se eu sou pequeno (PiP), clique = TROCAR TAMANHO
        if (!isLocalMain) {
            if (e.stopPropagation) e.stopPropagation();
            toggleLayout();
            return;
        }
        // Se eu sou grande, clique = ESCANEAR
        realizarScanLocal(e.clientX, e.clientY);
    };

    localWrapper.addEventListener('click', handleLocalClick);
    localWrapper.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        handleLocalClick({ clientX: t.clientX, clientY: t.clientY, stopPropagation: () => e.stopPropagation() });
    });
}

// --- CLIQUE NA CÂMERA DO OPONENTE ---
if (remoteWrapper) {
    const handleRemoteClick = (e) => {
        // Se oponente é pequeno (PiP), clique = TROCAR TAMANHO
        if (isLocalMain) {
            if (e.stopPropagation) e.stopPropagation();
            toggleLayout();
            return;
        }
        // Se oponente é grande, clique = ESPIONAR
        realizarScanRemoto(e.clientX, e.clientY);
    };

    remoteWrapper.addEventListener('click', handleRemoteClick);
    remoteWrapper.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        handleRemoteClick({ clientX: t.clientX, clientY: t.clientY, stopPropagation: () => e.stopPropagation() });
    });
}

// ======================================================
// 7. LÓGICA DE SCAN (LOCAL)
// ======================================================
function realizarScanLocal(clientX, clientY) {
    uiCarregando();

    const rect = video.getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;
    
    // Processa o recorte e envia
    processarCropEEnviar(video, clientX - rect.left, clientY - rect.top, scaleX, scaleY, false);
}

// ======================================================
// 8. LÓGICA DE SCAN (REMOTO/ESPIONAGEM)
// ======================================================
function realizarScanRemoto(clientX, clientY) {
    const rect = remoteVideo.getBoundingClientRect();
    const pctX = (clientX - rect.left) / rect.width;
    const pctY = (clientY - rect.top) / rect.height;

    // Feedback Visual de Espionagem
    resultText.innerText = "Espionando...";
    resultText.style.color = "#ff00ff";
    spinner.style.display = 'block';

    // Pede para o oponente cortar a imagem dele
    socket.emit('pedido_scan_remoto', { 
        sala: salaAtual, 
        x: pctX, y: pctY, 
        solicitante: socket.id 
    });
}

// Recebi pedido para cortar minha câmera (Alguém me espionou)
socket.on('executar_crop_local', (data) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const realX = data.x * w;
    const realY = data.y * h;

    let x = realX - (CROP_W / 2);
    let y = realY - (CROP_H / 2);
    
    // Limites
    if (x < 0) x = 0; if (y < 0) y = 0;
    if (x + CROP_W > w) x = w - CROP_W;
    if (y + CROP_H > h) y = h - CROP_H;

    canvas.width = CROP_W; canvas.height = CROP_H;
    ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
    const imagemBase64 = canvas.toDataURL('image/jpeg', 0.8);

    // Devolve só para o espião
    socket.emit('devolver_scan_remoto', {
        destinatario: data.solicitante, imagem: imagemBase64
    });
});

// Recebi a imagem espionada de volta
socket.on('receber_imagem_remota', (data) => {
    enviarParaPython(data.imagem, true); // true = modo espião
});

// ======================================================
// 9. FUNÇÕES AUXILIARES (ENVIAR PRO PYTHON)
// ======================================================

function processarCropEEnviar(sourceVideo, clickX, clickY, scaleX, scaleY, isSpy) {
    const realX = clickX * scaleX;
    const realY = clickY * scaleY;

    let x = realX - (CROP_W / 2);
    let y = realY - (CROP_H / 2);

    if (x < 0) x = 0; if (y < 0) y = 0;
    if (x + CROP_W > sourceVideo.videoWidth) x = sourceVideo.videoWidth - CROP_W;
    if (y + CROP_H > sourceVideo.videoHeight) y = sourceVideo.videoHeight - CROP_H;

    canvas.width = CROP_W; canvas.height = CROP_H;
    ctx.drawImage(sourceVideo, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
    const dataURL = canvas.toDataURL('image/jpeg', 0.9);

    enviarParaPython(dataURL, isSpy);
}

function enviarParaPython(imagemBase64, isSpy) {
    fetch('/identificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem: imagemBase64 })
    })
    .then(r => r.json())
    .then(data => {
        spinner.style.display = "none";
        
        if (data.sucesso) {
            atualizarHUD(data, isSpy);
            
            // Adiciona ao histórico (Com ícone se for espião)
            const prefixo = isSpy ? "👁️ " : "";
            addToHistory(prefixo + data.dados.nome, data.imagem);

            // Se for minha jogada (não espião), avisa a sala
            if (!isSpy && salaAtual !== "") {
                socket.emit('jogar_carta', {
                    sala: salaAtual, nome: data.dados.nome, imagem: data.imagem, dados: data.dados
                });
            }
        } else {
            resultText.innerText = "Falha/Desconhecida";
            resultText.style.color = "#555";
        }
    });
}

function uiCarregando() {
    resultText.innerText = "Analisando...";
    resultText.style.color = "var(--ether-blue)";
    resultImg.style.display = "none";
    if(detailPanel) detailPanel.style.display = 'none';
    spinner.style.display = "block";
    resultImg.style.transform = "scale(1)";
}

function atualizarHUD(data, isSpy) {
    const nome = isSpy ? "[ESPIÃO] " + data.dados.nome : data.dados.nome;
    const cor = isSpy ? "#ff00ff" : "var(--accent-gold)";

    resultText.innerText = nome;
    resultText.style.color = cor;
    resultImg.src = "data:image/jpeg;base64," + data.imagem;
    resultImg.style.display = "block";

    if (detailPanel) {
        detailPanel.style.display = 'flex';
        if(typeText) typeText.innerText = data.dados.tipo;
        if(specialText) specialText.innerText = data.dados.especial;
        if(effectText) effectText.innerText = data.dados.efeito;
    }
}

// ======================================================
// 10. HISTÓRICO INTELIGENTE E PRIVADO
// ======================================================
function addToHistory(nome, imagemBase64) {
    if (!historyList) return;

    const itens = historyList.getElementsByClassName('history-item');
    let itemExistente = null;

    for (let item of itens) {
        if (item.querySelector('span').innerText === nome) {
            itemExistente = item; break;
        }
    }

    const imgSrc = "data:image/jpeg;base64," + imagemBase64;

    if (itemExistente) {
        historyList.prepend(itemExistente);
        itemExistente.querySelector('img').src = imgSrc;
        itemExistente.style.backgroundColor = "rgba(0, 229, 255, 0.3)";
        setTimeout(() => itemExistente.style.backgroundColor = "", 300);
    } else {
        const novoItem = document.createElement('div');
        novoItem.className = 'history-item';
        novoItem.innerHTML = `<img src="${imgSrc}"><span>${nome}</span>`;
        
        // RECALL PRIVADO (Não emite Socket)
        novoItem.addEventListener('click', () => {
            resultImg.src = imgSrc;
            resultImg.style.display = 'block';
            
            // Limpa prefixos visuais
            let nomeLimpo = nome.replace('[RIVAL] ', '').replace('👁️ ', '');
            resultText.innerText = nomeLimpo;
            resultText.style.color = "var(--accent-gold)";
            
            // Animação 3D Pop
            resultImg.style.transform = "perspective(1000px) translateZ(50px) scale(1.05)";
            setTimeout(() => resultImg.style.transform = "perspective(1000px) translateZ(0px) scale(1)", 200);
        });

        historyList.prepend(novoItem);
    }
    
    if (historyList.children.length > 20) historyList.removeChild(historyList.lastChild);
}

// ======================================================
// 11. EFEITO 3D TILT
// ======================================================
if (resultBox) {
    resultBox.addEventListener('mousemove', (e) => {
        if (resultImg.style.display === 'none' || resultImg.src === "") return;
        
        const rect = resultBox.getBoundingClientRect();
        const sensibilidade = 10;
        
        const rotateY = (((e.clientX - rect.left) / rect.width) - 0.5) * sensibilidade;
        const rotateX = (((e.clientY - rect.top) / rect.height) - 0.5) * -sensibilidade;

        resultImg.style.transform = `perspective(1000px) translateZ(50px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.1)`;
    });

    resultBox.addEventListener('mouseleave', () => {
        resultImg.style.transform = `perspective(1000px) translateZ(0px) rotateX(0deg) rotateY(0deg) scale(1)`;
    });
}

// ======================================================
// 12. START
// ======================================================
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, 
            audio: false 
        });
        video.srcObject = stream;
        
        // Inicia PeerJS
        iniciarVideoCall();
        
        // Garante layout inicial
        atualizarLayout();

    } catch (err) {
        console.error(err);
        alert("Erro ao abrir câmera. Verifique permissões.");
    }
}

// Inicia
startCamera();