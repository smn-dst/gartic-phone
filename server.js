import { serve, upgradeWebSocket } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'

const app = new Hono()

// players: id -> { id, pseudo, ready, socket }
const players = new Map()

let gameStarted = false

// round players, frozen at start
let playerOrder = []

// notebooks: { ownerId, entries: [{ type, content, authorId }] }
let notebooks = []

function broadcast(message) {
    const text = JSON.stringify(message)
    for (const p of players.values()) {
        try {
            p.socket.send(text)
        } catch (e) {
            // skip closing sockets
        }
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

// start: all ready, min 2
function checkStart() {
    if (gameStarted) return
    if (players.size < 2) return

    const everyoneReady = [...players.values()].every((p) => p.ready)
    if (!everyoneReady) return

    gameStarted = true

    // freeze order, init notebooks
    playerOrder = [...players.keys()]
    notebooks = playerOrder.map((id) => ({ ownerId: id, entries: [] }))

    broadcast({ type: 'game_start' })
    broadcast({ type: 'ask_word' }) // ask words
    console.log('Game started, asking for words')
}

// true when every notebook has its word
function allWordsReceived() {
    return notebooks.every((n) => n.entries.length >= 1)
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

                // join
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

                // ready
                if (data.type === 'ready' && player) {
                    player.ready = true
                    broadcastPlayers()
                    checkStart()
                }

                // word
                if (data.type === 'word' && player && gameStarted) {
                    // owner notebook, first entry
                    const nb = notebooks.find((n) => n.ownerId === player.id)
                    if (nb && nb.entries.length === 0) {
                        nb.entries.push({
                            type: 'word',
                            content: data.word,
                            authorId: player.id,
                        })
                        console.log(player.pseudo, 'word:', data.word)
                    }

                    if (allWordsReceived()) {
                        console.log('All words received')
                        // temp signal; next: first drawing turn
                        broadcast({ type: 'all_words_in' })
                    }
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