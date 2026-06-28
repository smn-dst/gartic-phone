import { serve, upgradeWebSocket } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'

const app = new Hono()

// players: id -> { id, pseudo, ready, socket }
const players = new Map()

let gameStarted = false

// ids playing this round (frozen at start)
let playerOrder = []

// notebooks: { ownerId, entries: [{ type, content, authorId }] }
let notebooks = []

// turn: 0 = words, 1 = draw, 2 = guess, ...
let currentTurn = 0

// word phase timer
let wordTimer = null
const WORD_TIME = 60 // seconds

// send to all
function broadcast(message) {
    const text = JSON.stringify(message)
    for (const p of players.values()) {
        try {
            p.socket.send(text)
        } catch (e) {
            // socket closing: ignore
        }
    }
}

// player list to all
function broadcastPlayers() {
    const list = [...players.values()].map((p) => ({
        id: p.id,
        pseudo: p.pseudo,
        ready: p.ready,
    }))
    broadcast({ type: 'players', players: list })
}

// start if 2+ players and all ready
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

// auto-validate words after timer
function startWordTimer() {
    clearTimeout(wordTimer)
    wordTimer = setTimeout(() => {
        // fill empty notebooks
        for (const nb of notebooks) {
            if (nb.entries.length === 0) {
                nb.entries.push({ type: 'word', content: '(vide)', authorId: nb.ownerId })
            }
        }
        finishWordPhase()
    }, WORD_TIME * 1000)
}

// end word phase -> first turn
function finishWordPhase() {
    clearTimeout(wordTimer)
    currentTurn = 0
    advanceTurn()
}

function allWordsReceived() {
    return notebooks.every((n) => n.entries.length >= 1)
}

// rotation: notebook = (pos - turn) mod n  (never your own)
function notebookIndexFor(pos, turn) {
    const n = playerOrder.length
    return ((pos - turn) % n + n) % n
}

// send each player their notebook for this turn
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

// everyone submitted this turn?
function allSubmitted() {
    return notebooks.every((nb) => nb.entries.length === currentTurn + 1)
}

// next turn or end
function advanceTurn() {
    if (currentTurn >= playerOrder.length - 1) {
        broadcast({ type: 'game_over', notebooks: notebooks })
        console.log('Game over')
        return
    }
    currentTurn++
    startTurn()
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

                // ready toggle (true / false)
                if (data.type === 'ready' && player) {
                    player.ready = data.ready
                    broadcastPlayers()
                    checkStart()
                }

                // starting word (turn 0 only)
                if (data.type === 'word' && player && gameStarted && currentTurn === 0) {
                    const nb = notebooks.find((n) => n.ownerId === player.id)
                    if (nb && nb.entries.length === 0) {
                        nb.entries.push({ type: 'word', content: data.word, authorId: player.id })
                        console.log(player.pseudo, 'word:', data.word)
                    }
                    if (allWordsReceived()) finishWordPhase()
                }

                // drawing or guess for current turn
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
            },

            onClose() {
                if (player) {
                    players.delete(player.id)
                    console.log(player.pseudo, 'left')
                    broadcastPlayers()
                }
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