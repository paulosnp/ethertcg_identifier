function getEl(id) { return document.getElementById(id); }

// UI
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
const stLastCardName = getEl('st-last-card-name');
const stLastCardNameBar = getEl('st-last-card-name-bar');
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
const statusOverlay = getEl('status-overlay');
const statusText = getEl('status-text');
const sndMsg = getEl('snd-msg');
const sndLife = getEl('snd-life');
const sndScan = getEl('snd-scan');
const canvas = getEl('canvasHidden');
let ctx = null; if (canvas) { ctx = canvas.getContext('2d'); }
const CROP_W = 400;
const CROP_H = 600;

// STATE
const socket = io({ reconnection: true, reconnectionDelay: 500 });
let peer = null;
let myPeerId = null;
let activeCall = null;
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

// --- BOOT ---
async function iniciarCameraGlobal() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        video.srcObject = stream; video.muted = true; localStreamGlobal = stream;
    } catch (e) { console.error(e); }
}

function iniciarPeerAntecipado() {
    try {
        peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
        peer.on('open', (id) => {
            myPeerId = id;
            if (salaAtual && mySlot) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: mySlot });
        });

        // P2 ATENDE AQUI
        peer.on('call', (call) => {
            call.answer(localStreamGlobal);
            call.on('stream', (rs) => mostrarVideoOponente(rs));
            activeCall = call;
        });
    } catch (e) { }
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

// --- LOBBY ---
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
    if (sidebarToggleBtn) { sidebarToggleBtn.classList.add('closed'); sidebarToggleBtn.style.display = 'none'; }
    socket.emit('entrar_sala', { sala: salaId, nickname: myNickname });
};

// --- CONFIG PAPER ---
socket.on('configurar_papel', (data) => {
    mySlot = data.slot;
    isSpectator = (mySlot === 'spec');
    if (isSpectator) { if (container) container.classList.add('spectator-view'); }
    if (myPeerId) socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: mySlot });
});

// --- CORE LOGIC: ESTADO DO JOGO ---
socket.on('atualizar_estado_jogo', (state) => {
    if (mySlot === 'p1') {
        atualizarHUD(hpMeDisplay, nameMeDisplay, state.p1);
        atualizarHUD(hpOpDisplay, nameOpDisplay, state.p2);
        hudRemoteContainer.style.display = (state.p2.peer_id) ? 'flex' : 'none';
        checkAndCall(state.p2.peer_id); // P1 LIGA
    } else if (mySlot === 'p2') {
        atualizarHUD(hpMeDisplay, nameMeDisplay, state.p2);
        atualizarHUD(hpOpDisplay, nameOpDisplay, state.p1);
        hudRemoteContainer.style.display = (state.p1.peer_id) ? 'flex' : 'none';
        // P2 ESPERA
    } else {
        atualizarHUD(hpMeDisplay, nameMeDisplay, state.p1);
        atualizarHUD(hpOpDisplay, nameOpDisplay, state.p2);
        hudRemoteContainer.style.display = 'flex';
    }
});

function atualizarHUD(elHp, elName, data) {
    if (elHp) elHp.innerText = data.hp;
    if (elName) elName.innerText = (data.nick && data.nick !== 'Vazio') ? data.nick : 'AGUARDANDO...';
}

// --- LOGICA DE LIGAÇÃO SEGURA ---
let lastCalledId = null;
function checkAndCall(targetPeerId) {
    if (!targetPeerId) return;
    if (targetPeerId === lastCalledId) return;
    if (activeCall && activeCall.open) return;

    lastCalledId = targetPeerId;
    setTimeout(() => {
        if (peer && localStreamGlobal) {
            const call = peer.call(targetPeerId, localStreamGlobal);
            activeCall = call;
            call.on('stream', (rs) => mostrarVideoOponente(rs));
            call.on('close', () => { lastCalledId = null; activeCall = null; });
            call.on('error', () => { lastCalledId = null; activeCall = null; });
        }
    }, 1000);
}

function mostrarVideoOponente(stream) {
    if (remoteVideo) {
        remoteVideo.srcObject = stream; remoteVideo.muted = false;
        isLocalMain = false; atualizarLayout();
    }
}

// --- VIDA & LOGS ---
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
    if (activeTab !== 'logs' && dockBadge) {
        // Notificação simples no badge se não estiver vendo logs
    }
});

// --- CHAT ---
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

// --- UTILS UI ---
window.switchTab = function (tabName) {
    activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (tabName === 'chat') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active'); chatContainer.style.display = 'flex'; logsContainer.style.display = 'none';
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active'); chatContainer.style.display = 'none'; logsContainer.style.display = 'flex';
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

window.mudarTema = function (tema) { document.body.className = ""; if (tema) document.body.classList.add(tema); localStorage.setItem('ether_tema_preferido', tema); getEl('modal-temas').style.display = 'none'; };
window.abrirModal = function (id) { getEl(id).style.display = 'flex'; };
window.fecharModal = function (e, id) { if (e.target.id === id) getEl(id).style.display = 'none'; };

window.toggleMute = function (event) {
    if (isSpectator) return;
    const stream = localStreamGlobal || video.srcObject;
    if (stream && stream.getAudioTracks().length > 0) {
        const at = stream.getAudioTracks()[0]; at.enabled = !at.enabled;
        const icon = event.currentTarget.querySelector('.material-icons-round');
        if (at.enabled) { icon.innerText = "mic"; event.currentTarget.classList.remove('active'); }
        else { icon.innerText = "mic_off"; event.currentTarget.classList.add('active'); }
    }
};
window.toggleRotationMain = function () {
    if (isLocalMain) { isLocalRotated = !isLocalRotated; video.classList.toggle('rotated', isLocalRotated); }
    else { isRemoteRotated = !isRemoteRotated; remoteVideo.classList.toggle('rotated', isRemoteRotated); }
};

// --- SCAN ---
if (localWrapper) localWrapper.addEventListener('click', (e) => {
    if (e.target.closest('.player-hud')) return;
    if (!isLocalMain && !isSpectator) { toggleLayout(); return; }
    realizarScanLocal(e.clientX, e.clientY); if (mainSidebar.classList.contains('closed')) toggleSidebarScan();
});
if (remoteWrapper) remoteWrapper.addEventListener('click', (e) => {
    if (e.target.closest('.player-hud')) return;
    if (isLocalMain && !isSpectator) { toggleLayout(); return; }
    realizarScanRemoto(e.clientX, e.clientY);
});
function realizarScanLocal(cx, cy) { uiCarregando(); const r = video.getBoundingClientRect(); let rx = cx - r.left, ry = cy - r.top; if (!isSpectator && isLocalRotated) { rx = r.width - rx; ry = r.height - ry; } processarCrop(video, rx, ry, video.videoWidth / r.width, video.videoHeight / r.height, false); }
function realizarScanRemoto(cx, cy) {
    if (isSpectator) { uiCarregando(); const r = remoteVideo.getBoundingClientRect(); let rx = cx - r.left, ry = cy - r.top; processarCrop(remoteVideo, rx, ry, remoteVideo.videoWidth / r.width, remoteVideo.videoHeight / r.height, false); } else {
        stEmptyState.innerText = "Espionando..."; stLoading.style.display = 'block'; if (mainSidebar.classList.contains('closed')) toggleSidebarScan();
        socket.emit('pedido_scan_remoto', { sala: salaAtual, x: (cx - remoteVideo.getBoundingClientRect().left) / remoteVideo.getBoundingClientRect().width, y: (cy - remoteVideo.getBoundingClientRect().top) / remoteVideo.getBoundingClientRect().height, solicitante: socket.id });
    }
}
socket.on('executar_crop_local', (d) => { const w = video.videoWidth, h = video.videoHeight; let rx = d.x * w, ry = d.y * h; let x = rx - CROP_W / 2, y = ry - CROP_H / 2; canvas.width = CROP_W; canvas.height = CROP_H; ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); socket.emit('devolver_scan_remoto', { destinatario: d.solicitante, imagem: canvas.toDataURL('image/jpeg', 0.8) }); });
socket.on('receber_imagem_remota', (d) => enviarParaPython(d.imagem, true));
socket.on('oponente_jogou', (d) => addToHistory(`[RIVAL] ${d.nome}`, d.imagem));
function processarCrop(vid, rx, ry, sx, sy, spy) { let x = (rx * sx) - CROP_W / 2, y = (ry * sy) - CROP_H / 2; canvas.width = CROP_W; canvas.height = CROP_H; ctx.drawImage(vid, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); enviarParaPython(canvas.toDataURL('image/jpeg', 0.9), spy); }
function enviarParaPython(b64, spy) { fetch('/identificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: b64 }), timeout: 15000 }).then(r => r.json()).then(d => { stLoading.style.display = 'none'; if (d.sucesso) { stEmptyState.style.display = 'none'; stLastCardImg.src = "data:image/jpeg;base64," + d.imagem; stLastCardImg.style.display = 'block'; stLastCardName.innerText = (spy ? "[ESPIÃO] " : "") + d.dados.nome; stLastCardNameBar.style.display = 'flex'; addToHistory(d.dados.nome, d.imagem); tocarSom('scan'); if (!spy && salaAtual !== "" && !isSpectator) socket.emit('jogar_carta', { sala: salaAtual, nome: d.dados.nome, imagem: d.imagem, dados: d.dados }); } else { stEmptyState.innerText = "Falha ao identificar."; stEmptyState.style.display = 'flex'; } }).catch(err => { stLoading.style.display = 'none'; stEmptyState.innerText = "Erro na conexão."; }); }
function uiCarregando() { stEmptyState.style.display = 'none'; stLastCardImg.style.display = 'none'; stLastCardNameBar.style.display = 'none'; stLoading.style.display = 'block'; }
function addToHistory(n, b64) { if (!stHistoryList) return; const item = document.createElement('div'); item.className = 'st-history-item'; item.innerHTML = `<img class="st-history-thumb" src="data:image/jpeg;base64,${b64}"><div class="st-history-info"><span class="st-history-name">${n}</span></div>`; item.onclick = () => { stLastCardImg.src = "data:image/jpeg;base64," + b64; stLastCardImg.style.display = 'block'; stLastCardName.innerText = n; stLastCardNameBar.style.display = 'flex'; stEmptyState.style.display = 'none'; }; stHistoryList.prepend(item); }
function tocarSom(tipo) { if (!isSoundOn) return; try { let audio = null; if (tipo === 'msg') audio = sndMsg; else if (tipo === 'life') audio = sndLife; else if (tipo === 'scan') audio = sndScan; if (audio) { audio.currentTime = 0; audio.play().catch(e => { }); } } catch (e) { } }
window.toggleSoundSetting = function () { isSoundOn = document.getElementById('chkSound').checked; };
window.toggleShareAudio = function () { shareAudioWithSpecs = document.getElementById('chkShareAudio').checked; };
window.closeCardModal = function () { cardModal.style.display = 'none'; };
window.expandCard = function () { if (stLastCardImg.src && stLastCardImg.style.display !== 'none') { modalImg.src = stLastCardImg.src; cardModal.style.display = 'flex'; } };
socket.on('update_specs_count', (data) => { if (specCountVal) specCountVal.innerText = data.count; if (spectatorCounter) spectatorCounter.style.display = (data.count > 0) ? 'flex' : 'none'; const showTab = (data.count > 0 || isSpectator); if (btnTabSpec) btnTabSpec.style.display = showTab ? 'block' : 'none'; });
function setupPlayerMode() { if (getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'flex'; }
function setupSpectatorMode() { if (container) container.classList.add('spectator-view'); if (getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'none'; document.querySelectorAll('.hud-btn').forEach(btn => btn.style.display = 'none'); if (btnTabSpec) btnTabSpec.style.display = 'block'; switchTab('spec'); }