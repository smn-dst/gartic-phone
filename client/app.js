const ws = new WebSocket('ws://' + location.host + '/ws')

const connectionScreen = document.getElementById('connection-screen')
const roomScreen = document.getElementById('room-screen')
const pseudoInput = document.getElementById('pseudo-input')
const playersList = document.getElementById('players-list')

// join click
document.getElementById('join-button').onclick = () => {
    const pseudo = pseudoInput.value.trim()
    if (pseudo === '') return // no empty

    ws.send(JSON.stringify({ type: 'join', pseudo: pseudo }))

    connectionScreen.style.display = 'none'
    roomScreen.style.display = 'block'
}

// server message
ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.type === 'players') {
        displayPlayers(data.players)
    }

    if (data.type === 'game_start') {
        document.getElementById('room-screen').style.display = 'none'
        document.getElementById('word-screen').style.display = 'block'
    }

    if (data.type === 'all_words_in') {
        alert('Tous les mots ont été reçus !')
    }
}

function displayPlayers(players) {
    playersList.innerHTML = '' // reset
    for (const player of players) {
        const li = document.createElement('li')
        li.textContent = player.pseudo
        playersList.appendChild(li)
    }
}

document.getElementById('btn-ready').onclick = () => {
    ws.send(JSON.stringify({ type: 'ready' }))
}

// send word
document.getElementById('word-submit').onclick = () => {
    const word = document.getElementById('word-input').value.trim()
    if (word === '') return
    ws.send(JSON.stringify({ type: 'word', word: word }))
}