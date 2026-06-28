const ws = new WebSocket('ws://' + location.host + '/ws')

function id(x) { return document.getElementById(x) }

const screens = {
    login: id('login-screen'),
    lobby: id('lobby-screen'),
    word: id('word-screen'),
    task: id('task-screen'),
    waiting: id('waiting-screen'),
    over: id('over-screen'),
}

function show(name) {
    for (const s of Object.values(screens)) s.style.display = 'none'
    screens[name].style.display = 'block'
}

let isReady = false
let wordCountdown = null

// --- join ---
id('btn-rejoindre').onclick = () => {
    const pseudo = id('input-pseudo').value.trim()
    if (!pseudo) return
    ws.send(JSON.stringify({ type: 'join', pseudo: pseudo }))
    id('lobby-me').textContent = 'Connecté : ' + pseudo
    show('lobby')
}

id('btn-ready').onclick = () => {
    isReady = !isReady
    ws.send(JSON.stringify({ type: 'ready', ready: isReady }))
    id('btn-ready').textContent = isReady ? 'Annuler' : 'Je suis prêt'
    id('lobby-status').textContent = isReady ? 'En attente des autres joueurs...' : ''
}

// leave
id('btn-leave').onclick = () => {
    ws.send(JSON.stringify({ type: 'leave' }))
    isReady = false
    id('btn-ready').textContent = 'Je suis prêt'
    id('lobby-status').textContent = ''
    id('input-pseudo').value = ''
    show('login')
}

// ask for a new round
id('btn-new-round').onclick = () => {
    ws.send(JSON.stringify({ type: 'new_round' }))
}

// --- word ---
function sendWord() {
    stopWordCountdown()
    const word = id('word-input').value.trim()
    if (word) ws.send(JSON.stringify({ type: 'word', word: word }))
    show('waiting')
}
id('word-submit').onclick = sendWord

function startWordCountdown(seconds) {
    let left = seconds
    id('word-timer').textContent = left + 's'
    wordCountdown = setInterval(() => {
        left--
        id('word-timer').textContent = left + 's'
        if (left <= 0) sendWord()
    }, 1000)
}
function stopWordCountdown() {
    if (wordCountdown) { clearInterval(wordCountdown); wordCountdown = null }
}

// --- task (stub) ---
id('task-submit').onclick = () => {
    const value = id('task-input').value.trim()
    if (!value) return
    ws.send(JSON.stringify({ type: 'submit', content: value }))
    id('task-input').value = ''
    show('waiting')
}

// --- server messages ---
ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    // players list
    if (data.type === 'players') {
        const list = id('players-list')
        list.innerHTML = ''
        for (const p of data.players) {
            const li = document.createElement('li')
            li.textContent = p.pseudo + (p.ready ? ' ✓' : '')
            list.appendChild(li)
        }
    }

    // ask word
    if (data.type === 'ask_word') {
        id('word-input').value = ''
        show('word')
        startWordCountdown(data.duration)
    }

    // draw or guess turn
    if (data.type === 'draw_turn' || data.type === 'guess_turn') {
        show('task')
        id('task-title').textContent =
            data.type === 'draw_turn' ? 'Dessine ce mot' : 'Devine ce dessin'
        id('task-previous').textContent = 'Précédent : ' + data.previous
    }

    // game over
    if (data.type === 'game_over') {
        show('over')
        id('over-content').textContent = JSON.stringify(data.notebooks, null, 2)
    }

    if (data.type === 'back_to_lobby') {
        isReady = false
        id('btn-ready').textContent = 'Je suis prêt'
        id('lobby-status').textContent = ''
        show('lobby')
    }
}