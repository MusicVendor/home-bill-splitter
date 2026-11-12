import { Hono } from 'hono'

const route = new Hono<{ Bindings: Env }>()

route.post('/', async (c) => {
  const body = await c.req.json<{ name?: unknown }>()

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'Invalid home name' }, 400)
  }

  const name = body.name.trim()

  const home = await c.env.DB.prepare('INSERT INTO homes (name) VALUES (?) RETURNING id, name')
    .bind(name)
    .first<{ id: number; name: string }>()

  if (!home) {
    return c.json(
      {
        error: 'Failed to create home',
      },
      500,
    )
  }

  return c.json(
    {
      id: String(home.id),
      name: home.name,
    },
    201,
  )
})

route.post('/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const homeIdNumber = Number(homeId)
  const body = await c.req.json<{ name?: unknown }>()

  if (!Number.isInteger(homeIdNumber) || homeIdNumber <= 0) {
    return c.json({ error: 'Home not found' }, 404)
  }

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'Invalid member name' }, 400)
  }

  const name = body.name.trim()

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeIdNumber)
    .first<{ id: number }>()

  if (!home) {
    return c.json(
      {
        error: 'Home not found',
      },
      404,
    )
  }

  let member: {
    id: number
    home_id: number
    name: string
  } | null = null

  const maxRetries = 3

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      member = await c.env.DB.prepare(`
                INSERT INTO members (home_id, name, position)
                SELECT ?, ?, COALESCE(MAX(position), 0) + 1
                FROM members
                WHERE home_id = ?
                RETURNING id, home_id, name
            `)
        .bind(homeIdNumber, name, homeIdNumber)
        .first<{
          id: number
          home_id: number
          name: string
        }>()

      if (member) {
        break
      }
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error
      }
    }
  }

  if (!member) {
    return c.json(
      {
        error: 'Failed to create member',
      },
      500,
    )
  }

  return c.json(
    {
      id: String(member.id),
      homeId: String(homeId),
      name: member.name,
    },
    201,
  )
})

export { route as homesRoutes }
