import { Hono } from 'hono'

const route = new Hono<{ Bindings: Env }>()

route.post('/:billId/shares/:shareId/pay', async (c) => {
  const billId = Number(c.req.param('billId'))
  const shareId = Number(c.req.param('shareId'))

  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey) {
    return c.json({ error: 'Idempotency-Key is required' }, 400)
  }

  if (!Number.isInteger(billId) || billId <= 0) {
    return c.json(
      {
        error: 'Bill not found',
      },
      404,
    )
  }

  if (!Number.isInteger(shareId) || shareId <= 0) {
    return c.json(
      {
        error: 'Share not found',
      },
      404,
    )
  }

  const paidShare = await c.env.DB.prepare(`
        UPDATE shares
        SET
        paid_at = CURRENT_TIMESTAMP,
        idempotency_key = ?
        WHERE
        id = ?
        AND bill_id = ?
        AND paid_at IS NULL
        RETURNING id, member_id, amount_cents, paid_at, idempotency_key
    `)
    .bind(idempotencyKey, shareId, billId)
    .first<{
      id: number
      member_id: number
      amount_cents: number
      paid_at: string
      idempotency_key: string
    }>()

  if (paidShare) {
    return c.json({
      id: String(paidShare.id),
      memberId: String(paidShare.member_id),
      amountCents: paidShare.amount_cents,
      paidAt: paidShare.paid_at,
    })
  }

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(billId)
    .first<{ id: number }>()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  const share = await c.env.DB.prepare(`
        SELECT id, member_id, amount_cents, paid_at, idempotency_key
        FROM shares
        WHERE id = ? AND bill_id = ?
    `)
    .bind(shareId, billId)
    .first<{
      id: number
      member_id: number
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (!share) {
    return c.json(
      {
        error: 'Share not found',
      },
      404,
    )
  }

  if (share.paid_at !== null && share.idempotency_key === idempotencyKey) {
    return c.json({
      id: String(share.id),
      memberId: String(share.member_id),
      amountCents: share.amount_cents,
      paidAt: share.paid_at,
    })
  }

  if (share.paid_at !== null) {
    return c.json(
      {
        error: 'Share already paid with a different idempotency key',
      },
      409,
    )
  }
})

export { route as billsRoutes }
