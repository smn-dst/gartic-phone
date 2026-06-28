const ws = new WebSocket('ws://' + location.host + '/ws')

const connectionScreen = document.getElementById('connection-screen')
const roomScreen = document.getElementById('room-screen')
const pseudoInput = document.getElementById('pseudo-input')
const playersList = document.getElementById('players-list')

// when the user clicks on "Join"
document.getElementById('join-button').onclick = () => {
    const pseudo = pseudoInput.value.trim()
    if (pseudo === '') return // no empty pseudo

    ws.send(JSON.stringify({ type: 'join', pseudo: pseudo }))

    connectionScreen.style.display = 'none'
    roomScreen.style.display = 'block'
}

// when the server sends something
ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.type === 'players') {
        displayPlayers(data.players)
    }

    if (data.type === 'game_start') {
        alert('La partie a commencé !')
    }
}

function displayPlayers(players) {
    playersList.innerHTML = '' // empty the list
    for (const player of players) {
        const li = document.createElement('li')
        li.textContent = player.pseudo
        playersList.appendChild(li)
    }
}

document.getElementById('btn-ready').onclick = () => {
    ws.send(JSON.stringify({ type: 'ready' }))
}