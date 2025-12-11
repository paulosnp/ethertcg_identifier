// ======================================================
// 1. REFERÊNCIAS DO DOM
// ======================================================
const video = document.getElementById('videoInput');
const remoteVideo = document.getElementById('remoteVideo');
const remoteWrapper = document.getElementById('remote-wrapper');
const localWrapper = document.querySelector('.video-wrapper.local');
const canvas = document.getElementById('canvasHidden');
const ctx = canvas.getContext('2d');

const resultImg = document.getElementById('result-img');
const resultText = document.getElementById('result-text');
const spinner = document.getElementById('loading');
const resultBox = document.getElementById('result-box');
const historyList = document.getElementById('history-list');

const detailPanel = document.getElementById('card-details');
const typeText = document.getElementById('card-type');
const specialText = document.getElementById('card-special');
const effectText = document.getElementById('card-effect');

const loginPanel = document.getElementById('login-panel');
const roomInput = document.getElementById('room-input');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');

// ======================================================
// 2. CONFIGURAÇÕES GLOBAIS
// ======================================================
const CROP_W = 500;
const CROP_H = 700;

const socket = io();
let peer = null;
let myPeerId = null;
let salaAtual = "";
let isLocalMain = true;

// ======================================================
// 3. VÍDEO P2P (CORRIGIDO PARA REDE ONLINE)
// ======================================================

function iniciarVideoCall() {
    // CORREÇÃO 1: Adicionar servidores STUN para melhorar conexão entre redes diferentes
    peer = new Peer(undefined, {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        myPeerId = id;
        console.log("MEU PEER ID GERADO:", id);

        // CORREÇÃO 2: Se eu já estiver numa sala (cliquei em ENTRAR antes do ID gerar),
        // envio o aviso agora mesmo.
        if (salaAtual !== "") {
            console.log("Enviando PeerID tardio para a sala...");
            socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId });
        }
    });

    peer.on('call', (call) => {
        console.log("Recebendo chamada de vídeo...");
        call.answer(video.srcObject); // Atende
        call.on('stream', (remoteStream) => {
            console.log("Vídeo remoto recebido!");
            mostrarVideoOponente(remoteStream);
        });
    });
    
    peer.on('error', (err) => {
        console.error("Erro no PeerJS:", err);
    });
}

function mostrarVideoOponente(stream) {
    if (remoteVideo) {
        remoteVideo.srcObject = stream;
        isLocalMain = false; 
        atualizarLayout();
    }
}

// ======================================================
// 4. CONTROLE DE LAYOUT
// ======================================================

function atualizarLayout() {
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');

    if (isLocalMain) {
        if (localWrapper) localWrapper.classList.add('video-full');
        if (remoteVideo.srcObject && remoteWrapper) {
            remoteWrapper.classList.add('video-pip');
            remoteWrapper.style.display = 'flex';
        } else if (remoteWrapper) {
            remoteWrapper.style.display = 'none';
        }
    } else {
        if (remoteWrapper) {
            remoteWrapper.classList.add('video-full');
            remoteWrapper.style.display = 'flex';
        }
        if (localWrapper) localWrapper.classList.add('video-pip');
    }
}

function toggleLayout() {
    if (!remoteVideo.srcObject) return;
    isLocalMain = !isLocalMain;
    atualizarLayout();
}

// ======================================================
// 5. SALAS, LOGIN E UI
// ======================================================

function conectarSala() {
    if (!roomInput || roomInput.value.trim() === "") {
        alert("Digite o número da sala!");
        return;
    }
    
    salaAtual = roomInput.value.trim();
    console.log("Entrando na sala:", salaAtual);
    
    socket.emit('entrar_sala', { sala: salaAtual });

    // UI
    if (loginPanel) {
        loginPanel.style.opacity = '0';
        setTimeout(() => { loginPanel.style.display = 'none'; }, 500);
    }
    if (statusOverlay) {
        statusOverlay.style.display = 'flex';
        if (statusText) statusText.innerText = "CONECTANDO...";
    }

    // CORREÇÃO 3: Só envia o PeerID se ele JÁ EXISTIR.
    // Se não existir (internet lenta), o evento peer.on('open') lá em cima vai enviar depois.
    if (myPeerId) {
        console.log("Enviando PeerID imediato:", myPeerId);
        socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId });
    } else {
        console.log("PeerID ainda não gerado. Aguardando...");
    }
}

socket.on('status_sala', (data) => {
    if (statusText) {
        statusText.innerText = `CONECTADO: SALA ${salaAtual}`;
        statusText.style.color = "var(--ether-blue)";
    }
});

socket.on('novo_peer_na_sala', (data) => {
    // Recebi o ID do amigo. Se não for o meu, eu ligo pra ele.
    if (data.peerId && data.peerId !== myPeerId) {
        console.log("Novo amigo na sala. Ligando para:", data.peerId);
        
        // Pequeno delay para garantir que o PeerJS do amigo está ouvindo
        setTimeout(() => {
            const call = peer.call(data.peerId, video.srcObject);
            call.on('stream', (remoteStream) => {
                mostrarVideoOponente(remoteStream);
            });
            call.on('error', (err) => console.error("Erro na chamada:", err));
        }, 1000);
    }
});

socket.on('oponente_jogou', (data) => {
    addToHistory(`[RIVAL] ${data.nome}`, data.imagem);
});

// ======================================================
// 6. CLIQUES E SCAN
// ======================================================

if (localWrapper) {
    const handleLocalClick = (e) => {
        if (!isLocalMain) {
            if (e.stopPropagation) e.stopPropagation();
            toggleLayout();
            return;
        }
        realizarScanLocal(e.clientX, e.clientY);
    };
    localWrapper.addEventListener('click', handleLocalClick);
    localWrapper.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        handleLocalClick({ clientX: t.clientX, clientY: t.clientY, stopPropagation: () => e.stopPropagation() });
    });
}

if (remoteWrapper) {
    const handleRemoteClick = (e) => {
        if (isLocalMain) {
            if (e.stopPropagation) e.stopPropagation();
            toggleLayout();
            return;
        }
        realizarScanRemoto(e.clientX, e.clientY);
    };
    remoteWrapper.addEventListener('click', handleRemoteClick);
    remoteWrapper.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        handleRemoteClick({ clientX: t.clientX, clientY: t.clientY, stopPropagation: () => e.stopPropagation() });
    });
}

// ======================================================
// 7. LÓGICA DE SCAN
// ======================================================
function realizarScanLocal(clientX, clientY) {
    uiCarregando();
    const rect = video.getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;
    processarCropEEnviar(video, clientX - rect.left, clientY - rect.top, scaleX, scaleY, false);
}

function realizarScanRemoto(clientX, clientY) {
    const rect = remoteVideo.getBoundingClientRect();
    const pctX = (clientX - rect.left) / rect.width;
    const pctY = (clientY - rect.top) / rect.height;

    resultText.innerText = "Espionando...";
    resultText.style.color = "#ff00ff";
    spinner.style.display = 'block';

    socket.emit('pedido_scan_remoto', { 
        sala: salaAtual, x: pctX, y: pctY, solicitante: socket.id 
    });
}

socket.on('executar_crop_local', (data) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const realX = data.x * w;
    const realY = data.y * h;
    let x = realX - (CROP_W / 2);
    let y = realY - (CROP_H / 2);
    if (x < 0) x = 0; if (y < 0) y = 0;
    if (x + CROP_W > w) x = w - CROP_W;
    if (y + CROP_H > h) y = h - CROP_H;

    canvas.width = CROP_W; canvas.height = CROP_H;
    ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
    const imagemBase64 = canvas.toDataURL('image/jpeg', 0.8);

    socket.emit('devolver_scan_remoto', { destinatario: data.solicitante, imagem: imagemBase64 });
});

socket.on('receber_imagem_remota', (data) => {
    enviarParaPython(data.imagem, true); 
});

// ======================================================
// 8. AUXILIARES
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
            const prefixo = isSpy ? "👁️ " : "";
            addToHistory(prefixo + data.dados.nome, data.imagem);
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
        novoItem.addEventListener('click', () => {
            resultImg.src = imgSrc;
            resultImg.style.display = 'block';
            let nomeLimpo = nome.replace('[RIVAL] ', '').replace('👁️ ', '');
            resultText.innerText = nomeLimpo;
            resultText.style.color = "var(--accent-gold)";
            resultImg.style.transform = "perspective(1000px) translateZ(50px) scale(1.05)";
            setTimeout(() => resultImg.style.transform = "perspective(1000px) translateZ(0px) scale(1)", 200);
        });
        historyList.prepend(novoItem);
    }
    if (historyList.children.length > 20) historyList.removeChild(historyList.lastChild);
}

if (resultBox) {
    resultBox.addEventListener('mousemove', (e) => {
        if (resultImg.style.display === 'none' || resultImg.src === "") return;
        const rect = resultBox.getBoundingClientRect();
        const rotY = (((e.clientX - rect.left) / rect.width) - 0.5) * 10;
        const rotX = (((e.clientY - rect.top) / rect.height) - 0.5) * -10;
        resultImg.style.transform = `perspective(1000px) translateZ(50px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.1)`;
    });
    resultBox.addEventListener('mouseleave', () => {
        resultImg.style.transform = `perspective(1000px) translateZ(0px) rotateX(0deg) rotateY(0deg) scale(1)`;
    });
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, 
            audio: false 
        });
        video.srcObject = stream;
        iniciarVideoCall();
        atualizarLayout();
    } catch (err) {
        console.error(err);
        alert("Erro ao abrir câmera. Verifique permissões.");
    }
}
startCamera();