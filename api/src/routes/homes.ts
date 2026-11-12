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

route.post('/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const homeIdNumber = Number(homeId)
  const body = await c.req.json<{ title?: unknown; totalCents?: unknown }>()

  if (!Number.isInteger(homeIdNumber) || homeIdNumber <= 0) {
    return c.json({ error: 'Home not found' }, 404)
  }

  if (typeof body.title !== 'string' || body.title.trim() === '') {
    return c.json({ error: 'Invalid bill title' }, 422)
  }

  if (
    typeof body.totalCents !== 'number' ||
    !Number.isInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return c.json({ error: 'Invalid bill total' }, 422)
  }

  const title = body.title.trim()
  const totalCents = body.totalCents

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

  const membersResult = await c.env.DB.prepare(`
                                SELECT id, name, position
                                FROM members
                                WHERE home_id = ?
                                ORDER BY position ASC
                            `)
    .bind(homeIdNumber)
    .all<{
      id: number
      name: string
      position: number
    }>()

  const members = membersResult.results

  if (members.length === 0) {
    return c.json(
      {
        error: 'Home has no members',
      },
      422,
    )
  }

  const shareCents = Math.floor(totalCents / members.length)
  const remainder = totalCents % members.length

  const calculatedShares = members.map((member, index) => ({
    memberId: member.id,
    amountCents: shareCents + (index < remainder ? 1 : 0),
  }))

  const bill = await c.env.DB.prepare(`
        INSERT INTO bills (home_id, title, total_cents)
        VALUES (?, ?, ?)
        RETURNING id, home_id, title, total_cents
    `)
    .bind(homeIdNumber, title, totalCents)
    .first<{ id: number; home_id: number; title: string; total_cents: number }>()

  if (!bill) {
    return c.json(
      {
        error: 'Failed to create bill',
      },
      500,
    )
  }

  const billQuery = calculatedShares.map((share) =>
    c.env.DB.prepare(
      `
        INSERT INTO shares (bill_id, member_id, amount_cents)
        VALUES (?, ?, ?)
        RETURNING id, member_id, amount_cents, paid_at
      `,
    ).bind(bill.id, share.memberId, share.amountCents),
  )

  const results = await c.env.DB.batch(billQuery)
  const shares = results.map((result) => {
    const share = result.results[0] as {
      id: number
      member_id: number
      amount_cents: number
      paid_at: string | null
    }

    return {
      id: String(share.id),
      memberId: String(share.member_id),
      amountCents: share.amount_cents,
      paidAt: share.paid_at,
    }
  })

  return c.json(
    {
      id: String(bill.id),
      homeId: String(bill.home_id),
      title: bill.title,
      totalCents: bill.total_cents,
      shares,
    },
    201,
  )
})

route.get(':homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  const homeIdNumber = Number(homeId)

  if (!Number.isInteger(homeIdNumber) || homeIdNumber <= 0) {
    return c.json(
      {
        error: 'Home not found',
      },
      404,
    )
  }

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

  const result = await c.env.DB.prepare(`
      SELECT
        m.id,
        m.name,
        COALESCE(
          SUM(
            CASE
              WHEN s.paid_at IS NULL THEN s.amount_cents
              ELSE 0
            END
          ),
          0
        ) AS outstanding_cents
      FROM members m
      LEFT JOIN shares s ON s.member_id = m.id
      LEFT JOIN bills b ON b.id = s.bill_id
      WHERE m.home_id = ?
      GROUP BY m.id, m.name, m.position
      ORDER BY m.position ASC
    `)
    .bind(homeIdNumber)
    .all<{
      id: number
      name: string
      outstanding_cents: number
    }>()

  const balances = result.results.map((member) => ({
    memberId: String(member.id),
    name: member.name,
    outstandingCents: member.outstanding_cents,
  }))

  return c.json({
    balances,
  })
})

export { route as homesRoutes }
