import { Hono } from 'hono'
import { homesRoutes } from './routes/homes'

const app = new Hono<{ Bindings: Env }>()

app.route('api/homes', homesRoutes)
app.get('/api/health', (c) => c.json({ status: 'ok' }))

export default app
