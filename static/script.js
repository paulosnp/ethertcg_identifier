// --- REFERÊNCIAS DO DOM ---
const video = document.getElementById('videoInput');
const canvas = document.getElementById('canvasHidden');
const ctx = canvas.getContext('2d');
const resultImg = document.getElementById('result-img');
const resultText = document.getElementById('result-text');
const spinner = document.getElementById('loading');
const container = document.getElementById('container');
const resultBox = document.getElementById('result-box'); 
const historyList = document.getElementById('history-list'); // Referência para a lista de histórico

// --- CONFIGURAÇÃO ---
const CROP_W = 300; 
const CROP_H = 420;

// ======================================================
// 1. FUNÇÃO DE HISTÓRICO (NOVA)
// ======================================================
// ======================================================
// 1. FUNÇÃO DE HISTÓRICO (INTELIGENTE)
// ======================================================
function addToHistory(nome, imagemBase64) {
    if (!historyList) return;

    // 1. Verifica se a carta já existe na lista
    const itensExistentes = historyList.getElementsByClassName('history-item');
    let itemExistente = null;

    for (let item of itensExistentes) {
        // Pega o nome dentro do span
        const spanNome = item.querySelector('span').innerText;
        if (spanNome === nome) {
            itemExistente = item;
            break;
        }
    }

    const imgSrc = "data:image/jpeg;base64," + imagemBase64;

    if (itemExistente) {
        // --- CENÁRIO A: JÁ EXISTE ---
        // Apenas movemos o elemento existente para o topo da lista
        historyList.prepend(itemExistente);
        
        // Atualizamos a imagem para a captura mais recente (opcional, mas fica legal)
        itemExistente.querySelector('img').src = imgSrc;
        
        // Efeitinho visual para mostrar que atualizou
        itemExistente.style.background = "rgba(0, 229, 255, 0.3)"; // Pisca azul
        setTimeout(() => {
            itemExistente.style.background = ""; // Volta ao normal
        }, 300);

    } else {
        // --- CENÁRIO B: CARTA NOVA ---
        // Cria o elemento do zero
        const novoItem = document.createElement('div');
        novoItem.className = 'history-item';
        
        novoItem.innerHTML = `
            <img src="${imgSrc}">
            <span>${nome}</span>
        `;

        // Adiciona evento de clique (Recall)
        novoItem.addEventListener('click', () => {
            resultImg.src = novoItem.querySelector('img').src;
            resultImg.style.display = 'block';
            resultText.innerText = nome;
            resultText.style.color = "var(--accent-gold)";
            
            // Efeito de clique na carta principal
            resultImg.style.transform = "perspective(1000px) translateZ(50px) scale(1.05)";
            setTimeout(() => {
                resultImg.style.transform = "perspective(1000px) translateZ(0px) scale(1)";
            }, 200);
        });

        // Adiciona no topo
        historyList.prepend(novoItem);
    }

    // Limpeza: Mantém apenas os últimos 20 itens únicos
    if (historyList.children.length > 20) {
        historyList.removeChild(historyList.lastChild);
    }
}

// ======================================================
// 2. EFEITO 3D TILT (CORRIGIDO)
// ======================================================
resultBox.addEventListener('mousemove', (e) => {
    // Só ativa se tiver uma carta visível
    if (resultImg.style.display === 'none' || resultImg.src === "") return;

    const rect = resultBox.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const sensibilidade = 10; 

    const rotateY = ((mouseX / width) - 0.5) * sensibilidade;
    const rotateX = ((mouseY / height) - 0.5) * -sensibilidade;

    // Levitação (translateZ) impede cortes no fundo
    resultImg.style.transform = `perspective(1000px) translateZ(50px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.1)`;
});

resultBox.addEventListener('mouseleave', () => {
    resultImg.style.transform = `perspective(1000px) translateZ(0px) rotateX(0deg) rotateY(0deg) scale(1)`;
});

// ======================================================
// 3. CÂMERA E COMUNICAÇÃO COM PYTHON
// ======================================================
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment", 
                width: { ideal: 1920 }, 
                height: { ideal: 1080 } 
            },
            audio: false
        });
        video.srcObject = stream;
    } catch (err) {
        console.error(err);
        resultText.innerText = "Erro Câmera";
        alert("Erro ao abrir câmera. Use HTTPS ou Localhost.");
    }
}

function handleInteract(clientX, clientY) {
    // Feedback de carregamento
    resultText.innerText = "Analisando...";
    resultText.style.color = "var(--ether-blue)";
    resultImg.style.display = "none";
    spinner.style.display = "block";

    // Reseta posição da carta
    resultImg.style.transform = "scale(1)";

    // Lógica de coordenadas (Mouse/Touch -> Vídeo Real)
    const rect = video.getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;

    const realX = (clientX - rect.left) * scaleX;
    const realY = (clientY - rect.top) * scaleY;

    // Recorte
    let x = realX - (CROP_W / 2);
    let y = realY - (CROP_H / 2);

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + CROP_W > video.videoWidth) x = video.videoWidth - CROP_W;
    if (y + CROP_H > video.videoHeight) y = video.videoHeight - CROP_H;

    // Canvas Draw
    canvas.width = CROP_W;
    canvas.height = CROP_H;
    ctx.drawImage(video, x, y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);

    const dataURL = canvas.toDataURL('image/jpeg', 0.9);

    // Envio para o Backend
    fetch('/identificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem: dataURL })
    })
    .then(response => response.json())
    .then(data => {
        spinner.style.display = "none";
        
        if (data.sucesso) {
            // SUCESSO
            resultText.innerText = data.dados.nome;
            resultText.style.color = "var(--accent-gold)";
            resultImg.src = "data:image/jpeg;base64," + data.imagem;
            resultImg.style.display = "block";

            // --- PREENCHE OS NOVOS DADOS ---
            const details = document.getElementById('card-details');
            if (details) {
                details.style.display = 'block';
                // Usa innerHTML para permitir quebra de linha se precisar
                document.getElementById('card-type').innerText = data.dados.tipo;
                document.getElementById('card-special').innerText = data.dados.especial;
                document.getElementById('card-effect').innerText = data.dados.efeito;
            }

            // Adiciona ao histórico
            addToHistory(data.dados.nome, data.imagem);
        }
    })
    .catch(err => {
        spinner.style.display = "none";
        resultText.innerText = "Erro Conexão";
        console.error(err);
    });
}

// ======================================================
// 4. INICIALIZAÇÃO
// ======================================================
container.addEventListener('mousedown', (e) => handleInteract(e.clientX, e.clientY));

container.addEventListener('touchstart', (e) => {
    // e.preventDefault(); // Descomente para bloquear scroll
    handleInteract(e.touches[0].clientX, e.touches[0].clientY);
});

startCamera();