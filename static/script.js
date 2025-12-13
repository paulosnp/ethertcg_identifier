// ======================================================
// 1. REFERÊNCIAS DO DOM
// ======================================================
function getEl(id) { return document.getElementById(id); }

// Welcome Screen
const welcomeScreen = getEl('welcome-screen');
const welcomeNickInput = getEl('welcome-nick-input');
const btnEnterWelcome = getEl('btn-enter-welcome');
const currentNickLobby = getEl('current-nick-lobby');

// Main Screens
const lobbyScreen = getEl('lobby-view');
const gameScreen = getEl('game-view');
const visualGrid = getEl('visual-tables-grid');

// Sidebars e Toggles
const sidebarToggleBtn = getEl('sidebarToggle');
const mainSidebar = getEl('mainSidebar');
const chatSidebar = getEl('chatSidebar');

// Video & Dock
const container = getEl('container');
const video = getEl('videoInput');
const remoteVideo = getEl('remoteVideo');
const remoteWrapper = getEl('remote-wrapper');
const localWrapper = document.querySelector('.video-wrapper.local');
const dockBadge = getEl('dock-badge');

// Sidebar Conteúdo
const stLastCardImg = getEl('st-last-card-img');
const stLastCardName = getEl('st-last-card-name');
const stLastCardNameBar = getEl('st-last-card-name-bar');
const stEmptyState = getEl('st-empty-state');
const stLoading = getEl('st-loading');
const stHistoryList = getEl('st-history-list');

// Chat
const msgInput = getEl('msgInput');
const msgSpecInput = getEl('msgSpecInput');
const chatMessages = getEl('chat-messages');
const specMessages = getEl('spec-messages');
const logMessages = getEl('log-messages');
const chatContainer = getEl('chat-container');
const specContainer = getEl('spec-container');
const logsContainer = getEl('logs-container');
const btnTabSpec = getEl('btn-tab-spec');
const spectatorCounter = getEl('spectator-counter');
const specCountVal = getEl('spec-count-val');

// HUD
const hpOpDisplay = getEl('hp-op');
const hpMeDisplay = getEl('hp-me');
const nameOpDisplay = getEl('name-op');
const nameMeDisplay = getEl('name-me');
const hudRemoteContainer = getEl('hud-remote-container');

// Modais
const cardModal = getEl('card-modal');
const modalImg = getEl('modal-img');
const statusOverlay = getEl('status-overlay');
const statusText = getEl('status-text');

// Audio
const sndMsg = getEl('snd-msg');
const sndLife = getEl('snd-life');
const sndScan = getEl('snd-scan');

// Canvas
const canvas = getEl('canvasHidden');
let ctx = null; if (canvas) { ctx = canvas.getContext('2d'); }

// ======================================================
// 2. ESTADO
// ======================================================
const CROP_W = 400; const CROP_H = 600;
const socket = io(undefined, { reconnection: true });
let peer = null;
let myPeerId = null;
let salaAtual = "";
let myNickname = "Jogador";
let isLocalMain = true;
let isLocalRotated = false;
let isRemoteRotated = false;
let hpOp = 20; let hpMe = 20;
let activeTab = 'chat';
let isSoundOn = false;
let shareAudioWithSpecs = false;
let isSpectator = false;
let spectatorSlots = 0;
let localStreamGlobal = null;
let roomNamesData = { p1: "AGUARDANDO...", p2: "AGUARDANDO..." };

// ======================================================
// 3. INIT & WELCOME
// ======================================================
async function iniciarCameraGlobal() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
        video.srcObject = stream; video.muted = true; localStreamGlobal = stream;
        console.log("Câmera OK");
    } catch (e) { console.error("Erro Câmera:", e); }
}

document.addEventListener('DOMContentLoaded', () => {
    iniciarCameraGlobal();
    const temaSalvo = localStorage.getItem('ether_tema_preferido');
    if (temaSalvo) mudarTema(temaSalvo);

    const nickSalvo = localStorage.getItem('ether_nickname_saved');
    if (nickSalvo) {
        myNickname = nickSalvo;
        welcomeScreen.style.display = 'none';
        currentNickLobby.innerText = myNickname;
    } else {
        welcomeScreen.classList.remove('hidden');
    }
});

if (btnEnterWelcome) {
    btnEnterWelcome.addEventListener('click', confirmarNickWelcome);
}
if (welcomeNickInput) {
    welcomeNickInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmarNickWelcome(); });
}

function confirmarNickWelcome() {
    const nick = welcomeNickInput.value.trim().toUpperCase();
    if (nick.length < 3) { alert("Nome muito curto!"); return; }
    localStorage.setItem('ether_nickname_saved', nick);
    myNickname = nick;
    welcomeScreen.style.opacity = '0';
    setTimeout(() => { welcomeScreen.style.display = 'none'; currentNickLobby.innerText = myNickname; }, 500);
}

// ======================================================
// 4. LOBBY & ENTRADA
// ======================================================
socket.on('lobby_update', (rooms) => {
    if (salaAtual !== "" || !visualGrid) return;
    visualGrid.innerHTML = "";
    for (const [id, info] of Object.entries(rooms)) {
        const count = info.count;
        let statusClass = "empty"; let actionText = "ENTRAR";
        let p1 = info.nicks[0] || "Vazio"; let p2 = info.nicks[1] || "Vazio";
        if (count === 1) { statusClass = "waiting"; actionText = "DESAFIAR"; }
        else if (count >= 2) { statusClass = "full"; actionText = "ASSISTIR"; }
        const div = document.createElement('div');
        div.className = `arena-card ${statusClass}`;
        div.onclick = () => entrarNaMesa(id);
        div.innerHTML = `<div class="arena-id">${id.replace('mesa_', '')}</div><div class="arena-header"><span class="arena-name">${info.name}</span></div><div class="arena-players"><div class="player-slot ${info.nicks[0] ? 'filled' : 'empty'}">👤 ${p1}</div><div class="player-slot ${info.nicks[1] ? 'filled' : 'empty'}">⚔️ ${p2}</div></div><div class="arena-action">${actionText}</div>`;
        visualGrid.appendChild(div);
    }
});

window.entrarNaMesa = function (salaId) {
    salaAtual = salaId;
    lobbyScreen.style.display = 'none'; gameScreen.style.display = 'flex';
    socket.emit('entrar_sala', { sala: salaId, nickname: myNickname });
    if (statusOverlay) { statusOverlay.style.display = 'flex'; statusText.innerText = "Conectado"; }
};

socket.on('configurar_papel', (data) => {
    isSpectator = (data.role === 'spectator');
    if (isSpectator) {
        setupSpectatorMode();
        if (localStreamGlobal) { localStreamGlobal.getTracks().forEach(track => track.stop()); video.srcObject = null; }
        iniciarPeer(null);
    } else {
        setupPlayerMode();
        if (localStreamGlobal) iniciarPeer(localStreamGlobal);
        else iniciarCameraGlobal().then(() => iniciarPeer(localStreamGlobal));
    }
    refreshNameHUD();
});

// ======================================================
// 5. SIDEBARS & TOGGLES
// ======================================================
if (sidebarToggleBtn && mainSidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
        mainSidebar.classList.toggle('closed');
        sidebarToggleBtn.classList.toggle('closed');
        sidebarToggleBtn.innerHTML = mainSidebar.classList.contains('closed') ? "&gt;" : "&lt;";
    });
}

window.toggleSidebarScan = function () {
    mainSidebar.classList.toggle('closed');
    // Se abriu a sidebar, ajusta o botão
    if (mainSidebar.classList.contains('closed')) {
        sidebarToggleBtn.classList.add('closed');
        sidebarToggleBtn.innerHTML = ">";
        sidebarToggleBtn.style.display = 'none'; // Esconde botão flutuante se fechado pela dock
    } else {
        sidebarToggleBtn.classList.remove('closed');
        sidebarToggleBtn.innerHTML = "<";
        sidebarToggleBtn.style.display = 'flex'; // Mostra botão flutuante
    }
};

window.toggleSidebarChat = function () {
    chatSidebar.classList.toggle('closed');
    if (!chatSidebar.classList.contains('closed') && dockBadge) { dockBadge.style.display = 'none'; dockBadge.innerText = '0'; }
};

// ======================================================
// 6. SCAN, HISTÓRICO E VÍDEO
// ======================================================
if (localWrapper) localWrapper.addEventListener('click', (e) => {
    if (e.target.closest('.player-hud')) return; // Não scaneia se clicar no HUD
    if (!isLocalMain && !isSpectator) { e.stopPropagation(); toggleLayout(); return; }
    realizarScanLocal(e.clientX, e.clientY);
});

if (remoteWrapper) remoteWrapper.addEventListener('click', (e) => {
    if (e.target.closest('.player-hud')) return;
    if (isLocalMain && !isSpectator) { e.stopPropagation(); toggleLayout(); return; }
    realizarScanRemoto(e.clientX, e.clientY);
});

function realizarScanLocal(cx, cy) { uiCarregando(); const r = video.getBoundingClientRect(); let rx = cx - r.left, ry = cy - r.top; if (!isSpectator && isLocalRotated) { rx = r.width - rx; ry = r.height - ry; } processarCrop(video, rx, ry, video.videoWidth / r.width, video.videoHeight / r.height, false); if (mainSidebar.classList.contains('closed')) toggleSidebarScan(); }
function realizarScanRemoto(cx, cy) {
    if (isSpectator) { uiCarregando(); const r = remoteVideo.getBoundingClientRect(); let rx = cx - r.left, ry = cy - r.top; processarCrop(remoteVideo, rx, ry, remoteVideo.videoWidth / r.width, remoteVideo.videoHeight / r.height, false); } else {
        stEmptyState.innerText = "Espionando..."; stLoading.style.display = 'block';
        if (mainSidebar.classList.contains('closed')) toggleSidebarScan();
        socket.emit('pedido_scan_remoto', { sala: salaAtual, x: (cx - remoteVideo.getBoundingClientRect().left) / remoteVideo.getBoundingClientRect().width, y: (cy - remoteVideo.getBoundingClientRect().top) / remoteVideo.getBoundingClientRect().height, solicitante: socket.id });
    }
}

socket.on('executar_crop_local', (d) => { const w = video.videoWidth, h = video.videoHeight; let rx = d.x * w, ry = d.y * h; let x = rx - CROP_W / 2, y = ry - CROP_H / 2; canvas.width = CROP_W; canvas.height = CROP_H; ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); socket.emit('devolver_scan_remoto', { destinatario: d.solicitante, imagem: canvas.toDataURL('image/jpeg', 0.8) }); });
socket.on('receber_imagem_remota', (d) => enviarParaPython(d.imagem, true));
socket.on('oponente_jogou', (d) => addToHistory(`[RIVAL] ${d.nome}`, d.imagem));

function processarCrop(vid, rx, ry, sx, sy, spy) { let x = (rx * sx) - CROP_W / 2, y = (ry * sy) - CROP_H / 2; canvas.width = CROP_W; canvas.height = CROP_H; ctx.drawImage(vid, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); enviarParaPython(canvas.toDataURL('image/jpeg', 0.9), spy); }

function enviarParaPython(b64, spy) {
    fetch('/identificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: b64 }), timeout: 15000 })
        .then(r => r.json()).then(d => {
            stLoading.style.display = 'none';
            if (d.sucesso) {
                stEmptyState.style.display = 'none';
                stLastCardImg.src = "data:image/jpeg;base64," + d.imagem; stLastCardImg.style.display = 'block';
                stLastCardName.innerText = (spy ? "[ESPIÃO] " : "") + d.dados.nome; stLastCardNameBar.style.display = 'flex';
                addToHistory(d.dados.nome, d.imagem); tocarSom('scan');
                if (!spy && salaAtual !== "" && !isSpectator) socket.emit('jogar_carta', { sala: salaAtual, nome: d.dados.nome, imagem: d.imagem, dados: d.dados });
            } else { stEmptyState.innerText = "Falha ao identificar."; stEmptyState.style.display = 'flex'; }
        }).catch(err => { stLoading.style.display = 'none'; stEmptyState.innerText = "Erro na conexão."; });
}

function uiCarregando() { stEmptyState.style.display = 'none'; stLastCardImg.style.display = 'none'; stLastCardNameBar.style.display = 'none'; stLoading.style.display = 'block'; }
function addToHistory(n, b64) {
    if (!stHistoryList) return;
    const item = document.createElement('div'); item.className = 'st-history-item';
    item.innerHTML = `<img class="st-history-thumb" src="data:image/jpeg;base64,${b64}"><div class="st-history-info"><span class="st-history-name">${n}</span></div>`;
    item.onclick = () => { stLastCardImg.src = "data:image/jpeg;base64," + b64; stLastCardImg.style.display = 'block'; stLastCardName.innerText = n; stLastCardNameBar.style.display = 'flex'; stEmptyState.style.display = 'none'; };
    stHistoryList.prepend(item);
}

// ======================================================
// 7. UTILS & HUD LOGIC
// ======================================================
function refreshNameHUD() {
    if (!nameMeDisplay || !nameOpDisplay) return;
    let p2Name = roomNamesData.p2;

    if (isSpectator) {
        nameMeDisplay.innerText = roomNamesData.p1;
        nameOpDisplay.innerText = roomNamesData.p2;
        hudRemoteContainer.style.display = (roomNamesData.p2 !== "AGUARDANDO...") ? 'flex' : 'none';
    } else {
        nameMeDisplay.innerText = myNickname;
        let opName = (roomNamesData.p1 === myNickname) ? roomNamesData.p2 : roomNamesData.p1;
        if (opName && opName !== "AGUARDANDO...") {
            nameOpDisplay.innerText = opName;
            hudRemoteContainer.style.display = 'flex';
        } else {
            nameOpDisplay.innerText = "AGUARDANDO...";
            hudRemoteContainer.style.display = 'none';
        }
    }
}

socket.on('atualizar_nomes_sala', (data) => { roomNamesData = data; refreshNameHUD(); });

window.mudarTema = function (tema) { document.body.className = ""; if (tema) document.body.classList.add(tema); localStorage.setItem('ether_tema_preferido', tema); getEl('modal-temas').style.display = 'none'; };
window.abrirModal = function (id) { getEl(id).style.display = 'flex'; };
window.fecharModal = function (e, id) { if (e.target.id === id) getEl(id).style.display = 'none'; };
window.toggleMute = function (event) { if (event) event.stopPropagation(); if (isSpectator) return; const at = video.srcObject.getAudioTracks()[0]; if (at) { at.enabled = !at.enabled; const icon = getEl('icon-mic'); const btn = event.currentTarget; if (at.enabled) { icon.innerText = "mic"; btn.classList.remove('active'); } else { icon.innerText = "mic_off"; btn.classList.add('active'); } } };
window.toggleRotation = function (event, target) { if (event) event.stopPropagation(); if (target === 'local') { isLocalRotated = !isLocalRotated; video.classList.toggle('rotated', isLocalRotated); } else { isRemoteRotated = !isRemoteRotated; remoteVideo.classList.toggle('rotated', isRemoteRotated); } };
socket.on('update_specs_count', (data) => { if (specCountVal) specCountVal.innerText = data.count; if (spectatorCounter) spectatorCounter.style.display = (data.count > 0) ? 'flex' : 'none'; const showTab = (data.count > 0 || isSpectator); if (btnTabSpec) btnTabSpec.style.display = showTab ? 'block' : 'none'; });
window.handleChatKey = function (e, tipo) { if (e.key === 'Enter') enviarMensagem(tipo); };
window.enviarMensagem = function (tipo) { const input = (tipo === 'duel') ? msgInput : msgSpecInput; const texto = input.value.trim(); if (texto === "" || salaAtual === "") return; socket.emit('enviar_chat', { sala: salaAtual, texto: texto, remetente: socket.id, nick: myNickname, tipo: tipo }); input.value = ""; };
socket.on('receber_chat', (data) => { if (data.tipo === 'duel' && isSpectator) return; let targetDiv = (data.tipo === 'duel') ? chatMessages : specMessages; if (data.tipo === 'spec' && btnTabSpec && btnTabSpec.style.display === 'none') btnTabSpec.style.display = 'block'; const div = document.createElement('div'); div.classList.add('message-bubble'); if (data.remetente === socket.id) { div.classList.add('msg-me'); div.innerText = data.texto; } else { div.classList.add('msg-op'); const prefix = (data.tipo === 'spec') ? `[${data.nick || 'Spec'}] ` : ""; div.innerText = prefix + data.texto; tocarSom('msg'); if (chatSidebar.classList.contains('closed')) { if (dockBadge) { let c = parseInt(dockBadge.innerText || '0') + 1; dockBadge.innerText = c; dockBadge.style.display = 'block'; } } } targetDiv.appendChild(div); targetDiv.scrollTop = targetDiv.scrollHeight; });
window.switchTab = function (tabName) { activeTab = tabName; document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active')); let idx = (tabName === 'spec') ? 1 : (tabName === 'logs' ? 2 : 0); document.querySelectorAll('.tab-btn')[idx].classList.add('active'); chatContainer.style.display = (tabName === 'chat' ? 'flex' : 'none'); specContainer.style.display = (tabName === 'spec' ? 'flex' : 'none'); logsContainer.style.display = (tabName === 'logs' ? 'flex' : 'none'); };
window.changeLife = function (target, amount) { if (isSpectator) return; if (target === 'op') { hpOp += amount; if (hpOp < 0) hpOp = 0; if (hpOp > 40) hpOp = 40; hpOpDisplay.innerText = hpOp; } else { hpMe += amount; if (hpMe < 0) hpMe = 0; if (hpMe > 40) hpMe = 40; hpMeDisplay.innerText = hpMe; } tocarSom('life'); socket.emit('atualizar_vida', { sala: salaAtual, alvo: target, valor: (target === 'me' ? hpMe : hpOp), delta: amount }); };
socket.on('receber_vida', (data) => { if (!isSpectator) { if (data.alvo === 'me') { hpOp = data.valor; hpOpDisplay.innerText = hpOp; } else { hpMe = data.valor; hpMeDisplay.innerText = hpMe; } } else { if (data.alvo === 'me') { if (data.valor !== hpMe) { hpMe = data.valor; hpMeDisplay.innerText = hpMe; } else { hpOp = data.valor; hpOpDisplay.innerText = hpOp; } } } tocarSom('life'); });
socket.on('log_vida', (data) => { const div = document.createElement('div'); div.classList.add('msg-log'); let ator = (data.remetente === socket.id) ? "VOCÊ" : "OPONENTE"; if (isSpectator) ator = "JOGADOR"; const sinal = data.delta > 0 ? "+" : ""; div.innerText = `[${data.hora}] ${ator} alterou vida: ${sinal}${data.delta} (Total: ${data.valor_final})`; logMessages.appendChild(div); logMessages.scrollTop = logMessages.scrollHeight; });
function iniciarPeer(myStream) { try { peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } }); peer.on('open', (id) => { myPeerId = id; socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: (isSpectator ? 'spec' : 'player') }); }); peer.on('call', (call) => { let streamToSend = myStream; if (!isSpectator && !shareAudioWithSpecs && call.metadata?.role === 'spec') { const vt = myStream?.getVideoTracks?.(); if (vt && vt.length > 0) streamToSend = new MediaStream([vt[0]]); } if (myStream) { call.answer(streamToSend); } else { call.answer(); } call.on('stream', (rs) => isSpectator ? handleSpectatorStream(rs) : mostrarVideoOponente(rs)); }); } catch (err) { console.error('Erro PeerJS:', err); } }
socket.on('novo_peer_na_sala', (data) => { if (data.peerId === myPeerId) return; if (!isSpectator && peer && video.srcObject) { let streamToSend = video.srcObject; if (!shareAudioWithSpecs) { const vt = video.srcObject.getVideoTracks(); if (vt.length > 0) streamToSend = new MediaStream([vt[0]]); } peer.call(data.peerId, streamToSend, { metadata: { role: 'player' } }); } });
function mostrarVideoOponente(stream) { if (remoteVideo) { remoteVideo.srcObject = stream; remoteVideo.muted = false; isLocalMain = false; atualizarLayout(); } }
function handleSpectatorStream(stream) { if (spectatorSlots === 0) { video.srcObject = stream; video.muted = false; spectatorSlots = 1; } else { remoteVideo.srcObject = stream; remoteVideo.muted = false; remoteWrapper.style.display = 'flex'; spectatorSlots = 2; } }
function atualizarLayout() { if (isSpectator) return; if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip'); if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip'); if (isLocalMain) { localWrapper.classList.add('video-full'); if (remoteVideo.srcObject && remoteWrapper) { remoteWrapper.classList.add('video-pip'); remoteWrapper.style.display = 'flex'; } else { remoteWrapper.style.display = 'none'; } } else { if (remoteWrapper) { remoteWrapper.classList.add('video-full'); remoteWrapper.style.display = 'flex'; } localWrapper.classList.add('video-pip'); } }
window.toggleLayout = function () { if (isSpectator) return; if (!remoteVideo.srcObject) return; isLocalMain = !isLocalMain; atualizarLayout(); };
function tocarSom(tipo) { if (!isSoundOn) return; try { let audio = null; if (tipo === 'msg') audio = sndMsg; else if (tipo === 'life') audio = sndLife; else if (tipo === 'scan') audio = sndScan; if (audio) { audio.currentTime = 0; audio.play().catch(e => { }); } } catch (e) { } }
window.toggleSoundSetting = function () { isSoundOn = document.getElementById('chkSound').checked; };
window.toggleShareAudio = function () { shareAudioWithSpecs = document.getElementById('chkShareAudio').checked; };
window.closeCardModal = function () { cardModal.style.display = 'none'; };
window.expandCard = function () { if (stLastCardImg.src && stLastCardImg.style.display !== 'none') { modalImg.src = stLastCardImg.src; cardModal.style.display = 'flex'; } };
function setupPlayerMode() { if (getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'flex'; }
function setupSpectatorMode() { if (container) container.classList.add('spectator-view'); if (getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'none'; document.querySelectorAll('.hud-btn').forEach(btn => btn.style.display = 'none'); if (btnTabSpec) btnTabSpec.style.display = 'block'; switchTab('spec'); }