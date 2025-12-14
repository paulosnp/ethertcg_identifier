// ======================================================
// 1. REFERÊNCIAS DO DOM
// ======================================================
const container = document.getElementById('container');
const video = document.getElementById('videoInput');
const remoteVideo = document.getElementById('remoteVideo');
const remoteWrapper = document.getElementById('remote-wrapper');
const localWrapper = document.querySelector('.video-wrapper.local');
const canvas = document.getElementById('canvasHidden');
const ctx = canvas.getContext('2d');

// UI Elementos
const resultImg = document.getElementById('result-img');
const resultText = document.getElementById('result-text');
const resultBox = document.getElementById('result-box');
const spinner = document.getElementById('loading');
const historyList = document.getElementById('history-list');
const loginPanel = document.getElementById('login-panel');
const roomInput = document.getElementById('room-input');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');

// Sidebars
const sidebarToggleBtn = document.getElementById('sidebarToggle');
const mainSidebar = document.getElementById('mainSidebar');
const chatToggleBtn = document.getElementById('chatToggle');
const chatSidebar = document.getElementById('chatSidebar');

// Chats
const msgInput = document.getElementById('msgInput');
const msgSpecInput = document.getElementById('msgSpecInput');
const chatMessages = document.getElementById('chat-messages');
const specMessages = document.getElementById('spec-messages');
const logMessages = document.getElementById('log-messages');

const chatContainer = document.getElementById('chat-container');
const specContainer = document.getElementById('spec-container');
const logsContainer = document.getElementById('logs-container');

const badgeChat = document.getElementById('badge-chat');
const badgeSpec = document.getElementById('badge-spec');
const badgeLogs = document.getElementById('badge-logs');

// Botão Aba Spectator e Contador
const btnTabSpec = document.getElementById('btn-tab-spec');
const spectatorCounter = document.getElementById('spectator-counter');
const specCountVal = document.getElementById('spec-count-val');

// Sons e Controles
const sndMsg = document.getElementById('snd-msg');
const sndLife = document.getElementById('snd-life');
const sndScan = document.getElementById('snd-scan');
const btnMute = document.getElementById('btnMute');
const hpOpDisplay = document.getElementById('hp-op');
const hpMeDisplay = document.getElementById('hp-me');
const cardModal = document.getElementById('card-modal');
const settingsPopup = document.getElementById('settings-popup');
const btnSettings = document.getElementById('btnSettings');
const modalImg = document.getElementById('modal-img');
const labelLocal = document.getElementById('label-local');
const labelRemote = document.getElementById('label-remote');

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
let isSoundOn = false; // Som desligado por padrão
let shareAudioWithSpecs = false;

let isSpectator = false;
let spectatorSlots = 0;
let localStreamGlobal = null; // Variável para guardar a câmera inicial

// ======================================================
// 3. INICIALIZAÇÃO (CÂMERA IMEDIATA)
// ======================================================
async function iniciarCameraGlobal() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, 
            audio: true 
        });
        
        video.srcObject = stream;
        video.muted = true; // Mudo localmente para não dar eco
        localStreamGlobal = stream; // Guarda para usar depois
        console.log("Câmera iniciada com sucesso!");
    } catch (e) {
        console.error("Erro ao acessar câmera:", e);
        alert("Por favor, permita o acesso à câmera para jogar.");
    }
}

// CHAMA A CÂMERA ASSIM QUE O SITE CARREGA
iniciarCameraGlobal();

// ======================================================
// 4. UI, SONS E CONFIGURAÇÕES
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
            audio.play().catch(e => {}); 
        }
    } catch (e) {}
}

function toggleSettings() {
    if (settingsPopup) {
        if (settingsPopup.style.display === 'block') settingsPopup.style.display = 'none';
        else settingsPopup.style.display = 'block';
    }
}

window.onclick = function(event) {
    // Verifica se o popup existe e se o clique foi fora dele e do botão que o abre
    if (settingsPopup && btnSettings && settingsPopup.style.display === 'block' && event.target !== btnSettings && !settingsPopup.contains(event.target)) {
        settingsPopup.style.display = 'none';
    }
}

function toggleSoundSetting() { isSoundOn = document.getElementById('chkSound').checked; }
function toggleShareAudio() { shareAudioWithSpecs = document.getElementById('chkShareAudio').checked; }

function switchTab(tabName) {
    activeTab = tabName;
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    let idx = 0;
    if (tabName === 'spec') idx = 1;
    if (tabName === 'logs') idx = 2;
    btns[idx].classList.add('active');

    chatContainer.style.display = 'none';
    specContainer.style.display = 'none';
    logsContainer.style.display = 'none';

    if (tabName === 'chat') chatContainer.style.display = 'flex';
    else if (tabName === 'spec') specContainer.style.display = 'flex';
    else if (tabName === 'logs') logsContainer.style.display = 'flex';

    const badge = document.getElementById('badge-' + tabName);
    if (badge) { badge.innerText = '0'; badge.style.display = 'none'; }
}

// ======================================================
// 5. LOGIN E DEFINIÇÃO DE PAPEL
// ======================================================
function conectarSala() {
    if (!roomInput || roomInput.value.trim() === "") { alert("Digite a Sala!"); return; }
    salaAtual = roomInput.value.trim();
    
    socket.emit('entrar_sala', { sala: salaAtual });
    
    if (loginPanel) { loginPanel.style.opacity = '0'; setTimeout(() => { loginPanel.style.display = 'none'; }, 500); }
    if (statusOverlay) { statusOverlay.style.display = 'flex'; statusText.innerText = "ENTRANDO..."; }
}

socket.on('configurar_papel', (data) => {
    isSpectator = (data.role === 'spectator');
    console.log("Entrei na sala como:", data.role);
    
    // MOSTRAR O CHAT AGORA QUE ENTROU
    if (chatToggleBtn) chatToggleBtn.style.display = 'flex';
    if (chatSidebar) chatSidebar.style.display = 'flex';

    if (isSpectator) {
        setupSpectatorMode();
        // Se for espectador, paramos a câmera local para economizar recurso
        if (localStreamGlobal) {
            localStreamGlobal.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        iniciarPeer(null); 
    } else {
        setupPlayerMode();
        // Se for jogador, usamos a câmera que JÁ ESTÁ LIGADA
        if (localStreamGlobal) {
            iniciarPeer(localStreamGlobal);
        } else {
            // Caso raro: câmera falhou no inicio, tenta de novo
            iniciarCameraGlobal().then(() => iniciarPeer(localStreamGlobal));
        }
    }
});

function setupPlayerMode() {
    statusText.innerText = `JOGADOR - SALA ${salaAtual}`;
    document.getElementById('opt-share-audio').style.display = 'flex'; 
}

function setupSpectatorMode() {
    statusText.innerText = `ESPECTADOR - SALA ${salaAtual}`;
    
    container.classList.add('spectator-view');
    labelLocal.innerText = "JOGADOR 1";
    labelRemote.innerText = "JOGADOR 2";
    
    document.querySelector('.local-controls').style.display = 'none';
    document.querySelector('.remote-controls').style.display = 'none';
    btnMute.style.display = 'none';
    document.getElementById('opt-share-audio').style.display = 'none';

    document.querySelectorAll('.hp-controls button').forEach(btn => btn.style.display = 'none');

    document.getElementById('input-duel').style.display = 'none';
    document.getElementById('spectator-blocked-msg').style.display = 'block';
    
    btnTabSpec.style.display = 'block';
    switchTab('spec');
}

socket.on('update_specs_count', (data) => {
    const count = data.count;
    if (specCountVal) specCountVal.innerText = count;
    
    if (count > 0) {
        if(spectatorCounter) spectatorCounter.style.display = 'flex';
    } else {
        if(spectatorCounter) spectatorCounter.style.display = 'none';
    }

    if (count > 0 || isSpectator) {
        if(btnTabSpec) btnTabSpec.style.display = 'block';
    } else {
        if(btnTabSpec) btnTabSpec.style.display = 'none';
        if (activeTab === 'spec') switchTab('chat');
    }
});

// ======================================================
// 6. PEERJS E ÁUDIO
// ======================================================
function iniciarPeer(myStream) {
    peer = new Peer(undefined, { 
        host: 'etherduel.online', 
        path: '/ether/peerjs', 
        port: 443, 
        secure: true, 
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } 
    });
    
    peer.on('open', (id) => {
        myPeerId = id;
        socket.emit('aviso_peer_id', { sala: salaAtual, peerId: myPeerId, role: (isSpectator ? 'spec' : 'player') });
    });

    peer.on('call', (call) => {
        if (!isSpectator) {
            let streamToSend = myStream;
            if (!shareAudioWithSpecs && call.metadata && call.metadata.role === 'spec') {
                const videoTracks = myStream.getVideoTracks();
                if (videoTracks.length > 0) streamToSend = new MediaStream([videoTracks[0]]);
            } else if (!shareAudioWithSpecs) {
                 const videoTracks = myStream.getVideoTracks();
                 if(videoTracks.length > 0) streamToSend = new MediaStream([videoTracks[0]]);
            }
            call.answer(streamToSend);
            call.on('stream', (rs) => mostrarVideoOponente(rs));
        } else {
            call.answer(); 
            call.on('stream', (rs) => handleSpectatorStream(rs));
        }
    });
}

socket.on('novo_peer_na_sala', (data) => {
    if (data.peerId === myPeerId) return;

    if (!isSpectator) {
        if (data.role === 'player') {
            const call = peer.call(data.peerId, video.srcObject, { metadata: { role: 'player' } });
            call.on('stream', (rs) => mostrarVideoOponente(rs));
        } else {
            let streamToSend = video.srcObject;
            if (!shareAudioWithSpecs) {
                const vt = video.srcObject.getVideoTracks();
                if (vt.length > 0) streamToSend = new MediaStream([vt[0]]);
            }
            peer.call(data.peerId, streamToSend, { metadata: { role: 'player' } });
        }
    }
});

function mostrarVideoOponente(stream) {
    if (remoteVideo) {
        remoteVideo.srcObject = stream;
        remoteVideo.muted = false; 
        isLocalMain = false; 
        atualizarLayout();
    }
}

function handleSpectatorStream(stream) {
    if (spectatorSlots === 0) {
        video.srcObject = stream;
        video.muted = false; 
        spectatorSlots = 1;
    } else {
        remoteVideo.srcObject = stream;
        remoteVideo.muted = false;
        remoteWrapper.style.display = 'flex';
        spectatorSlots = 2;
    }
}

// ======================================================
// 7. CHATS
// ======================================================
function handleChatKey(e, tipo) { if (e.key === 'Enter') enviarMensagem(tipo); }

function enviarMensagem(tipo) {
    const input = (tipo === 'duel') ? msgInput : msgSpecInput;
    const texto = input.value.trim();
    if (texto === "" || salaAtual === "") return;
    socket.emit('enviar_chat', { sala: salaAtual, texto: texto, remetente: socket.id, tipo: tipo });
    input.value = "";
}

socket.on('receber_chat', (data) => {
    if (data.tipo === 'duel' && isSpectator) return;

    let targetDiv = (data.tipo === 'duel') ? chatMessages : specMessages;
    let targetTab = (data.tipo === 'duel') ? 'chat' : 'spec';

    const div = document.createElement('div');
    div.classList.add('message-bubble');
    
    if (data.remetente === socket.id) {
        div.classList.add('msg-me');
        div.innerText = data.texto;
    } else {
        div.classList.add('msg-op');
        div.innerText = (data.tipo === 'spec' ? "[Spec] " : "") + data.texto;
        tocarSom('msg');
        if (chatSidebar.classList.contains('closed') || activeTab !== targetTab) {
            const badge = document.getElementById('badge-' + targetTab);
            if (badge) {
                let count = parseInt(badge.innerText || '0') + 1;
                badge.innerText = count;
                badge.style.display = 'block';
            }
        }
    }
    targetDiv.appendChild(div);
    targetDiv.scrollTop = targetDiv.scrollHeight;
});

socket.on('log_vida', (data) => {
    const div = document.createElement('div'); div.classList.add('msg-log');
    let ator = (data.remetente === socket.id) ? "VOCÊ" : "OPONENTE";
    if (isSpectator) ator = "JOGADOR"; 
    const sinal = data.delta > 0 ? "+" : "";
    div.innerText = `[${data.hora}] ${ator} alterou vida: ${sinal}${data.delta} (Total: ${data.valor_final})`;
    logMessages.appendChild(div);
    logMessages.scrollTop = logMessages.scrollHeight;
    tocarSom('msg');
    if (chatSidebar.classList.contains('closed') || activeTab !== 'logs') {
        const badge = document.getElementById('badge-logs');
        let count = parseInt(badge.innerText || '0') + 1;
        badge.innerText = count;
        badge.style.display = 'block';
    }
});

// ======================================================
// 8. VIDA
// ======================================================
function changeLife(target, amount) {
    if (isSpectator) return; 
    if (target === 'op') { hpOp += amount; if(hpOp<0)hpOp=0; if(hpOp>40)hpOp=40; hpOpDisplay.innerText = hpOp; } 
    else if (target === 'me') { hpMe += amount; if(hpMe<0)hpMe=0; if(hpMe>40)hpMe=40; hpMeDisplay.innerText = hpMe; }
    tocarSom('life');
    if (salaAtual !== "") { socket.emit('atualizar_vida', { sala: salaAtual, alvo: target, valor: (target==='me'?hpMe:hpOp), delta: amount }); }
}
socket.on('receber_vida', (data) => {
    if (!isSpectator) {
        if (data.alvo === 'me') { hpOp = data.valor; hpOpDisplay.innerText = hpOp; }
        else if (data.alvo === 'op') { hpMe = data.valor; hpMeDisplay.innerText = hpMe; }
    } 
    tocarSom('life');
});

// ======================================================
// 9. LAYOUT E INTERAÇÃO
// ======================================================
function atualizarLayout() {
    if (isSpectator) return; 
    if (localWrapper) localWrapper.classList.remove('video-full', 'video-pip');
    if (remoteWrapper) remoteWrapper.classList.remove('video-full', 'video-pip');
    if (isLocalMain) {
        localWrapper.classList.add('video-full');
        if (remoteVideo.srcObject && remoteWrapper) { remoteWrapper.classList.add('video-pip'); remoteWrapper.style.display = 'flex'; } else { remoteWrapper.style.display = 'none'; }
    } else {
        if (remoteWrapper) { remoteWrapper.classList.add('video-full'); remoteWrapper.style.display = 'flex'; }
        localWrapper.classList.add('video-pip');
    }
}
function toggleLayout() { if (isSpectator) return; if (!remoteVideo.srcObject) return; isLocalMain = !isLocalMain; atualizarLayout(); }
if (localWrapper) localWrapper.addEventListener('click', (e) => { if (!isLocalMain && !isSpectator) { e.stopPropagation(); toggleLayout(); return; } realizarScanLocal(e.clientX, e.clientY); });
if (remoteWrapper) remoteWrapper.addEventListener('click', (e) => { if (isLocalMain && !isSpectator) { e.stopPropagation(); toggleLayout(); return; } realizarScanRemoto(e.clientX, e.clientY); });

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
        if (!chatSidebar.classList.contains('closed')) { const badge = document.getElementById('badge-' + activeTab); if(badge) { badge.innerText='0'; badge.style.display='none'; } }
    });
}

function toggleRotation(event, target) {
    event.stopPropagation(); 
    if (target === 'local') { isLocalRotated = !isLocalRotated; video.classList.toggle('rotated', isLocalRotated); } 
    else if (target === 'remote') { isRemoteRotated = !isRemoteRotated; remoteVideo.classList.toggle('rotated', isRemoteRotated); }
}
function toggleMute(event) {
    event.stopPropagation(); if (isSpectator) return;
    const audioTrack = video.srcObject.getAudioTracks()[0];
    if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; if (audioTrack.enabled) { btnMute.innerHTML = "🎤"; btnMute.classList.remove('muted'); } else { btnMute.innerHTML = "🔇"; btnMute.classList.add('muted'); } }
}
if (resultBox) {
    resultBox.addEventListener('mousemove', (e) => {
        if (resultImg.style.display === 'none' || resultImg.src === "") return;
        const rect = resultBox.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) - 0.5;
        const yPct = ((e.clientY - rect.top) / rect.height) - 0.5;
        resultImg.style.transform = `perspective(1000px) translateZ(20px) rotateX(${yPct * -10}deg) rotateY(${xPct * 10}deg) scale(1.02)`;
    });
    resultBox.addEventListener('mouseleave', () => { resultImg.style.transform = `perspective(1000px) translateZ(0px) rotateX(0deg) rotateY(0deg) scale(1)`; });
}
function expandCard() { if (resultImg.src && resultImg.src !== window.location.href && resultImg.style.display !== 'none') { modalImg.src = resultImg.src; cardModal.style.display = 'flex'; } }
function closeCardModal() { cardModal.style.display = 'none'; }

// ======================================================
// 10. LÓGICA DE SCAN E FETCH
// ======================================================
function realizarScanLocal(cx, cy) {
    uiCarregando();
    const r = video.getBoundingClientRect();
    let rx = cx - r.left, ry = cy - r.top;
    if (!isSpectator && isLocalRotated) { rx = r.width - rx; ry = r.height - ry; }
    processarCrop(video, rx, ry, video.videoWidth/r.width, video.videoHeight/r.height, false);
}
function realizarScanRemoto(cx, cy) {
    if (isSpectator) {
        uiCarregando();
        const r = remoteVideo.getBoundingClientRect();
        let rx = cx - r.left, ry = cy - r.top;
        processarCrop(remoteVideo, rx, ry, remoteVideo.videoWidth/r.width, remoteVideo.videoHeight/r.height, false);
    } else {
        const r = remoteVideo.getBoundingClientRect();
        let rx = cx - r.left, ry = cy - r.top;
        if (isRemoteRotated) { rx = r.width - rx; ry = r.height - ry; }
        resultText.innerText = "Espionando..."; resultText.style.color = "#ff00ff"; spinner.style.display = 'block';
        socket.emit('pedido_scan_remoto', { sala: salaAtual, x: rx/r.width, y: ry/r.height, solicitante: socket.id });
    }
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
    if(x<0)x=0; if(y<0)y=0; if(x+CROP_W > vid.videoWidth) x = vid.videoWidth - CROP_W; if(y+CROP_H > vid.videoHeight) y = vid.videoHeight - CROP_H;
    canvas.width=CROP_W; canvas.height=CROP_H;
    ctx.drawImage(vid, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
    enviarParaPython(canvas.toDataURL('image/jpeg', 0.6), spy);
}

function enviarParaPython(b64, spy) {
    fetch('/identificar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({imagem:b64}) })
    .then(r => { if (!r.ok) throw new Error("Erro no servidor"); return r.json(); })
    .then(d => {
        spinner.style.display = 'none';
        if (d.sucesso) {
            atualizarHUD(d, spy);
            addToHistory((spy ? "👁️ " : "") + d.dados.nome, d.imagem);
            tocarSom('scan');
            if (!spy && salaAtual !== "" && !isSpectator) socket.emit('jogar_carta', { sala: salaAtual, nome: d.dados.nome, imagem: d.imagem, dados: d.dados });
        } else { resultText.innerText = "Falha"; resultText.style.color = "#555"; }
    })
    .catch(err => { console.error("Erro no scan:", err); spinner.style.display = 'none'; resultText.innerText = "Erro Servidor"; resultText.style.color = "red"; });
}

function uiCarregando() { resultText.innerText="Analisando..."; resultText.style.color="var(--ether-blue)"; resultImg.style.display="none"; spinner.style.display='block'; }
function atualizarHUD(d, spy) { resultText.innerText = (spy?"[ESPIÃO] ":"") + d.dados.nome; resultText.style.color = spy?"#ff00ff":"var(--accent-gold)"; resultImg.src="data:image/jpeg;base64,"+d.imagem; resultImg.style.display='block'; }
function addToHistory(n, b64) {
    const list = document.getElementById('history-list');
    const existingItems = list.getElementsByClassName('history-item');
    const cleanNew = n.replace('👁️ ', '').trim();
    for (let i = 0; i < existingItems.length; i++) {
        const item = existingItems[i];
        const textSpan = item.querySelector('span');
        if (textSpan) { const cleanOld = textSpan.innerText.replace('👁️ ', '').trim(); if (cleanOld === cleanNew) { list.removeChild(item); break; } }
    }
    const item = document.createElement('div'); item.className = 'history-item';
    item.innerHTML = `<img src="data:image/jpeg;base64,${b64}"><span>${n}</span>`;
    item.onclick = () => { resultImg.src = "data:image/jpeg;base64," + b64; resultImg.style.display = 'block'; resultText.innerText = n.replace(/\[.*?\] /,'').replace('👁️ ',''); };
    list.prepend(item);
    if (list.children.length > 30) list.lastChild.remove();
}