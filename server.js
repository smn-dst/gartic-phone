import { serve, upgradeWebSocket } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'

const app = new Hono()

app.get(
    '/ws',
    upgradeWebSocket(() => {
        return {
            onOpen(event, ws) {
                console.log('Un client est connecté')
                ws.send('Bienvenue depuis le serveur !')
            },
            onMessage(event, ws) {
                console.log('Message reçu du client :', event.data)
                ws.send('Le serveur a bien reçu : ' + event.data)
            },
            onClose() {
                console.log('Un client est parti')
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