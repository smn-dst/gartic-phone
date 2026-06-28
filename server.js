import { serve, upgradeWebSocket } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'

const app = new Hono()
const players = new Map()

let gameStarted = false
let playerOrder = []
let notebooks = []
let currentTurn = 0
let wordTimer = null

const WORD_TIME = 60

function broadcast(message) {
    const text = JSON.stringify(message)
    for (const p of players.values()) {
        try {
            p.socket.send(text)
        } catch (e) {}
    }
}

function broadcastPlayers() {
    const list = [...players.values()].map((p) => ({
        id: p.id,
        pseudo: p.pseudo,
        ready: p.ready,
    }))
    broadcast({ type: 'players', players: list })
}

function checkStart() {
    if (gameStarted) return
    if (players.size < 2) return
    if (![...players.values()].every((p) => p.ready)) return

    gameStarted = true
    playerOrder = [...players.keys()]
    notebooks = playerOrder.map((id) => ({ ownerId: id, entries: [] }))

    broadcast({ type: 'game_start' })
    broadcast({ type: 'ask_word', duration: WORD_TIME })
    startWordTimer()
    console.log('Game started, asking for words')
}

function startWordTimer() {
    clearTimeout(wordTimer)
    wordTimer = setTimeout(() => {
        for (const nb of notebooks) {
            if (nb.entries.length === 0) {
                nb.entries.push({ type: 'word', content: '(vide)', authorId: nb.ownerId })
            }
        }
        finishWordPhase()
    }, WORD_TIME * 1000)
}

function finishWordPhase() {
    clearTimeout(wordTimer)
    currentTurn = 0
    advanceTurn()
}

function allWordsReceived() {
    return notebooks
        .filter((n) => playerOrder.includes(n.ownerId))
        .every((n) => n.entries.length >= 1)
}

function notebookIndexFor(pos, turn) {
    const n = playerOrder.length
    return ((pos - turn) % n + n) % n
}

// send each player
function startTurn() {
    const isDraw = currentTurn % 2 === 1
    for (let pos = 0; pos < playerOrder.length; pos++) {
        const p = players.get(playerOrder[pos])
        if (!p) continue
        const nb = notebooks[notebookIndexFor(pos, currentTurn)]
        const last = nb.entries[nb.entries.length - 1]
        p.socket.send(
            JSON.stringify({
                type: isDraw ? 'draw_turn' : 'guess_turn',
                previous: last.content,
            })
        )
    }
    console.log('Turn', currentTurn, isDraw ? '(draw)' : '(guess)')
}

function allSubmitted() {
    for (let pos = 0; pos < playerOrder.length; pos++) {
        const nb = notebooks[notebookIndexFor(pos, currentTurn)]
        if (nb.entries.length !== currentTurn + 1) return false
    }
    return true
}

function advanceTurn() {
    if (currentTurn >= playerOrder.length - 1) {
        broadcast({ type: 'game_over', notebooks: notebooks })
        gameStarted = false
        console.log('Game over')
        return
    }
    currentTurn++
    startTurn()
}

function handleLeaveDuringGame(leftId) {
    playerOrder = playerOrder.filter((id) => id !== leftId)

    if (playerOrder.length < 2) {
        broadcast({ type: 'game_over', notebooks: notebooks })
        console.log('Game over (not enough players)')
        gameStarted = false
        return
    }

    if (currentTurn === 0) {
        if (allWordsReceived()) finishWordPhase()
    } else {
        if (allSubmitted()) advanceTurn()
    }
}

// reset state, keep connected players
function resetGame() {
    clearTimeout(wordTimer)
    gameStarted = false
    playerOrder = []
    notebooks = []
    currentTurn = 0
    for (const p of players.values()) p.ready = false
    broadcast({ type: 'back_to_lobby' })
    broadcastPlayers()
    console.log('New round: back to lobby')
}

app.get(
    '/ws',
    upgradeWebSocket(() => {
        let socket = null
        let player = null

        return {
            onOpen(event, ws) {
                socket = ws
            },

            onMessage(event, ws) {
                const data = JSON.parse(event.data)

                // join with pseudo
                if (data.type === 'join') {
                    player = {
                        id: crypto.randomUUID(),
                        pseudo: data.pseudo,
                        ready: false,
                        socket: socket,
                    }
                    players.set(player.id, player)
                    console.log(player.pseudo, 'joined')
                    broadcastPlayers()
                }

                // leave lobby pre-game (change pseudo)
                if (data.type === 'leave' && player && !gameStarted) {
                    players.delete(player.id)
                    console.log(player.pseudo, 'left the lobby')
                    player = null
                    broadcastPlayers()
                }

                // ready toggle (true / false)
                if (data.type === 'ready' && player) {
                    player.ready = data.ready
                    broadcastPlayers()
                    checkStart()
                }

                // starting word
                if (data.type === 'word' && player && gameStarted && currentTurn === 0) {
                    const nb = notebooks.find((n) => n.ownerId === player.id)
                    if (nb && nb.entries.length === 0) {
                        nb.entries.push({ type: 'word', content: data.word, authorId: player.id })
                        console.log(player.pseudo, 'word:', data.word)
                    }
                    if (allWordsReceived()) finishWordPhase()
                }

                // drawing or guess
                if (data.type === 'submit' && player && gameStarted) {
                    const pos = playerOrder.indexOf(player.id)
                    if (pos === -1) return
                    const nb = notebooks[notebookIndexFor(pos, currentTurn)]
                    if (nb.entries.length === currentTurn) {
                        const isDraw = currentTurn % 2 === 1
                        nb.entries.push({
                            type: isDraw ? 'drawing' : 'word',
                            content: data.content,
                            authorId: player.id,
                        })
                        console.log(player.pseudo, 'submitted for turn', currentTurn)
                    }
                    if (allSubmitted()) advanceTurn()
                }

                // any player asks for a new round after game over
                if (data.type === 'new_round' && !gameStarted) {
                    resetGame()
                }
            },

            onClose() {
                if (!player) return

                players.delete(player.id)
                console.log(player.pseudo, 'left')

                if (!gameStarted) {
                    broadcastPlayers()
                    return
                }

                handleLeaveDuringGame(player.id)
                broadcastPlayers()
            },
        }
    })
)

app.use('/*', serveStatic({ root: './client' }))

const wss = new WebSocketServer({ noServer: true })
serve(
    {
        fetch: app.fetch,
        websocket: { server: wss },
        port: 3000,
    },
    (info) => {
        console.log(`Server running on http://localhost:${info.port}`)
    }
)