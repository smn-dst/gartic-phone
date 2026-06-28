import { serve, upgradeWebSocket } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'

const app = new Hono()

// list players
const players = new Map()

// send list players to all players
function broadcastPlayers() {
    const liste = [...players.values()].map((p) => ({
        id: p.id,
        pseudo: p.pseudo,
    }))
    const message = JSON.stringify({ type: 'players', players: liste })

    for (const p of players.values()) {
        try {
            p.socket.send(message)
        } catch (e) {
            // if the send fails (connection is closing), we ignore
        }
    }
}

app.get(
    '/ws',
    upgradeWebSocket(() => {
        // these variables are specific to this connection
        let socket = null
        let player = null

        return {
            onOpen(event, ws) {
                socket = ws
            },

            onMessage(event, ws) {
                const data = JSON.parse(event.data)

                if (data.type === 'join') {
                    player = {
                        id: crypto.randomUUID(),
                        pseudo: data.pseudo,
                        socket: socket,
                    }
                    players.set(player.id, player)
                    console.log(player.pseudo, 'a rejoint')
                    broadcastPlayers()
                }
            },

            onClose() {
                if (player) {
                    players.delete(player.id)
                    console.log(player.pseudo, 'est parti')
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
        console.log(`Serveur lancé sur http://localhost:${info.port}`)
    }
)