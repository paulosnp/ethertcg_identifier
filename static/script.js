function getEl(id) { return document.getElementById(id); }

// ======================================================
// 1. REFERÊNCIAS
// ======================================================
const welcomeScreen = getEl('welcome-screen');
const welcomeNickInput = getEl('welcome-nick-input');
const btnEnterWelcome = getEl('btn-enter-welcome');
const currentNickLobby = getEl('current-nick-lobby');
const lobbyScreen = getEl('lobby-view');
const gameScreen = getEl('game-view');
const visualGrid = getEl('visual-tables-grid');
const sidebarToggleBtn = getEl('sidebarToggle');
const mainSidebar = getEl('mainSidebar');
const chatSidebar = getEl('chatSidebar');
const container = getEl('container');
const video = getEl('videoInput');
const remoteVideo = getEl('remoteVideo');
const remoteWrapper = getEl('remote-wrapper');
const localWrapper = document.querySelector('.video-wrapper.local');
const dockBadge = getEl('dock-badge');
const stLastCardImg = getEl('st-last-card-img');
const stEmptyState = getEl('st-empty-state');
const stLoading = getEl('st-loading');
const stHistoryList = getEl('st-history-list');
const msgInput = getEl('msgInput');
const chatMessages = getEl('chat-messages');
const logMessages = getEl('log-messages');
const chatContainer = getEl('chat-container');
const logsContainer = getEl('logs-container');
const hpOpDisplay = getEl('hp-op');
const hpMeDisplay = getEl('hp-me');
const nameOpDisplay = getEl('name-op');
const nameMeDisplay = getEl('name-me');
const hudRemoteContainer = getEl('hud-remote-container');
const cardModal = getEl('card-modal');
const modalImg = getEl('modal-img');
const sndMsg = getEl('snd-msg');
const sndLife = getEl('snd-life');
const sndScan = getEl('snd-scan');
const canvas = getEl('canvasHidden');
const stScanStatus = getEl('st-scan-status');
let ctx = null; if (canvas) { ctx = canvas.getContext('2d'); }
const CROP_W = 400; const CROP_H = 600;

// ======================================================
// 2. ESTADO
// ======================================================
const socket = io({ reconnection: true });
let peer = null;
let myPeerId = null;

let calls = { p1: null, p2: null }; 
let targetPeerIds = { p1: null, p2: null };

let salaAtual = "";
let myNickname = "Jogador";
let mySlot = null; 
let isLocalMain = true;
let isLocalRotated = false;
let isRemoteRotated = false;
let activeTab = 'chat';
let isSoundOn = false;
let localStreamGlobal = null;

// ======================================================
// 3. BOOT (CAMERA E PEER)
// ======================================================
async function iniciarCameraGlobal() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        video.srcObject = stream; video.muted = true; localStreamGlobal = stream;
        console.log("Webcam real iniciada.");
    } catch (e) {
        console.warn("Webcam indisponível. Usando fallback...");
        localStreamGlobal = criarStreamFake();
        video.srcObject = localStreamGlobal;
        video.muted = true;
    }
}

function criarStreamFake() {
    const canvasFake = document.createElement('canvas');
    canvasFake.width = 640; canvasFake.height = 480;
    const ctxFake = canvasFake.getContext('2d');
    
    // Desenha APENAS UMA VEZ (Sem pisca-pisca)
    ctxFake.fillStyle = '#121212'; // Fundo Escuro Estático
    ctxFake.fillRect(0, 0, 640, 480);
    
    ctxFake.fillStyle = '#333'; // Um detalhe sutil se quiser
    ctxFake.fillRect(0, 0, 640, 50); // Barra superior
    
    ctxFake.fillStyle = 'white';
    ctxFake.font = 'bold 40px Arial';
    ctxFake.textAlign = 'center';
    ctxFake.fillText("SEM CÂMERA", 320, 240);
    
    // Retorna o stream a 30fps (mesmo sendo estático)
    return canvasFake.captureStream(30);
}

function iniciarPeerAntecipado() {
    peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    
    peer.on('open', (id) => {
        myPeerId = id;
        if (salaAtual && mySlot) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: mySlot });
        iniciarConnectionLoop();
    });

    peer.on('call', (call) => {
        call.answer(localStreamGlobal);
        call.on('stream', (rs) => {
            mostrarVideoOponente(rs);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    iniciarCameraGlobal();
    iniciarPeerAntecipado();
    const nickSalvo = localStorage.getItem('ether_nickname_saved');
    const temaSalvo = localStorage.getItem('ether_tema_preferido');
    if (temaSalvo) mudarTema(temaSalvo);
    if (nickSalvo) {
        myNickname = nickSalvo;
        welcomeScreen.style.display = 'none';
        if (currentNickLobby) currentNickLobby.innerText = myNickname;
    } else { welcomeScreen.classList.remove('hidden'); }
});

if (btnEnterWelcome) btnEnterWelcome.addEventListener('click', () => {
    const nick = welcomeNickInput.value.trim().toUpperCase();
    if (nick.length < 3) return alert("Nick curto!");
    localStorage.setItem('ether_nickname_saved', nick);
    myNickname = nick;
    welcomeScreen.style.opacity = '0';
    setTimeout(() => { welcomeScreen.style.display = 'none'; currentNickLobby.innerText = nick; }, 300);
});

// ======================================================
// 4. LÓGICA DE CONEXÃO OTIMIZADA (SEM SPEC)
// ======================================================
function iniciarConnectionLoop() {
    setInterval(() => {
        if (!peer || !salaAtual || !mySlot) return;

        // Se sou P1, tento conectar no P2. Se sou P2, no P1.
        if (mySlot === 'p1') verificarConexao('p2', targetPeerIds.p2, remoteVideo);
        else if (mySlot === 'p2') verificarConexao('p1', targetPeerIds.p1, remoteVideo);
        
    }, 1500);
}

function verificarConexao(slot, targetId, videoElement) {
    if (!targetId) return;
    const isPlaying = (videoElement.srcObject && !videoElement.paused && videoElement.readyState > 2);
    if (isPlaying) return;

    if (calls[slot]) { calls[slot].close(); calls[slot] = null; }
    
    try {
        const call = peer.call(targetId, localStreamGlobal);
        calls[slot] = call;
        call.on('stream', (rs) => mostrarVideoOponente(rs));
        call.on('error', (e) => console.log("Erro Call:", e));
    } catch(e) {}
}

// ======================================================
// 5. EVENTOS SOCKET
// ======================================================
socket.on('lobby_update', (rooms) => {
    if (salaAtual !== "" || !visualGrid) return;
    visualGrid.innerHTML = "";
    for (const [id, info] of Object.entries(rooms)) {
        let statusClass = "empty"; let actionText = "ENTRAR";
        let isFull = false;
        
        if (info.count === 1) { statusClass = "waiting"; actionText = "DESAFIAR"; }
        else if (info.count >= 2) { statusClass = "full"; actionText = "LOTADA"; isFull = true; }
        
        const div = document.createElement('div');
        div.className = `arena-card ${statusClass}`;
        
        // BLOQUEIO DE CLIQUE EM SALA CHEIA
        if (!isFull) {
            div.onclick = () => entrarNaMesa(id);
        } else {
            div.style.cursor = "not-allowed";
            div.style.opacity = "0.6";
        }
        
        div.innerHTML = `<div class="arena-id">${id.replace('mesa_', '')}</div><div class="arena-header"><span class="arena-name">${info.name}</span></div><div class="arena-players"><div class="player-slot">👤 ${info.nicks[0] || 'Vazio'}</div><div class="player-slot">⚔️ ${info.nicks[1] || 'Vazio'}</div></div><div class="arena-action">${actionText}</div>`;
        visualGrid.appendChild(div);
    }
});

socket.on('erro_sala_cheia', (data) => {
    alert(data.msg);
    location.reload();
});

window.entrarNaMesa = function (salaId) {
    salaAtual = salaId;
    lobbyScreen.style.display = 'none'; gameScreen.style.display = 'flex';
    mainSidebar.classList.add('closed');
    socket.emit('entrar_sala', { sala: salaId, nickname: myNickname });
};

socket.on('configurar_papel', (data) => {
    mySlot = data.slot;
    setupPlayerMode();
    if (myPeerId) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: mySlot });
});

socket.on('atualizar_estado_jogo', (state) => {
    // Determina quem é "eu" e quem é "oponente"
    let myData = (mySlot === 'p1') ? state.p1 : state.p2;
    let enemyData = (mySlot === 'p1') ? state.p2 : state.p1;

    atualizarHUD(hpMeDisplay, nameMeDisplay, myData);
    atualizarHUD(hpOpDisplay, nameOpDisplay, enemyData);
    
    // Mostra HUD inimigo se ele tiver PeerID (estiver conectado)
    hudRemoteContainer.style.display = (enemyData.peer_id) ? 'flex' : 'none';
    
    // Atualiza o alvo da conexão P2P
    if (mySlot === 'p1') targetPeerIds.p2 = state.p2.peer_id;
    else targetPeerIds.p1 = state.p1.peer_id;
    
    // Se o inimigo saiu, limpa o vídeo
    if (!enemyData.peer_id) remoteVideo.srcObject = null;
});

function atualizarHUD(elHp, elName, data) {
    if (elHp) elHp.innerText = data.hp;
    if (elName) elName.innerText = (data.nick && data.nick !== 'Vazio') ? data.nick : 'AGUARDANDO...';
}

function mostrarVideoOponente(stream) {
    remoteVideo.srcObject = stream; remoteVideo.muted = false; remoteVideo.play().catch(e=>{});
    isLocalMain = false; atualizarLayout(); 
}

// ======================================================
// 6. INTERFACE E CLIQUES
// ======================================================
function setupPlayerMode() {
    video.srcObject = localStreamGlobal;
    
    // Cliques limpos, sem lógica de spec
    localWrapper.onclick = (e) => {
        if (e.target.closest('.player-hud')) return;
        if (!isLocalMain) toggleLayout();
        else { realizarScanLocal(e.clientX, e.clientY); if (mainSidebar.classList.contains('closed')) toggleSidebarScan(); }
    };

    remoteWrapper.onclick = (e) => {
        if (e.target.closest('.player-hud')) return;
        if (isLocalMain) toggleLayout();
        else realizarScanRemoto(e);
    };
}

function realizarScanLocal(cx, cy) { 
    uiCarregando(); const r = video.getBoundingClientRect(); 
    let nx = (cx - r.left) / r.width; let ny = (cy - r.top) / r.height;
    if (isLocalRotated) { nx = 1.0 - nx; ny = 1.0 - ny; }
    processarCrop(video, nx, ny, false); 
}

function realizarScanRemoto(e) {
    stEmptyState.innerText = "Espionando..."; stLoading.style.display = 'block'; 
    if (mainSidebar.classList.contains('closed')) toggleSidebarScan();
    const r = remoteVideo.getBoundingClientRect();
    let nx = (e.clientX - r.left) / r.width; let ny = (e.clientY - r.top) / r.height;
    if (remoteVideo.classList.contains('rotated')) { nx = 1.0 - nx; ny = 1.0 - ny; }
    socket.emit('pedido_scan_remoto', { sala: salaAtual, x: nx, y: ny, solicitante: socket.id });
}

function processarCrop(vid, nx, ny, spy) { 
    let rx = nx * vid.videoWidth; let ry = ny * vid.videoHeight;
    let x = rx - CROP_W / 2; let y = ry - CROP_H / 2;
    canvas.width = CROP_W; canvas.height = CROP_H; 
    ctx.drawImage(vid, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); 
    enviarParaPython(canvas.toDataURL('image/jpeg', 0.6), spy); 
}

// ======================================================
// 7. UTILITÁRIOS E CHAT
// ======================================================
window.changeLife = function (target, amount) {
    let targetSlot = (target === 'me') ? mySlot : ((mySlot === 'p1') ? 'p2' : 'p1');
    socket.emit('atualizar_vida', { sala: salaAtual, target_slot: targetSlot, delta: amount });
    tocarSom('life');
};

socket.on('log_vida', (data) => {
    const div = document.createElement('div'); div.classList.add('msg-log');
    div.innerText = `[${data.hora}] ${data.texto}`;
    logMessages.appendChild(div); logMessages.scrollTop = logMessages.scrollHeight;
});

window.handleChatKey = function (e) { if (e.key === 'Enter') enviarMensagem(); };
window.enviarMensagem = function () {
    const texto = msgInput.value.trim();
    if (texto === "" || salaAtual === "") return;
    socket.emit('enviar_chat', { sala: salaAtual, texto: texto, remetente: socket.id, nick: myNickname, tipo: 'duel' });
    msgInput.value = "";
};

socket.on('receber_chat', (data) => {
    const div = document.createElement('div'); div.classList.add('message-bubble');
    if (data.remetente === socket.id) { div.classList.add('msg-me'); div.innerText = data.texto; }
    else { div.classList.add('msg-op'); div.innerText = data.texto; tocarSom('msg'); if (chatSidebar.classList.contains('closed')) { let c = parseInt(dockBadge.innerText || '0') + 1; dockBadge.innerText = c; dockBadge.style.display = 'block'; } }
    chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
});

window.switchTab = function (tabName) {
    activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (tabName === 'chat') {
        document.querySelector('.tab-btn:first-child').classList.add('active'); 
        chatContainer.style.display = 'flex'; logsContainer.style.display = 'none';
    } else if (tabName === 'logs') {
        document.querySelector('.tab-btn:last-child').classList.add('active'); 
        chatContainer.style.display = 'none'; logsContainer.style.display = 'flex';
    }
};

window.toggleSidebarChat = function () { chatSidebar.classList.toggle('closed'); if (!chatSidebar.classList.contains('closed') && dockBadge) { dockBadge.style.display = 'none'; dockBadge.innerText = '0'; } };

window.toggleSidebarScan = function () { 
    mainSidebar.classList.toggle('closed'); 
};

function atualizarLayout() {
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');
    if (isLocalMain) { localWrapper.classList.add('video-full'); if (remoteVideo.srcObject && remoteWrapper) { remoteWrapper.classList.add('video-pip'); remoteWrapper.style.display = 'flex'; } else { remoteWrapper.style.display = 'none'; } }
    else { if (remoteWrapper) { remoteWrapper.classList.add('video-full'); remoteWrapper.style.display = 'flex'; } localWrapper.classList.add('video-pip'); }
}
window.toggleLayout = function () { if (!remoteVideo.srcObject) return; isLocalMain = !isLocalMain; atualizarLayout(); };
window.mudarTema = function (tema) { document.body.className = ""; if (tema) document.body.classList.add(tema); localStorage.setItem('ether_tema_preferido', tema); getEl('modal-temas').style.display = 'none'; };
window.abrirModal = function (id) { getEl(id).style.display = 'flex'; };
window.fecharModal = function (e, id) { if (e.target.id === id) getEl(id).style.display = 'none'; };
window.toggleMute = function (event) {
    const stream = localStreamGlobal || video.srcObject;
    if (stream && stream.getAudioTracks().length > 0) {
        const at = stream.getAudioTracks()[0]; at.enabled = !at.enabled;
        const icon = event.currentTarget.querySelector('.material-icons-round');
        if (at.enabled) { icon.innerText = "mic"; event.currentTarget.classList.remove('active'); } else { icon.innerText = "mic_off"; event.currentTarget.classList.add('active'); }
    }
};
window.toggleRotationMain = function () { if (isLocalMain) { isLocalRotated = !isLocalRotated; video.classList.toggle('rotated', isLocalRotated); } else { isRemoteRotated = !isRemoteRotated; remoteVideo.classList.toggle('rotated', isRemoteRotated); } };
function tocarSom(tipo) { if (!isSoundOn) return; try { let audio = null; if (tipo === 'msg') audio = sndMsg; else if (tipo === 'life') audio = sndLife; else if (tipo === 'scan') audio = sndScan; if (audio) { audio.currentTime = 0; audio.play().catch(e => { }); } } catch (e) { } }
window.toggleSoundSetting = function () { isSoundOn = document.getElementById('chkSound').checked; };
window.closeCardModal = function () { cardModal.style.display = 'none'; };
window.expandCard = function () { if (stLastCardImg.src && stLastCardImg.style.display !== 'none') { modalImg.src = stLastCardImg.src; cardModal.style.display = 'flex'; } };

function enviarParaPython(b64, spy) {
    fetch('/identificar', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ imagem: b64 }), 
        timeout: 15000 
    }).then(r => r.json()).then(d => {
        stLoading.style.display = 'none';
        
        if (d.sucesso) {
            // SUCESSO
            stEmptyState.style.display = 'none';
            stScanStatus.style.display = 'none'; // Garante que erro sumiu
            
            stLastCardImg.src = "data:image/jpeg;base64," + d.imagem;
            stLastCardImg.style.display = 'block';
            
            addToHistory(d.dados.nome, d.imagem);
            tocarSom('scan');
            
            if (!spy && salaAtual !== "") 
                socket.emit('jogar_carta', { sala: salaAtual, nome: d.dados.nome, imagem: d.imagem, dados: d.dados });
        
        } else { 
            // FALHA (Mantém a imagem antiga e mostra erro em cima)
            mostrarErroScan();
        }
    }).catch(err => { 
        stLoading.style.display = 'none'; 
        mostrarErroScan();
    });
}

// Função auxiliar para mostrar o erro temporário
function mostrarErroScan() {
    // Se não tem imagem nenhuma carregada, mostra o texto padrão no meio
    if (stLastCardImg.style.display === 'none') {
        stEmptyState.innerText = "Falha na leitura.";
        stEmptyState.style.display = 'flex';
    } else {
        // Se JÁ tem imagem, mostra o overlay vermelho em cima dela
        if(stScanStatus) {
            stScanStatus.style.display = 'block';
            stScanStatus.innerText = "FALHA NA LEITURA";
            // Some depois de 2 segundos
            setTimeout(() => {
                stScanStatus.style.display = 'none';
            }, 2000);
        }
    }
}

function addToHistory(n, b64) { if (!stHistoryList) return; const itemExistente = Array.from(stHistoryList.children).find(item => item.dataset.cardName === n); if (itemExistente) { stHistoryList.prepend(itemExistente); const img = itemExistente.querySelector('img'); if (img) img.src = "data:image/jpeg;base64," + b64; itemExistente.style.transition = 'none'; itemExistente.style.transform = 'scale(1.1)'; setTimeout(() => { itemExistente.style.transition = 'transform 0.2s'; itemExistente.style.transform = 'scale(1)'; }, 100); return; } const item = document.createElement('div'); item.className = 'st-history-item'; item.dataset.cardName = n; item.innerHTML = `<img class="st-history-thumb" src="data:image/jpeg;base64,${b64}" title="${n}">`; item.onclick = () => { stLastCardImg.src = "data:image/jpeg;base64," + b64; stLastCardImg.style.display = 'block'; stEmptyState.style.display = 'none'; }; stHistoryList.prepend(item); }
function uiCarregando() { stEmptyState.style.display = 'none'; stLastCardImg.style.display = 'none'; stLoading.style.display = 'block'; }
socket.on('executar_crop_local', (d) => { const w = video.videoWidth, h = video.videoHeight; let rx = d.x * w, ry = d.y * h; let x = rx - CROP_W / 2, y = ry - CROP_H / 2; canvas.width = CROP_W; canvas.height = CROP_H; ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); socket.emit('devolver_scan_remoto', { destinatario: d.solicitante, imagem: canvas.toDataURL('image/jpeg', 0.6) }); });
socket.on('receber_imagem_remota', (d) => enviarParaPython(d.imagem, true));
socket.on('oponente_jogou', (d) => addToHistory(d.nome, d.imagem));