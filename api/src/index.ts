import { Hono } from 'hono'
import { billsRoutes } from './routes/bills'
import { homesRoutes } from './routes/homes'

const app = new Hono<{ Bindings: Env }>()

app.route('api/homes', homesRoutes)
app.route('api/bills', billsRoutes)

app.get('/api/health', (c) => c.json({ status: 'ok' }))

export default app
