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
const detailPanel = document.getElementById('card-details');
const typeText = document.getElementById('card-type');
const specialText = document.getElementById('card-special');
const effectText = document.getElementById('card-effect');
const historyList = document.getElementById('history-list');

const loginPanel = document.getElementById('login-panel');
const roomInput = document.getElementById('room-input');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');

// SIDEBARS
const sidebarToggleBtn = document.getElementById('sidebarToggle');
const mainSidebar = document.getElementById('mainSidebar');
const chatToggleBtn = document.getElementById('chatToggle');
const chatSidebar = document.getElementById('chatSidebar');
const msgInput = document.getElementById('msgInput');
const chatMessages = document.getElementById('chat-messages');

// BOTÕES DE CONTROLE
const btnMute = document.getElementById('btnMute');

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
let isLocalRotated = false;
let isRemoteRotated = false;

// ======================================================
// 3. UI: BOTÕES DE MENU E CHAT
// ======================================================

if (sidebarToggleBtn && mainSidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
        mainSidebar.classList.toggle('closed');
        sidebarToggleBtn.classList.toggle('closed');
        sidebarToggleBtn.innerHTML = mainSidebar.classList.contains('closed') ? "&gt;" : "&lt;";
    });
}

if (chatToggleBtn && chatSidebar) {
    chatToggleBtn.addEventListener('click', () => {
        chatSidebar.classList.toggle('closed');
        chatToggleBtn.classList.toggle('closed');
        chatToggleBtn.innerHTML = chatSidebar.classList.contains('closed') ? "&lt;" : "&gt;";
    });
}

function toggleRotation(event, target) {
    event.stopPropagation(); 
    if (target === 'local') {
        isLocalRotated = !isLocalRotated;
        video.classList.toggle('rotated', isLocalRotated);
    } else if (target === 'remote') {
        isRemoteRotated = !isRemoteRotated;
        remoteVideo.classList.toggle('rotated', isRemoteRotated);
    }
}

// NOVO: CONTROLE DE ÁUDIO (MUTAR)
function toggleMute(event) {
    event.stopPropagation();
    // Pega a faixa de áudio do stream local
    const audioTrack = video.srcObject.getAudioTracks()[0];
    
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled; // Inverte (True/False)
        
        // Atualiza visual do botão
        if (audioTrack.enabled) {
            btnMute.innerHTML = "🎤";
            btnMute.classList.remove('muted');
        } else {
            btnMute.innerHTML = "🔇";
            btnMute.classList.add('muted');
        }
    }
}

// ======================================================
// 4. CHAT
// ======================================================
function handleChatKey(e) { if (e.key === 'Enter') enviarMensagem(); }

function enviarMensagem() {
    const texto = msgInput.value.trim();
    if (texto === "" || salaAtual === "") return;
    socket.emit('enviar_chat', { sala: salaAtual, texto: texto, remetente: socket.id });
    msgInput.value = "";
}

socket.on('receber_chat', (data) => {
    const div = document.createElement('div');
    div.classList.add('message-bubble');
    if (data.remetente === socket.id) {
        div.classList.add('msg-me');
        div.innerText = data.texto;
    } else {
        div.classList.add('msg-op');
        div.innerText = data.texto;
        if (chatSidebar.classList.contains('closed')) chatToggleBtn.click();
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ======================================================
// 5. CONEXÃO E SALAS
// ======================================================
function conectarSala() {
    if (!roomInput || roomInput.value.trim() === "") {
        alert("Digite o número da sala!"); return;
    }
    salaAtual = roomInput.value.trim();
    socket.emit('entrar_sala', { sala: salaAtual });

    if (loginPanel) {
        loginPanel.style.opacity = '0';
        setTimeout(() => { loginPanel.style.display = 'none'; }, 500);
    }
    if (statusOverlay) {
        statusOverlay.style.display = 'flex';
        if (statusText) statusText.innerText = "CONECTANDO...";
    }
    if (myPeerId) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId });
    
    const sysMsg = document.createElement('div');
    sysMsg.classList.add('msg-sys');
    sysMsg.innerText = "Você entrou na sala " + salaAtual;
    chatMessages.appendChild(sysMsg);
}

socket.on('status_sala', (data) => {
    if (statusText) statusText.innerText = `CONECTADO: SALA ${salaAtual}`;
});

// ======================================================
// 6. VÍDEO P2P (AGORA COM ÁUDIO)
// ======================================================
function iniciarVideoCall() {
    peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    
    peer.on('open', (id) => {
        myPeerId = id;
        if (salaAtual !== "") socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId });
    });

    // Quando recebo ligação (Respondo com meu vídeo E áudio)
    peer.on('call', (call) => {
        call.answer(video.srcObject);
        call.on('stream', (st) => mostrarVideoOponente(st));
    });
}

socket.on('novo_peer_na_sala', (data) => {
    if (data.peerId && data.peerId !== myPeerId) {
        setTimeout(() => {
            // Ligo para o novo peer enviando meu stream
            const call = peer.call(data.peerId, video.srcObject);
            call.on('stream', (st) => mostrarVideoOponente(st));
        }, 1000);
    }
});

function mostrarVideoOponente(stream) {
    if (remoteVideo) {
        remoteVideo.srcObject = stream;
        // IMPORTANTE: Garantir que o áudio do oponente toque
        remoteVideo.muted = false; 
        isLocalMain = false; 
        atualizarLayout();
    }
}

// ======================================================
// 7. LAYOUT E INTERAÇÃO
// ======================================================
function atualizarLayout() {
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');

    if (isLocalMain) {
        localWrapper.classList.add('video-full');
        if (remoteVideo.srcObject && remoteWrapper) {
            remoteWrapper.classList.add('video-pip');
            remoteWrapper.style.display = 'flex';
        } else if (remoteWrapper) remoteWrapper.style.display = 'none';
    } else {
        if (remoteWrapper) {
            remoteWrapper.classList.add('video-full');
            remoteWrapper.style.display = 'flex';
        }
        localWrapper.classList.add('video-pip');
    }
}
function toggleLayout() {
    if (!remoteVideo.srcObject) return;
    isLocalMain = !isLocalMain;
    atualizarLayout();
}

if (localWrapper) {
    localWrapper.addEventListener('click', (e) => {
        if (!isLocalMain) { e.stopPropagation(); toggleLayout(); return; }
        realizarScanLocal(e.clientX, e.clientY);
    });
}
if (remoteWrapper) {
    remoteWrapper.addEventListener('click', (e) => {
        if (isLocalMain) { e.stopPropagation(); toggleLayout(); return; }
        realizarScanRemoto(e.clientX, e.clientY);
    });
}

// ======================================================
// 8. LÓGICA DE SCAN
// ======================================================
function realizarScanLocal(cx, cy) {
    uiCarregando();
    const r = video.getBoundingClientRect();
    let rx = cx - r.left, ry = cy - r.top;
    if (isLocalRotated) { rx = r.width - rx; ry = r.height - ry; }
    processarCrop(video, rx, ry, video.videoWidth/r.width, video.videoHeight/r.height, false);
}

function realizarScanRemoto(cx, cy) {
    const r = remoteVideo.getBoundingClientRect();
    let rx = cx - r.left, ry = cy - r.top;
    if (isRemoteRotated) { rx = r.width - rx; ry = r.height - ry; }
    resultText.innerText = "Espionando..."; resultText.style.color = "#ff00ff"; spinner.style.display = 'block';
    socket.emit('pedido_scan_remoto', { sala: salaAtual, x: rx/r.width, y: ry/r.height, solicitante: socket.id });
}

socket.on('executar_crop_local', (d) => {
    const w = video.videoWidth, h = video.videoHeight;
    let rx = d.x * w, ry = d.y * h;
    let x = rx - CROP_W/2, y = ry - CROP_H/2;
    if(x<0)x=0; if(y<0)y=0; if(x+CROP_W>w)x=w-CROP_W; if(y+CROP_H>h)y=h-CROP_H;
    canvas.width=CROP_W; canvas.height=CROP_H;
    ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
    socket.emit('devolver_scan_remoto', { destinatario: d.solicitante, imagem: canvas.toDataURL('image/jpeg', 0.8) });
});

socket.on('receber_imagem_remota', (d) => enviarParaPython(d.imagem, true));
socket.on('oponente_jogou', (d) => addToHistory(`[RIVAL] ${d.nome}`, d.imagem));

// ======================================================
// 9. AUXILIARES
// ======================================================
function processarCrop(vid, rx, ry, sx, sy, spy) {
    let x = (rx*sx) - CROP_W/2, y = (ry*sy) - CROP_H/2;
    if(x<0)x=0; if(y<0)y=0; if(x+CROP_W>vid.videoWidth)x=vid.videoWidth-CROP_W; if(y+CROP_H>vid.videoHeight)y=vid.videoHeight-CROP_H;
    canvas.width=CROP_W; canvas.height=CROP_H;
    ctx.drawImage(vid, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
    enviarParaPython(canvas.toDataURL('image/jpeg', 0.9), spy);
}

function enviarParaPython(b64, spy) {
    fetch('/identificar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({imagem:b64}) })
    .then(r=>r.json()).then(d => {
        spinner.style.display='none';
        if(d.sucesso) {
            atualizarHUD(d, spy);
            addToHistory((spy?"👁️ ":"") + d.dados.nome, d.imagem);
            if(!spy && salaAtual!=="") socket.emit('jogar_carta', {sala:salaAtual, nome:d.dados.nome, imagem:d.imagem, dados:d.dados});
        } else { resultText.innerText="Falha"; resultText.style.color="#555"; }
    });
}

function uiCarregando() { resultText.innerText="Analisando..."; resultText.style.color="var(--ether-blue)"; resultImg.style.display="none"; if(detailPanel)detailPanel.style.display='none'; spinner.style.display='block'; }
function atualizarHUD(d, spy) {
    resultText.innerText = (spy?"[ESPIÃO] ":"") + d.dados.nome;
    resultText.style.color = spy?"#ff00ff":"var(--accent-gold)";
    resultImg.src="data:image/jpeg;base64,"+d.imagem; resultImg.style.display='block';
    if(detailPanel){ detailPanel.style.display='flex'; typeText.innerText=d.dados.tipo; specialText.innerText=d.dados.especial; effectText.innerText=d.dados.efeito; }
}
function addToHistory(n, b64) {
    const list = document.getElementById('history-list');
    const item = document.createElement('div'); item.className='history-item';
    item.innerHTML = `<img src="data:image/jpeg;base64,${b64}"><span>${n}</span>`;
    item.onclick = () => { resultImg.src="data:image/jpeg;base64,"+b64; resultImg.style.display='block'; resultText.innerText=n.replace(/\[.*?\] /,'').replace('👁️ ',''); };
    list.prepend(item); if(list.children.length>20)list.lastChild.remove();
}

async function start() {
    try {
        // ATENÇÃO: AUDIO AGORA É TRUE
        const s = await navigator.mediaDevices.getUserMedia({
            video:{facingMode:"environment",width:{ideal:1920},height:{ideal:1080}},
            audio: true
        });
        video.srcObject=s; iniciarVideoCall(); atualizarLayout();
    } catch(e) { 
        console.error(e);
        alert("Erro Câmera/Microfone. Verifique permissões."); 
    }
}
start();