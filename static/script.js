// ======================================================
// 1. REFERÊNCIAS
// ======================================================
const video = document.getElementById('videoInput');
const remoteVideo = document.getElementById('remoteVideo');
const remoteWrapper = document.getElementById('remote-wrapper');
const localWrapper = document.querySelector('.video-wrapper.local');
const canvas = document.getElementById('canvasHidden');
const ctx = canvas.getContext('2d');

const resultImg = document.getElementById('result-img');
const resultText = document.getElementById('result-text');
const resultBox = document.getElementById('result-box');
const spinner = document.getElementById('loading');
const historyList = document.getElementById('history-list');

const loginPanel = document.getElementById('login-panel');
const roomInput = document.getElementById('room-input');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');

const sidebarToggleBtn = document.getElementById('sidebarToggle');
const mainSidebar = document.getElementById('mainSidebar');
const chatToggleBtn = document.getElementById('chatToggle');
const chatSidebar = document.getElementById('chatSidebar');

const msgInput = document.getElementById('msgInput');
const chatMessages = document.getElementById('chat-messages');
const logMessages = document.getElementById('log-messages');
const chatContainer = document.getElementById('chat-container');
const logsContainer = document.getElementById('logs-container');
const badgeChat = document.getElementById('badge-chat');
const badgeLogs = document.getElementById('badge-logs');

const sndMsg = document.getElementById('snd-msg');
const sndLife = document.getElementById('snd-life');
const sndScan = document.getElementById('snd-scan');

const btnMute = document.getElementById('btnMute');
const hpOpDisplay = document.getElementById('hp-op');
const hpMeDisplay = document.getElementById('hp-me');

const cardModal = document.getElementById('card-modal');
const modalImg = document.getElementById('modal-img');

// NOVO: Referência ao Popup
const settingsPopup = document.getElementById('settings-popup');
const btnSettings = document.getElementById('btnSettings');

// ======================================================
// 2. ESTADO
// ======================================================
const CROP_W = 400; 
const CROP_H = 600; 
const socket = io();
let peer = null;
let myPeerId = null;
let salaAtual = "";
let isLocalMain = true;
let isLocalRotated = false;
let isRemoteRotated = false;
let hpOp = 20;
let hpMe = 20;

let activeTab = 'chat';
let unreadChat = 0;
let unreadLogs = 0;

let isSoundOn = true;

// ======================================================
// 3. FUNÇÃO DE SOM E POPUP CONFIG
// ======================================================
function tocarSom(tipo) {
    if (!isSoundOn) return;
    try {
        let audio = null;
        if (tipo === 'msg') audio = sndMsg;
        else if (tipo === 'life') audio = sndLife;
        else if (tipo === 'scan') audio = sndScan;

        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log("Som bloqueado"));
        }
    } catch (e) { console.log("Erro ao tocar som", e); }
}

// Abre/Fecha o Popup
function toggleSettings() {
    if (settingsPopup.style.display === 'block') {
        settingsPopup.style.display = 'none';
    } else {
        settingsPopup.style.display = 'block';
    }
}

// Fecha o popup se clicar fora dele
window.onclick = function(event) {
    if (event.target !== settingsPopup && event.target !== btnSettings && !settingsPopup.contains(event.target)) {
        settingsPopup.style.display = 'none';
    }
}

function toggleSoundSetting() {
    isSoundOn = document.getElementById('chkSound').checked;
}

// ======================================================
// 4. EFEITO 3D NA CARTA
// ======================================================
if (resultBox) {
    resultBox.addEventListener('mousemove', (e) => {
        if (resultImg.style.display === 'none' || resultImg.src === "") return;
        const rect = resultBox.getBoundingClientRect();
        const sensibilidade = 10; 
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xPct = (x / rect.width) - 0.5;
        const yPct = (y / rect.height) - 0.5;
        const rotateY = xPct * sensibilidade;
        const rotateX = yPct * -sensibilidade;
        resultImg.style.transform = `perspective(1000px) translateZ(20px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    });

    resultBox.addEventListener('mouseleave', () => {
        resultImg.style.transform = `perspective(1000px) translateZ(0px) rotateX(0deg) rotateY(0deg) scale(1)`;
    });
}

// ======================================================
// 5. MODAL DE ZOOM (CARTA)
// ======================================================
function expandCard() {
    if (resultImg.src && resultImg.src !== window.location.href && resultImg.style.display !== 'none') {
        modalImg.src = resultImg.src;
        cardModal.style.display = 'flex';
    }
}
function closeCardModal() {
    cardModal.style.display = 'none';
}

// ======================================================
// 6. UI: ABAS E NOTIFICAÇÕES
// ======================================================
function switchTab(tabName) {
    activeTab = tabName;
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (tabName === 'chat') {
        btns[0].classList.add('active');
        chatContainer.style.display = 'flex';
        logsContainer.style.display = 'none';
        unreadChat = 0;
        badgeChat.style.display = 'none';
        badgeChat.innerText = '0';
    } else {
        btns[1].classList.add('active');
        chatContainer.style.display = 'none';
        logsContainer.style.display = 'flex';
        unreadLogs = 0;
        badgeLogs.style.display = 'none';
        badgeLogs.innerText = '0';
    }
}

// ======================================================
// 7. UI: SIDEBARS E VIDEO
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
        if (!chatSidebar.classList.contains('closed')) {
            if (activeTab === 'chat') { unreadChat = 0; badgeChat.style.display = 'none'; }
            if (activeTab === 'logs') { unreadLogs = 0; badgeLogs.style.display = 'none'; }
        }
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
function toggleMute(event) {
    event.stopPropagation();
    const audioTrack = video.srcObject.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled; 
        if (audioTrack.enabled) {
            btnMute.innerHTML = "🎤"; btnMute.classList.remove('muted');
        } else {
            btnMute.innerHTML = "🔇"; btnMute.classList.add('muted');
        }
    }
}

// ======================================================
// 8. CHAT E LOGS (SOCKETS)
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
        tocarSom('msg');
        if (chatSidebar.classList.contains('closed') || activeTab !== 'chat') {
            unreadChat++;
            badgeChat.innerText = unreadChat;
            badgeChat.style.display = 'block';
        }
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('log_vida', (data) => {
    const div = document.createElement('div'); div.classList.add('msg-log');
    let ator = (data.remetente === socket.id) ? "VOCÊ" : "OPONENTE";
    let alvoTexto = (data.alvo_clicado === 'me') ? (data.remetente===socket.id ? "própria vida" : "vida dele") : (data.remetente===socket.id ? "vida do oponente" : "sua vida");
    const sinal = data.delta > 0 ? "+" : "";
    div.innerText = `[${data.hora}] ${ator} alterou ${alvoTexto}: ${sinal}${data.delta} (Total: ${data.valor_final})`;
    logMessages.appendChild(div);
    logMessages.scrollTop = logMessages.scrollHeight;
    tocarSom('msg');
    if (chatSidebar.classList.contains('closed') || activeTab !== 'logs') {
        unreadLogs++;
        badgeLogs.innerText = unreadLogs;
        badgeLogs.style.display = 'block';
    }
});

// ======================================================
// 9. VIDA (LÓGICA DO JOGO)
// ======================================================
function changeLife(target, amount) {
    if (target === 'op') {
        hpOp += amount; if(hpOp<0)hpOp=0; if(hpOp>40)hpOp=40; hpOpDisplay.innerText = hpOp;
    } else if (target === 'me') {
        hpMe += amount; if(hpMe<0)hpMe=0; if(hpMe>40)hpMe=40; hpMeDisplay.innerText = hpMe;
    }
    tocarSom('life');
    if (salaAtual !== "") {
        socket.emit('atualizar_vida', { sala: salaAtual, alvo: target, valor: (target==='me'?hpMe:hpOp), delta: amount });
    }
}
socket.on('receber_vida', (data) => {
    if (data.alvo === 'me') { hpOp = data.valor; hpOpDisplay.innerText = hpOp; }
    else if (data.alvo === 'op') { hpMe = data.valor; hpMeDisplay.innerText = hpMe; }
    tocarSom('life');
});

// ======================================================
// 10. CONEXÃO E VÍDEO
// ======================================================
function conectarSala() {
    if (!roomInput || roomInput.value.trim() === "") { alert("Sala?"); return; }
    salaAtual = roomInput.value.trim();
    socket.emit('entrar_sala', { sala: salaAtual });
    if (loginPanel) { loginPanel.style.opacity = '0'; setTimeout(() => { loginPanel.style.display = 'none'; }, 500); }
    if (statusOverlay) { statusOverlay.style.display = 'flex'; statusText.innerText = "CONECTANDO..."; }
    if (myPeerId) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId });
}
socket.on('status_sala', (data) => { if (statusText) statusText.innerText = `CONECTADO: SALA ${salaAtual}`; });

function iniciarVideoCall() {
    peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    peer.on('open', (id) => { myPeerId = id; if (salaAtual !== "") socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId }); });
    peer.on('call', (call) => { call.answer(video.srcObject); call.on('stream', (st) => mostrarVideoOponente(st)); });
}
socket.on('novo_peer_na_sala', (data) => {
    if (data.peerId && data.peerId !== myPeerId) { setTimeout(() => { const call = peer.call(data.peerId, video.srcObject); call.on('stream', (st) => mostrarVideoOponente(st)); }, 1000); }
});
function mostrarVideoOponente(stream) {
    if (remoteVideo) { remoteVideo.srcObject = stream; remoteVideo.muted = false; isLocalMain = false; atualizarLayout(); }
}

// ======================================================
// 11. LAYOUT E SCAN
// ======================================================
function atualizarLayout() {
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');
    if (isLocalMain) {
        localWrapper.classList.add('video-full');
        if (remoteVideo.srcObject && remoteWrapper) { remoteWrapper.classList.add('video-pip'); remoteWrapper.style.display = 'flex'; } else remoteWrapper.style.display = 'none';
    } else {
        if (remoteWrapper) { remoteWrapper.classList.add('video-full'); remoteWrapper.style.display = 'flex'; }
        localWrapper.classList.add('video-pip');
    }
}
function toggleLayout() { if (!remoteVideo.srcObject) return; isLocalMain = !isLocalMain; atualizarLayout(); }

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
            tocarSom('scan');
            if(!spy && salaAtual!=="") socket.emit('jogar_carta', {sala:salaAtual, nome:d.dados.nome, imagem:d.imagem, dados:d.dados});
        } else { resultText.innerText="Falha"; resultText.style.color="#555"; }
    });
}
function uiCarregando() { resultText.innerText="Analisando..."; resultText.style.color="var(--ether-blue)"; resultImg.style.display="none"; spinner.style.display='block'; }
function atualizarHUD(d, spy) {
    resultText.innerText = (spy?"[ESPIÃO] ":"") + d.dados.nome; resultText.style.color = spy?"#ff00ff":"var(--accent-gold)";
    resultImg.src="data:image/jpeg;base64,"+d.imagem; resultImg.style.display='block';
}
function addToHistory(n, b64) {
    const list = document.getElementById('history-list');
    const item = document.createElement('div'); item.className='history-item';
    item.innerHTML = `<img src="data:image/jpeg;base64,${b64}"><span>${n}</span>`;
    item.onclick = () => { 
        resultImg.src="data:image/jpeg;base64,"+b64; 
        resultImg.style.display='block'; 
        resultText.innerText=n.replace(/\[.*?\] /,'').replace('👁️ ',''); 
    };
    list.prepend(item); if(list.children.length>20)list.lastChild.remove();
}
async function start() {
    try { const s = await navigator.mediaDevices.getUserMedia({ video:{facingMode:"environment",width:{ideal:1920},height:{ideal:1080}}, audio: true }); video.srcObject=s; iniciarVideoCall(); atualizarLayout(); } 
    catch(e) { console.error(e); alert("Erro Câmera"); }
}
start();