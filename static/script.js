// ======================================================
// 1. REFERÊNCIAS DO DOM
// ======================================================
function getEl(id) { return document.getElementById(id); }

const lobbyScreen = getEl('lobby-view');
const gameScreen = getEl('game-view');
const visualGrid = getEl('visual-tables-grid');
const nicknameInput = getEl('nickname-input');
const sidebarLoginArea = getEl('login-panel');
const gameInfoPanel = getEl('game-info-panel');

const sidebarToggleBtn = getEl('sidebarToggle');
const mainSidebar = getEl('mainSidebar');
const chatToggleBtn = getEl('chatToggle');
const chatSidebar = getEl('chatSidebar');

const container = getEl('container');
const video = getEl('videoInput');
const remoteVideo = getEl('remoteVideo');
const remoteWrapper = getEl('remote-wrapper');
const localWrapper = document.querySelector('.video-wrapper.local');
const btnMute = getEl('btnMute');

const canvas = getEl('canvasHidden');
let ctx = null; if (canvas) { ctx = canvas.getContext('2d'); }

const resultImg = getEl('result-img');
const resultText = getEl('result-text');
const resultBox = getEl('result-box');
const spinner = getEl('loading');
const historyList = getEl('history-list');

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
const sndMsg = getEl('snd-msg'); 
const sndLife = getEl('snd-life');
const sndScan = getEl('snd-scan');

const hpOpDisplay = getEl('hp-op');
const hpMeDisplay = getEl('hp-me');
const nameOpDisplay = getEl('name-op');
const nameMeDisplay = getEl('name-me');
const labelLocal = getEl('label-local');
const labelRemote = getEl('label-remote');

const cardModal = getEl('card-modal');
const settingsPopup = getEl('settings-popup');
const btnSettings = getEl('btnSettings');
const modalImg = getEl('modal-img');
const statusOverlay = getEl('status-overlay');
const statusText = getEl('status-text');

// ======================================================
// 2. ESTADO
// ======================================================
const CROP_W = 400; const CROP_H = 600; 
const socket = io(undefined, { reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: 5 });
socket.on('connect_error', (error) => { console.error('Erro de conexão Socket.IO:', error); });
socket.on('disconnect', (reason) => { console.warn('Desconectado do Socket.IO:', reason); });
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
// 3. INICIALIZAÇÃO
// ======================================================
async function iniciarCameraGlobal() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
        video.srcObject = stream; video.muted = true; localStreamGlobal = stream;
        console.log("Câmera OK");
    } catch (e) { console.error("Erro Câmera:", e); }
}
iniciarCameraGlobal();

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

// ======================================================
// 4. LOBBY E ENTRADA
// ======================================================
socket.on('lobby_update', (rooms) => {
    if (salaAtual !== "" || !visualGrid) return; 
    visualGrid.innerHTML = ""; 
    for (const [id, info] of Object.entries(rooms)) {
        const count = info.count;
        let statusClass = "empty"; let actionText = "ENTRAR (LIVRE)";
        let p1 = info.nicks[0] || "Vazio"; let p2 = info.nicks[1] || "Vazio";
        if (count === 1) { statusClass = "waiting"; actionText = "DESAFIAR"; } 
        else if (count >= 2) { statusClass = "full"; actionText = "ASSISTIR DUELO"; }
        const div = document.createElement('div');
        div.className = `arena-card ${statusClass}`;
        div.onclick = () => entrarNaMesa(id);
        div.innerHTML = `<div class="arena-id">${id.replace('mesa_', '')}</div><div class="arena-header"><span class="arena-name">${info.name}</span></div><div class="arena-players"><div class="player-slot ${info.nicks[0]?'filled':'empty'}">👤 ${p1}</div><div class="player-slot ${info.nicks[1]?'filled':'empty'}">⚔️ ${p2}</div></div><div class="arena-action">${actionText}</div>`;
        visualGrid.appendChild(div);
    }
});

window.entrarNaMesa = function(salaId) {
    const nick = nicknameInput.value.trim();
    if (nick === "") {
        alert("⚠️ DIGITE SEU NICK NA BARRA LATERAL PRIMEIRO!");
        nicknameInput.focus(); nicknameInput.style.borderColor = "red";
        setTimeout(() => nicknameInput.style.borderColor = "var(--accent-gold)", 1500);
        return;
    }
    myNickname = nick; salaAtual = salaId;
    lobbyScreen.style.display = 'none'; gameScreen.style.display = 'flex'; 
    if(sidebarLoginArea) sidebarLoginArea.style.display = 'none';
    if(gameInfoPanel) gameInfoPanel.style.display = 'block';
    socket.emit('entrar_sala', { sala: salaId, nickname: nick });
    if(statusOverlay) { statusOverlay.style.display = 'flex'; statusText.innerText = "Conectado"; }
};

socket.on('configurar_papel', (data) => {
    isSpectator = (data.role === 'spectator');
    if (chatToggleBtn) chatToggleBtn.style.display = 'flex';
    if (chatSidebar) chatSidebar.style.display = 'flex';
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

// NOMES
function refreshNameHUD() {
    if (!nameMeDisplay || !nameOpDisplay) return;
    if (isSpectator) {
        nameMeDisplay.innerText = roomNamesData.p1;
        nameOpDisplay.innerText = roomNamesData.p2;
        if(labelLocal) labelLocal.innerText = roomNamesData.p1;
        if(labelRemote) labelRemote.innerText = roomNamesData.p2;
    } else {
        nameMeDisplay.innerText = myNickname;
        if(labelLocal) labelLocal.innerText = myNickname;
        if (roomNamesData.p1 === myNickname) {
            nameOpDisplay.innerText = roomNamesData.p2;
            if(labelRemote) labelRemote.innerText = roomNamesData.p2;
        } else {
            nameOpDisplay.innerText = roomNamesData.p1;
            if(labelRemote) labelRemote.innerText = roomNamesData.p1;
        }
    }
}
socket.on('atualizar_nomes_sala', (data) => { roomNamesData = data; refreshNameHUD(); });

function setupPlayerMode() { if(getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'flex'; }
function setupSpectatorMode() {
    if(container) container.classList.add('spectator-view');
    document.querySelector('.local-controls').style.display = 'none';
    document.querySelector('.remote-controls').style.display = 'none';
    if(btnMute) btnMute.style.display = 'none';
    if(getEl('opt-share-audio')) getEl('opt-share-audio').style.display = 'none';
    document.querySelectorAll('.hp-controls button').forEach(btn => btn.style.display = 'none');
    if(btnTabSpec) btnTabSpec.style.display = 'block';
    switchTab('spec');
}

// ======================================================
// 5. CHAT (CORRIGIDO)
// ======================================================
socket.on('update_specs_count', (data) => {
    if(specCountVal) specCountVal.innerText = data.count;
    if(spectatorCounter) spectatorCounter.style.display = (data.count > 0) ? 'flex' : 'none';
    const showTab = (data.count > 0 || isSpectator);
    if(btnTabSpec) btnTabSpec.style.display = showTab ? 'block' : 'none';
    if(!showTab && activeTab === 'spec') switchTab('chat');
});

window.handleChatKey = function(e, tipo) { if (e.key === 'Enter') enviarMensagem(tipo); };
window.enviarMensagem = function(tipo) {
    const input = (tipo === 'duel') ? msgInput : msgSpecInput;
    const texto = input.value.trim();
    if (texto === "" || salaAtual === "") return;
    socket.emit('enviar_chat', { sala: salaAtual, texto: texto, remetente: socket.id, nick: myNickname, tipo: tipo });
    input.value = "";
};

socket.on('receber_chat', (data) => {
    if (data.tipo === 'duel' && isSpectator) return;
    let targetDiv = (data.tipo === 'duel') ? chatMessages : specMessages;
    let targetTab = (data.tipo === 'duel') ? 'chat' : 'spec';
    
    // CORREÇÃO: Força aba aparecer se chegar msg de spec
    if (data.tipo === 'spec' && btnTabSpec && btnTabSpec.style.display === 'none') {
        btnTabSpec.style.display = 'block';
    }

    const div = document.createElement('div');
    div.classList.add('message-bubble');
    if (data.remetente === socket.id) {
        div.classList.add('msg-me'); div.innerText = data.texto;
    } else {
        div.classList.add('msg-op');
        const prefix = (data.tipo === 'spec') ? `[${data.nick||'Spec'}] ` : "";
        div.innerText = prefix + data.texto;
        tocarSom('msg');
        if (chatSidebar.classList.contains('closed') || activeTab !== targetTab) {
            const badgeId = (targetTab === 'chat') ? 'badge-chat' : 'badge-spec';
            const badge = document.getElementById(badgeId);
            if (badge) { let c = parseInt(badge.innerText||'0')+1; badge.innerText = c; badge.style.display = 'block'; }
        }
    }
    targetDiv.appendChild(div); targetDiv.scrollTop = targetDiv.scrollHeight;
});

// ======================================================
// 6. VIDA, PEERJS E UTILS
// ======================================================
window.changeLife = function(target, amount) {
    if (isSpectator) return; 
    if (target === 'op') { hpOp += amount; if(hpOp<0)hpOp=0; if(hpOp>40)hpOp=40; hpOpDisplay.innerText = hpOp; } 
    else { hpMe += amount; if(hpMe<0)hpMe=0; if(hpMe>40)hpMe=40; hpMeDisplay.innerText = hpMe; }
    tocarSom('life');
    socket.emit('atualizar_vida', { sala: salaAtual, alvo: target, valor: (target==='me'?hpMe:hpOp), delta: amount });
};
socket.on('receber_vida', (data) => {
    if (!isSpectator) {
        if (data.alvo === 'me') { hpOp = data.valor; hpOpDisplay.innerText = hpOp; }
        else { hpMe = data.valor; hpMeDisplay.innerText = hpMe; }
    } else {
        // Spec Update Visual (Simplificado)
        if (data.alvo === 'me') { 
             if (data.valor !== hpMe) { hpMe = data.valor; hpMeDisplay.innerText = hpMe; }
             else { hpOp = data.valor; hpOpDisplay.innerText = hpOp; }
        }
    }
    tocarSom('life');
});
socket.on('log_vida', (data) => {
    const div = document.createElement('div'); div.classList.add('msg-log');
    let ator = (data.remetente === socket.id) ? "VOCÊ" : "OPONENTE"; if (isSpectator) ator = "JOGADOR"; 
    const sinal = data.delta > 0 ? "+" : "";
    div.innerText = `[${data.hora}] ${ator} alterou vida: ${sinal}${data.delta} (Total: ${data.valor_final})`;
    logMessages.appendChild(div); logMessages.scrollTop = logMessages.scrollHeight;
});

function iniciarPeer(myStream) {
    try {
        peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
        peer.on('open', (id) => { myPeerId = id; socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: (isSpectator ? 'spec' : 'player') }); });
        peer.on('error', (err) => { console.error('Erro PeerJS:', err); });
        peer.on('call', (call) => {
            let streamToSend = myStream;
            if (!isSpectator && !shareAudioWithSpecs && call.metadata?.role === 'spec') {
                 const vt = myStream?.getVideoTracks?.(); if (vt && vt.length > 0) streamToSend = new MediaStream([vt[0]]);
            }
            if(myStream) { call.answer(streamToSend); } else { call.answer(); }
            call.on('stream', (rs) => isSpectator ? handleSpectatorStream(rs) : mostrarVideoOponente(rs));
            call.on('error', (err) => { console.error('Erro na chamada PeerJS:', err); });
        });
    } catch (err) { console.error('Erro ao iniciar PeerJS:', err); }
}
socket.on('novo_peer_na_sala', (data) => {
    if (data.peerId === myPeerId) return;
    if (!isSpectator && peer && video.srcObject) {
        try {
            let streamToSend = video.srcObject;
            if (!shareAudioWithSpecs) { const vt = video.srcObject.getVideoTracks(); if (vt.length > 0) streamToSend = new MediaStream([vt[0]]); }
            const call = peer.call(data.peerId, streamToSend, { metadata: { role: 'player' } });
            call.on('error', (err) => { console.error('Erro ao chamar peer:', err); });
        } catch (err) { console.error('Erro em novo_peer_na_sala:', err); }
    }
});
function mostrarVideoOponente(stream) { if (remoteVideo) { remoteVideo.srcObject = stream; remoteVideo.muted = false; isLocalMain = false; atualizarLayout(); } }
function handleSpectatorStream(stream) { if (spectatorSlots === 0) { video.srcObject = stream; video.muted = false; spectatorSlots = 1; } else { remoteVideo.srcObject = stream; remoteVideo.muted = false; remoteWrapper.style.display = 'flex'; spectatorSlots = 2; } }

function atualizarLayout() {
    if (isSpectator) return; 
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');
    if (isLocalMain) { localWrapper.classList.add('video-full'); if (remoteVideo.srcObject && remoteWrapper) { remoteWrapper.classList.add('video-pip'); remoteWrapper.style.display = 'flex'; } else { remoteWrapper.style.display = 'none'; } } 
    else { if (remoteWrapper) { remoteWrapper.classList.add('video-full'); remoteWrapper.style.display = 'flex'; } localWrapper.classList.add('video-pip'); }
}
window.toggleLayout = function() { if (isSpectator) return; if (!remoteVideo.srcObject) return; isLocalMain = !isLocalMain; atualizarLayout(); };
window.toggleSettings = function() { settingsPopup.style.display = (settingsPopup.style.display === 'block') ? 'none' : 'block'; };
window.toggleRotation = function(event, target) { event.stopPropagation(); if (target === 'local') { isLocalRotated = !isLocalRotated; video.classList.toggle('rotated', isLocalRotated); } else { isRemoteRotated = !isRemoteRotated; remoteVideo.classList.toggle('rotated', isRemoteRotated); } };
window.toggleMute = function(event) { event.stopPropagation(); if (isSpectator) return; const at = video.srcObject.getAudioTracks()[0]; if (at) { at.enabled = !at.enabled; btnMute.innerHTML = at.enabled ? "🎤" : "🔇"; if(!at.enabled) btnMute.classList.add('muted'); else btnMute.classList.remove('muted'); } };

if (localWrapper) localWrapper.addEventListener('click', (e) => { if(e.target.tagName === 'BUTTON') return; if (!isLocalMain && !isSpectator) { e.stopPropagation(); toggleLayout(); return; } realizarScanLocal(e.clientX, e.clientY); });
if (remoteWrapper) remoteWrapper.addEventListener('click', (e) => { if(e.target.tagName === 'BUTTON') return; if (isLocalMain && !isSpectator) { e.stopPropagation(); toggleLayout(); return; } realizarScanRemoto(e.clientX, e.clientY); });

function realizarScanLocal(cx, cy) { uiCarregando(); const r = video.getBoundingClientRect(); let rx = cx - r.left, ry = cy - r.top; if (!isSpectator && isLocalRotated) { rx = r.width - rx; ry = r.height - ry; } processarCrop(video, rx, ry, video.videoWidth/r.width, video.videoHeight/r.height, false); }
function realizarScanRemoto(cx, cy) { if (isSpectator) { uiCarregando(); const r = remoteVideo.getBoundingClientRect(); let rx = cx - r.left, ry = cy - r.top; processarCrop(remoteVideo, rx, ry, remoteVideo.videoWidth/r.width, remoteVideo.videoHeight/r.height, false); } else { const r = remoteVideo.getBoundingClientRect(); let rx = cx - r.left, ry = cy - r.top; if (isRemoteRotated) { rx = r.width - rx; ry = r.height - ry; } resultText.innerText = "Espionando..."; resultText.style.color = "#ff00ff"; spinner.style.display = 'block'; socket.emit('pedido_scan_remoto', { sala: salaAtual, x: rx/r.width, y: ry/r.height, solicitante: socket.id }); } }
socket.on('executar_crop_local', (d) => { const w = video.videoWidth, h = video.videoHeight; let rx = d.x * w, ry = d.y * h; let x = rx - CROP_W/2, y = ry - CROP_H/2; canvas.width=CROP_W; canvas.height=CROP_H; ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); socket.emit('devolver_scan_remoto', { destinatario: d.solicitante, imagem: canvas.toDataURL('image/jpeg', 0.8) }); });
socket.on('receber_imagem_remota', (d) => enviarParaPython(d.imagem, true));
socket.on('oponente_jogou', (d) => addToHistory(`[RIVAL] ${d.nome}`, d.imagem));
function processarCrop(vid, rx, ry, sx, sy, spy) { let x = (rx*sx) - CROP_W/2, y = (ry*sy) - CROP_H/2; canvas.width=CROP_W; canvas.height=CROP_H; ctx.drawImage(vid, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H); enviarParaPython(canvas.toDataURL('image/jpeg', 0.9), spy); }
function enviarParaPython(b64, spy) { fetch('/identificar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({imagem:b64}), timeout: 15000 }).then(r => r.json()).then(d => { spinner.style.display = 'none'; if (d.sucesso) { if(resultText) { resultText.innerText = (spy?"[ESPIÃO] ":"") + d.dados.nome; resultText.style.color = "var(--accent-gold)"; } if(resultImg) { resultImg.src="data:image/jpeg;base64,"+d.imagem; resultImg.style.display='block'; } addToHistory(d.dados.nome, d.imagem); tocarSom('scan'); if (!spy && salaAtual !== "" && !isSpectator) socket.emit('jogar_carta', { sala: salaAtual, nome: d.dados.nome, imagem: d.imagem, dados: d.dados }); } else { if(resultText) { resultText.innerText = "Carta não identificada"; resultText.style.color = "#ff6666"; } } }).catch(err => { console.error('Erro ao enviar para Python:', err); spinner.style.display = 'none'; if(resultText) { resultText.innerText = "Erro na requisição"; resultText.style.color = "#ff6666"; } }); }
function uiCarregando() { resultText.innerText="Analisando..."; resultText.style.color="var(--ether-blue)"; if(resultImg) resultImg.style.display="none"; spinner.style.display='block'; }
function addToHistory(n, b64) { const list = getEl('history-list'); if(!list) return; const item = document.createElement('div'); item.className = 'history-item'; item.innerHTML = `<img src="data:image/jpeg;base64,${b64}"><span>${n}</span>`; item.onclick = () => { if(resultImg) { resultImg.src = "data:image/jpeg;base64," + b64; resultImg.style.display = 'block'; } }; list.prepend(item); }
function tocarSom(tipo) { if (!isSoundOn) return; try { let audio = null; if (tipo === 'msg') audio = sndMsg; else if (tipo === 'life') audio = sndLife; else if (tipo === 'scan') audio = sndScan; if (audio) { audio.currentTime = 0; audio.play().catch(e => {}); } } catch (e) {} }
window.toggleSoundSetting = function() { isSoundOn = document.getElementById('chkSound').checked; };
window.toggleShareAudio = function() { shareAudioWithSpecs = document.getElementById('chkShareAudio').checked; };
window.switchTab = function(tabName) { activeTab = tabName; document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active')); let idx = (tabName === 'spec') ? 1 : (tabName === 'logs' ? 2 : 0); document.querySelectorAll('.tab-btn')[idx].classList.add('active'); if(chatContainer) chatContainer.style.display = (tabName === 'chat' ? 'flex' : 'none'); if(specContainer) specContainer.style.display = (tabName === 'spec' ? 'flex' : 'none'); if(logsContainer) logsContainer.style.display = (tabName === 'logs' ? 'flex' : 'none'); };
window.closeCardModal = function() { cardModal.style.display = 'none'; };
window.expandCard = function() { if (resultImg.src && resultImg.style.display !== 'none') { modalImg.src = resultImg.src; cardModal.style.display = 'flex'; } };