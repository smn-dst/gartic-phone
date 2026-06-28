import { serve, upgradeWebSocket } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'

const app = new Hono()

// Connected players
const players = new Map()

let gameStarted = false

function broadcast(message) {
    const text = JSON.stringify(message)
    for (const p of players.values()) {
        try {
            p.socket.send(text)
        } catch (e) {
            // ignore sockets that are closing
        }
    }
}

// Send the current player list to everyone
function broadcastPlayers() {
    const list = [...players.values()].map((p) => ({
        id: p.id,
        pseudo: p.pseudo,
        ready: p.ready,
    }))
    broadcast({ type: 'players', players: list })
}

// Start the game once every player is ready (and we have at least 2)
function checkStart() {
    if (gameStarted) return
    if (players.size < 2) return

    const everyoneReady = [...players.values()].every((p) => p.ready)
    if (!everyoneReady) return

    gameStarted = true
    broadcast({ type: 'game_start' })
    console.log('La partie a commencé !')
}

app.get(
    '/ws',
    upgradeWebSocket(() => {
        // These variables belong to THIS connection only
        let socket = null
        let player = null

        return {
            onOpen(event, ws) {
                socket = ws
            },

            onMessage(event, ws) {
                const data = JSON.parse(event.data)

                // A player joins with a pseudo
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

                // A player marks himself as ready
                if (data.type === 'ready') {
                    if (player) {
                        player.ready = true
                        broadcastPlayers()
                        checkStart()
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
        console.log(`Serveur en cours d'exécution sur http://localhost:${info.port}`)
    }
)