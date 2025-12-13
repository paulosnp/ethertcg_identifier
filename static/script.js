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
const btnTabSpec = getEl('btn-tab-spec');
const spectatorCounter = getEl('spectator-counter');
const specCountVal = getEl('spec-count-val');
const sndMsg = getEl('snd-msg');
const sndLife = getEl('snd-life');
const sndScan = getEl('snd-scan');
const canvas = getEl('canvasHidden');
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
let clickTimer = null; 

let salaAtual = "";
let myNickname = "Jogador";
let mySlot = null; 
let isLocalMain = true;
let isLocalRotated = false;
let isRemoteRotated = false;
let activeTab = 'chat';
let isSoundOn = false;
let isSpectator = false;
let localStreamGlobal = null;

// ======================================================
// 3. BOOT (COM CORREÇÃO DE LOCALHOST)
// ======================================================
async function iniciarCameraGlobal() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        video.srcObject = stream; video.muted = true; localStreamGlobal = stream;
        console.log("Webcam real iniciada.");
    } catch (e) {
        console.warn("Webcam ocupada ou indisponível. Gerando sinal de teste...");
        localStreamGlobal = criarStreamFake(); // Fallback para não quebrar o jogo
        video.srcObject = localStreamGlobal;
        video.muted = true;
    }
}

// Cria um vídeo colorido falso para testes locais
function criarStreamFake() {
    const canvasFake = document.createElement('canvas');
    canvasFake.width = 640; canvasFake.height = 480;
    const ctxFake = canvasFake.getContext('2d');
    
    // Animação simples
    setInterval(() => {
        ctxFake.fillStyle = `hsl(${Date.now() % 360}, 60%, 50%)`;
        ctxFake.fillRect(0, 0, 640, 480);
        ctxFake.fillStyle = 'white';
        ctxFake.font = '40px Arial';
        ctxFake.fillText("SEM CÂMERA", 180, 240);
    }, 100);
    
    return canvasFake.captureStream(30);
}

function iniciarPeerAntecipado() {
    peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    
    peer.on('open', (id) => {
        myPeerId = id;
        if (salaAtual && mySlot) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: mySlot });
        iniciarConnectionLoop(); // Auto-Cura
    });

    peer.on('call', (call) => {
        call.answer(localStreamGlobal);
        call.on('stream', (rs) => {
            if (!isSpectator) mostrarVideoOponente(rs);
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
// 4. LÓGICA DE CONEXÃO "AUTO-CURA"
// ======================================================
function iniciarConnectionLoop() {
    setInterval(() => {
        if (!peer || !salaAtual || !mySlot) return;

        if (mySlot === 'p1') verificarConexao('p2', targetPeerIds.p2, remoteVideo);
        else if (mySlot === 'p2') verificarConexao('p1', targetPeerIds.p1, remoteVideo);
        else if (isSpectator) {
            verificarConexao('p1', targetPeerIds.p1, video);
            verificarConexao('p2', targetPeerIds.p2, remoteVideo);
        }
    }, 2000);
}

function verificarConexao(slot, targetId, videoElement) {
    if (!targetId) return;
    const isPlaying = (videoElement.srcObject && !videoElement.paused && videoElement.readyState > 2);
    if (isPlaying) return;

    // Se estiver falhando, reconecta
    if (calls[slot]) { calls[slot].close(); calls[slot] = null; }
    
    const streamToSend = isSpectator ? undefined : localStreamGlobal;
    try {
        const call = peer.call(targetId, streamToSend);
        calls[slot] = call;
        call.on('stream', (rs) => atribuirStream(rs, slot));
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
        if (info.count === 1) { statusClass = "waiting"; actionText = "DESAFIAR"; }
        else if (info.count >= 2) { statusClass = "full"; actionText = "ASSISTIR"; }
        const div = document.createElement('div');
        div.className = `arena-card ${statusClass}`;
        div.onclick = () => entrarNaMesa(id);
        div.innerHTML = `<div class="arena-id">${id.replace('mesa_', '')}</div><div class="arena-header"><span class="arena-name">${info.name}</span></div><div class="arena-players"><div class="player-slot">👤 ${info.nicks[0] || 'Vazio'}</div><div class="player-slot">⚔️ ${info.nicks[1] || 'Vazio'}</div></div><div class="arena-action">${actionText}</div>`;
        visualGrid.appendChild(div);
    }
});

window.entrarNaMesa = function (salaId) {
    salaAtual = salaId;
    lobbyScreen.style.display = 'none'; gameScreen.style.display = 'flex';
    mainSidebar.classList.add('closed');
    socket.emit('entrar_sala', { sala: salaId, nickname: myNickname });
};

socket.on('configurar_papel', (data) => {
    mySlot = data.slot;
    isSpectator = (mySlot === 'spec');
    
    // Limpeza de Estado Visual
    video.srcObject = (isSpectator) ? null : localStreamGlobal;
    remoteVideo.srcObject = null;
    
    if (isSpectator) setupSpectatorMode(); else setupPlayerMode();
    if (myPeerId) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: mySlot });
});

socket.on('atualizar_estado_jogo', (state) => {
    if (mySlot === 'p1') {
        atualizarHUD(hpMeDisplay, nameMeDisplay, state.p1);
        atualizarHUD(hpOpDisplay, nameOpDisplay, state.p2);
        hudRemoteContainer.style.display = (state.p2.peer_id) ? 'flex' : 'none';
        targetPeerIds.p2 = state.p2.peer_id;
    } else if (mySlot === 'p2') {
        atualizarHUD(hpMeDisplay, nameMeDisplay, state.p2);
        atualizarHUD(hpOpDisplay, nameOpDisplay, state.p1);
        hudRemoteContainer.style.display = (state.p1.peer_id) ? 'flex' : 'none';
        targetPeerIds.p1 = state.p1.peer_id;
    } else {
        atualizarHUD(hpMeDisplay, nameMeDisplay, state.p1);
        atualizarHUD(hpOpDisplay, nameOpDisplay, state.p2);
        hudRemoteContainer.style.display = 'flex';
        targetPeerIds.p1 = state.p1.peer_id;
        targetPeerIds.p2 = state.p2.peer_id;
    }
    
    if (!state.p1.peer_id) limparVideo('p1');
    if (!state.p2.peer_id) limparVideo('p2');
});

function atualizarHUD(elHp, elName, data) {
    if (elHp) elHp.innerText = data.hp;
    if (elName) elName.innerText = (data.nick && data.nick !== 'Vazio') ? data.nick : 'AGUARDANDO...';
}

function atribuirStream(stream, slot) {
    if (isSpectator) {
        if (slot === 'p1') { video.srcObject = stream; video.muted = false; video.play().catch(e=>{}); }
        else { remoteVideo.srcObject = stream; remoteVideo.muted = false; remoteVideo.play().catch(e=>{}); }
    } else {
        if (slot === 'p2' || slot === 'p1') { 
            remoteVideo.srcObject = stream; remoteVideo.muted = false; remoteVideo.play().catch(e=>{});
            isLocalMain = false; atualizarLayout(); 
        }
    }
}

function limparVideo(slot) {
    if (isSpectator) {
        if (slot === 'p1') video.srcObject = null; else remoteVideo.srcObject = null;
    } else {
        if ((mySlot === 'p1' && slot === 'p2') || (mySlot === 'p2' && slot === 'p1')) remoteVideo.srcObject = null;
    }
}

function mostrarVideoOponente(stream) {
    remoteVideo.srcObject = stream; remoteVideo.muted = false; remoteVideo.play().catch(e=>{});
    if (!isSpectator) { isLocalMain = false; atualizarLayout(); }
}

// ======================================================
// 6. MODOS DE TELA E CLIQUES (CORRIGIDO SEM CLONAGEM)
// ======================================================
function setupPlayerMode() {
    document.body.classList.remove('spectator-mode');
    if (getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'flex';
    
    // Limpa listeners antigos atribuindo null
    localWrapper.onclick = null; localWrapper.ondblclick = null;
    remoteWrapper.onclick = null; remoteWrapper.ondblclick = null;

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

function setupSpectatorMode() {
    if (container) container.classList.add('spectator-view');
    document.body.classList.add('spectator-mode');
    if (getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'none';
    
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) { remoteWrapper.classList.remove('video-full', 'video-pip'); remoteWrapper.style.display = 'block'; }
    if (btnTabSpec) { btnTabSpec.style.display = 'block'; btnTabSpec.parentElement.style.display = 'flex'; }
    switchTab('spec');
    
    // Configura cliques Spec
    configurarCliquesSpectator();
}

function configurarCliquesSpectator() {
    // Limpa listeners antigos
    localWrapper.onclick = null; localWrapper.ondblclick = null;
    remoteWrapper.onclick = null; remoteWrapper.ondblclick = null;

    // ESQUERDA (P1)
    localWrapper.onclick = (e) => {
        if (e.target.closest('.player-hud')) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
        clickTimer = setTimeout(() => { clickTimer = null; realizarScanGenerico(e, video, 'p1'); }, 250);
    };
    localWrapper.ondblclick = () => {
        if (clickTimer) clearTimeout(clickTimer);
        focusVideo('local');
    };

    // DIREITA (P2) - AQUI ESTAVA O ERRO (Usava rW clonado, agora usa direto o elemento)
    remoteWrapper.onclick = (e) => {
        if (e.target.closest('.player-hud')) return;
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
        clickTimer = setTimeout(() => { clickTimer = null; realizarScanGenerico(e, remoteVideo, 'p2'); }, 250);
    };
    remoteWrapper.ondblclick = () => {
        if (clickTimer) clearTimeout(clickTimer);
        focusVideo('remote');
    };
}

// SCANNER
function realizarScanGenerico(e, vidElement, slot) {
    uiCarregando();
    const r = vidElement.getBoundingClientRect();
    let nx = (e.clientX - r.left) / r.width; let ny = (e.clientY - r.top) / r.height;
    if (vidElement.classList.contains('rotated')) { nx = 1.0 - nx; ny = 1.0 - ny; }
    processarCrop(vidElement, nx, ny, true);
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

// CONTROLES E UTILITÁRIOS
window.focusVideo = function(target) {
    if (!isSpectator) return;
    const wLocal = getEl('wrapper-local');
    const wRemote = getEl('remote-wrapper');
    if ((target === 'local' && wLocal.classList.contains('focused')) || (target === 'remote' && wRemote.classList.contains('focused'))) {
        wLocal.classList.remove('focused', 'dimmed'); wRemote.classList.remove('focused', 'dimmed'); return;
    }
    if (target === 'local') { wLocal.classList.add('focused'); wRemote.classList.add('dimmed'); wLocal.classList.remove('dimmed'); wRemote.classList.remove('focused'); } 
    else { wRemote.classList.add('focused'); wLocal.classList.add('dimmed'); wRemote.classList.remove('dimmed'); wLocal.classList.remove('focused'); }
};

window.toggleMuteSpec = function(target, btn) {
    const vid = (target === 'p1') ? video : remoteVideo;
    vid.muted = !vid.muted;
    btn.classList.toggle('active', vid.muted);
    btn.querySelector('.material-icons-round').innerText = vid.muted ? 'volume_off' : 'volume_up';
};

window.rotateSpec = function(target) {
    const vid = (target === 'p1') ? video : remoteVideo;
    vid.classList.toggle('rotated');
};

window.changeLife = function (target, amount) {
    if (isSpectator) return;
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
    if (data.tipo === 'duel' && isSpectator) return;
    const div = document.createElement('div'); div.classList.add('message-bubble');
    if (data.remetente === socket.id) { div.classList.add('msg-me'); div.innerText = data.texto; }
    else { div.classList.add('msg-op'); div.innerText = data.texto; tocarSom('msg'); if (chatSidebar.classList.contains('closed')) { let c = parseInt(dockBadge.innerText || '0') + 1; dockBadge.innerText = c; dockBadge.style.display = 'block'; } }
    chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('update_specs_count', (data) => {
    if (specCountVal) specCountVal.innerText = data.count;
    if (spectatorCounter) spectatorCounter.style.display = (data.count > 0) ? 'flex' : 'none';
    const showTab = (data.count > 0 || isSpectator);
    if (btnTabSpec) btnTabSpec.style.display = showTab ? 'block' : 'none';
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
    } else if (tabName === 'spec') {
        if(btnTabSpec) btnTabSpec.classList.add('active');
        chatContainer.style.display = 'none'; logsContainer.style.display = 'none';
    }
};

window.toggleSidebarChat = function () { chatSidebar.classList.toggle('closed'); if (!chatSidebar.classList.contains('closed') && dockBadge) { dockBadge.style.display = 'none'; dockBadge.innerText = '0'; } };
window.toggleSidebarScan = function () { mainSidebar.classList.toggle('closed'); if (mainSidebar.classList.contains('closed')) { if (sidebarToggleBtn) { sidebarToggleBtn.classList.add('closed'); sidebarToggleBtn.style.display = 'none'; } } else { if (sidebarToggleBtn) { sidebarToggleBtn.classList.remove('closed'); sidebarToggleBtn.innerHTML = "<"; sidebarToggleBtn.style.display = 'flex'; } } };
if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebarScan);

function atualizarLayout() {
    if (isSpectator) return;
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');
    if (isLocalMain) { localWrapper.classList.add('video-full'); if (remoteVideo.srcObject && remoteWrapper) { remoteWrapper.classList.add('video-pip'); remoteWrapper.style.display = 'flex'; } else { remoteWrapper.style.display = 'none'; } }
    else { if (remoteWrapper) { remoteWrapper.classList.add('video-full'); remoteWrapper.style.display = 'flex'; } localWrapper.classList.add('video-pip'); }
}
window.toggleLayout = function () { if (isSpectator) return; if (!remoteVideo.srcObject) return; isLocalMain = !isLocalMain; atualizarLayout(); };
window.mudarTema = function (tema) { document.body.className = isSpectator ? "spectator-mode" : ""; if (tema) document.body.classList.add(tema); localStorage.setItem('ether_tema_preferido', tema); getEl('modal-temas').style.display = 'none'; };
window.abrirModal = function (id) { getEl(id).style.display = 'flex'; };
window.fecharModal = function (e, id) { if (e.target.id === id) getEl(id).style.display = 'none'; };
window.toggleMute = function (event) {
    if (isSpectator) return;
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
window.toggleShareAudio = function () { shareAudioWithSpecs = document.getElementById('chkShareAudio').checked; };
window.closeCardModal = function () { cardModal.style.display = 'none'; };
window.expandCard = function () { if (stLastCardImg.src && stLastCardImg.style.display !== 'none') { modalImg.src = stLastCardImg.src; cardModal.style.display = 'flex'; } };

function enviarParaPython(b64, spy) {
    fetch('/identificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: b64 }), timeout: 15000 }).then(r => r.json()).then(d => {
        stLoading.style.display = 'none';
        if (d.sucesso) {
            stEmptyState.style.display = 'none';
            stLastCardImg.src = "data:image/jpeg;base64," + d.imagem;
            stLastCardImg.style.display = 'block';
            addToHistory(d.dados.nome, d.imagem);
            tocarSom('scan');
            if (!spy && salaAtual !== "" && !isSpectator) socket.emit('jogar_carta', { sala: salaAtual, nome: d.dados.nome, imagem: d.imagem, dados: d.dados });
        } else { stEmptyState.innerText = "Falha."; stEmptyState.style.display = 'flex'; }
    }).catch(err => { stLoading.style.display = 'none'; stEmptyState.innerText = "Erro."; });
}
function addToHistory(n, b64) { if (!stHistoryList) return; const itemExistente = Array.from(stHistoryList.children).find(item => item.dataset.cardName === n); if (itemExistente) { stHistoryList.prepend(itemExistente); const img = itemExistente.querySelector('img'); if (img) img.src = "data:image/jpeg;base64," + b64; itemExistente.style.transition = 'none'; itemExistente.style.transform = 'scale(1.1)'; setTimeout(() => { itemExistente.style.transition = 'transform 0.2s'; itemExistente.style.transform = 'scale(1)'; }, 100); return; } const item = document.createElement('div'); item.className = 'st-history-item'; item.dataset.cardName = n; item.innerHTML = `<img class="st-history-thumb" src="data:image/jpeg;base64,${b64}" title="${n}">`; item.onclick = () => { stLastCardImg.src = "data:image/jpeg;base64," + b64; stLastCardImg.style.display = 'block'; stEmptyState.style.display = 'none'; }; stHistoryList.prepend(item); }
function uiCarregando() { stEmptyState.style.display = 'none'; stLastCardImg.style.display = 'none'; stLoading.style.display = 'block'; }
socket.on('executar_crop_local', (d) => { const w = video.videoWidth, h = video.videoHeight; let rx = d.x * w, ry = d.y * h; let x = rx - CROP_W / 2, y = ry - CROP_H / 2; canvas.width = CROP_W; canvas.height = CROP_H; ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); socket.emit('devolver_scan_remoto', { destinatario: d.solicitante, imagem: canvas.toDataURL('image/jpeg', 0.6) }); });
socket.on('receber_imagem_remota', (d) => enviarParaPython(d.imagem, true));
socket.on('oponente_jogou', (d) => addToHistory(d.nome, d.imagem));