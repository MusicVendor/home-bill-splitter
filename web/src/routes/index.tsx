import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState, type FormEvent } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

type HomeResponse = {
  id: string
  name: string
}

type Member = {
  id: string
  homeId: string
  name: string
}

type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

type ApiError = {
  error?: string
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '12px 14px',
  border: '1px solid #d7dbe3',
  borderRadius: 10,
  fontSize: 15,
  outline: 'none',
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

async function getErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as ApiError

    return body.error ?? `Request failed with status ${response.status}`
  } catch {
    return `Request failed with status ${response.status}`
  }
}

function Home() {
  const [home, setHome] = useState<HomeResponse | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [homeName, setHomeName] = useState('')
  const [memberName, setMemberName] = useState('')
  const [billTitle, setBillTitle] = useState('')
  const [totalCents, setTotalCents] = useState('')

  const [creatingHome, setCreatingHome] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [creatingBill, setCreatingBill] = useState(false)
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [loadingBalances, setLoadingBalances] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.name])),
    [members],
  )

  async function refreshBalances(homeId: string) {
    setLoadingBalances(true)

    try {
      const response = await fetch(`/api/homes/${homeId}/balances`)

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const data = (await response.json()) as {
        balances: Balance[]
      }

      setBalances(data.balances)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load balances',
      )
    } finally {
      setLoadingBalances(false)
    }
  }

  async function createHome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError(null)
    setCreatingHome(true)

    try {
      const response = await fetch('/api/homes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: homeName,
        }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const createdHome = (await response.json()) as HomeResponse

      setHome(createdHome)
      setHomeName('')
      setMembers([])
      setBills([])
      setBalances([])
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to create home',
      )
    } finally {
      setCreatingHome(false)
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home) return

    setError(null)
    setAddingMember(true)

    try {
      const response = await fetch(`/api/homes/${home.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: memberName,
        }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const member = (await response.json()) as Member

      setMembers((currentMembers) => [...currentMembers, member])

      setMemberName('')

      await refreshBalances(home.id)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to add member',
      )
    } finally {
      setAddingMember(false)
    }
  }

  async function createBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home) return

    const parsedTotal = Number(totalCents)

    if (!Number.isInteger(parsedTotal) || parsedTotal <= 0) {
      setError('Total cents must be a positive whole number.')
      return
    }

    setError(null)
    setCreatingBill(true)

    try {
      const response = await fetch(`/api/homes/${home.id}/bills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: billTitle,
          totalCents: parsedTotal,
        }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const bill = (await response.json()) as Bill

      // Store the bill and shares returned directly by the API
      setBills((currentBills) => [...currentBills, bill])

      setBillTitle('')
      setTotalCents('')

      await refreshBalances(home.id)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to create bill',
      )
    } finally {
      setCreatingBill(false)
    }
  }

  async function payShare(billId: string, shareId: string) {
    setError(null)
    setPayingShareId(shareId)

    try {
      const response = await fetch(
        `/api/bills/${billId}/shares/${shareId}/pay`,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': crypto.randomUUID(),
          },
        },
      )

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const paidShare = (await response.json()) as Share

      setBills((currentBills) =>
        currentBills.map((bill) => {
          if (bill.id !== billId) {
            return bill
          }

          return {
            ...bill,
            shares: bill.shares.map((share) =>
              share.id === shareId
                ? {
                    ...share,
                    paidAt: paidShare.paidAt,
                  }
                : share,
            ),
          }
        }),
      )

      if (home) {
        await refreshBalances(home.id)
      }
    } catch (caughtError) {
      // We do not change the share before the API succeeds.
      // Therefore, if payment fails, it remains unpaid in the UI.
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to pay share',
      )
    } finally {
      setPayingShareId(null)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f6f7fb',
        color: '#172033',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        padding: '32px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto',
        }}
      >
        <header
          style={{
            marginBottom: 28,
          }}
        >
          <p
            style={{
              color: '#636b7b',
              margin: '0 0 6px',
              fontSize: 14,
            }}
          >
            Shared home expenses
          </p>

          <h1
            style={{
              fontSize: 32,
              margin: 0,
            }}
          >
            Bill Splitter
          </h1>

          <p
            style={{
              color: '#636b7b',
              marginBottom: 0,
            }}
          >
            Create a home, add members, split bills, and track outstanding
            shares.
          </p>
        </header>

        {error ? (
          <div
            role="alert"
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              color: '#9f1239',
              padding: 14,
              borderRadius: 10,
              marginBottom: 20,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError(null)}
              style={{
                border: 0,
                background: 'none',
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {!home ? (
          <section style={cardStyle}>
            <h2
              style={{
                marginTop: 0,
              }}
            >
              Create your home
            </h2>

            <p style={mutedStyle}>
              Start by creating the shared home whose expenses you want to
              split.
            </p>

            <form
              onSubmit={createHome}
              style={formRowStyle}
            >
              <input
                style={inputStyle}
                value={homeName}
                onChange={(event) => setHomeName(event.target.value)}
                placeholder="e.g. Maple House"
                aria-label="Home name"
              />

              <button
                style={primaryButtonStyle}
                disabled={creatingHome}
              >
                {creatingHome ? 'Creating…' : 'Create home'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section
              style={{
                ...cardStyle,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <p
                    style={{
                      ...mutedStyle,
                      margin: 0,
                    }}
                  >
                    Current home
                  </p>

                  <h2
                    style={{
                      margin: '4px 0 0',
                    }}
                  >
                    {home.name}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setHome(null)
                    setMembers([])
                    setBills([])
                    setBalances([])
                    setError(null)
                  }}
                  style={secondaryButtonStyle}
                >
                  Start another home
                </button>
              </div>
            </section>

            <section style={gridStyle}>
              <div style={cardStyle}>
                <h2
                  style={{
                    marginTop: 0,
                  }}
                >
                  Members
                </h2>

                <form
                  onSubmit={addMember}
                  style={{
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <input
                    style={inputStyle}
                    value={memberName}
                    onChange={(event) =>
                      setMemberName(event.target.value)
                    }
                    placeholder="Member name"
                    aria-label="Member name"
                  />

                  <button
                    style={primaryButtonStyle}
                    disabled={addingMember}
                  >
                    {addingMember ? 'Adding…' : 'Add'}
                  </button>
                </form>

                {members.length === 0 ? (
                  <p
                    style={{
                      ...mutedStyle,
                      marginBottom: 0,
                    }}
                  >
                    No members yet. Add members before creating a bill.
                  </p>
                ) : (
                  <ol
                    style={{
                      paddingLeft: 20,
                      marginBottom: 0,
                    }}
                  >
                    {members.map((member) => (
                      <li
                        key={member.id}
                        style={{
                          padding: '6px 0',
                        }}
                      >
                        {member.name}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div style={cardStyle}>
                <h2
                  style={{
                    marginTop: 0,
                  }}
                >
                  Outstanding balances
                </h2>

                {loadingBalances ? (
                  <p style={mutedStyle}>
                    Loading balances…
                  </p>
                ) : null}

                {!loadingBalances && balances.length === 0 ? (
                  <p style={mutedStyle}>
                    Balances will appear after members and bills are created.
                  </p>
                ) : null}

                {!loadingBalances && balances.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    {balances.map((balance) => (
                      <div
                        key={balance.memberId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <span>{balance.name}</span>

                        <strong>
                          {formatMoney(balance.outstandingCents)}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section
              style={{
                ...cardStyle,
                marginTop: 20,
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                }}
              >
                Add a bill
              </h2>

              <form
                onSubmit={createBill}
                style={billFormStyle}
              >
                <input
                  style={inputStyle}
                  value={billTitle}
                  onChange={(event) =>
                    setBillTitle(event.target.value)
                  }
                  placeholder="Bill title, e.g. Groceries"
                  aria-label="Bill title"
                />

                <input
                  style={inputStyle}
                  value={totalCents}
                  onChange={(event) =>
                    setTotalCents(event.target.value)
                  }
                  placeholder="Total in cents, e.g. 1250"
                  inputMode="numeric"
                  aria-label="Total cents"
                />

                <button
                  style={primaryButtonStyle}
                  disabled={
                    creatingBill ||
                    members.length === 0
                  }
                >
                  {creatingBill ? 'Splitting…' : 'Split bill'}
                </button>
              </form>

              {members.length === 0 ? (
                <p
                  style={{
                    ...mutedStyle,
                    marginBottom: 0,
                  }}
                >
                  Add at least one member to enable bill creation.
                </p>
              ) : null}
            </section>

            <section
              style={{
                marginTop: 28,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 16,
                }}
              >
                <div>
                  <h2
                    style={{
                      marginBottom: 4,
                    }}
                  >
                    Bills
                  </h2>

                  <p style={mutedStyle}>
                    Each share remains unpaid until its member pays it.
                  </p>
                </div>

                <span
                  style={{
                    color: '#636b7b',
                    fontSize: 14,
                  }}
                >
                  {bills.length} total
                </span>
              </div>

              {bills.length === 0 ? (
                <div
                  style={{
                    ...cardStyle,
                    textAlign: 'center',
                    padding: 32,
                  }}
                >
                  <h3
                    style={{
                      marginTop: 0,
                    }}
                  >
                    No bills yet
                  </h3>

                  <p
                    style={{
                      ...mutedStyle,
                      marginBottom: 0,
                    }}
                  >
                    Create your first bill and its shares will appear here.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: 16,
                  }}
                >
                  {bills.map((bill) => (
                    <article
                      key={bill.id}
                      style={cardStyle}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 16,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <h3
                            style={{
                              margin: 0,
                            }}
                          >
                            {bill.title}
                          </h3>

                          <p
                            style={{
                              ...mutedStyle,
                              margin: '6px 0 0',
                            }}
                          >
                            Total:{' '}
                            {formatMoney(bill.totalCents)}
                          </p>
                        </div>

                        <span style={badgeStyle}>
                          {bill.shares.length} shares
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 18,
                          display: 'grid',
                          gap: 10,
                        }}
                      >
                        {bill.shares.map((share) => {
                          const isPaid =
                            share.paidAt !== null

                          const isPaying =
                            payingShareId === share.id

                          return (
                            <div
                              key={share.id}
                              style={{
                                border:
                                  '1px solid #e5e7eb',
                                borderRadius: 10,
                                padding: 14,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent:
                                  'space-between',
                                gap: 16,
                                flexWrap: 'wrap',
                              }}
                            >
                              <div>
                                <strong>
                                  {memberNames.get(
                                    share.memberId,
                                  ) ??
                                    `Member ${share.memberId}`}
                                </strong>

                                <div
                                  style={{
                                    ...mutedStyle,
                                    marginTop: 3,
                                  }}
                                >
                                  {formatMoney(
                                    share.amountCents,
                                  )}
                                </div>
                              </div>

                              {isPaid ? (
                                <span style={paidBadgeStyle}>
                                  Paid
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  style={primaryButtonStyle}
                                  disabled={isPaying}
                                  onClick={() =>
                                    payShare(
                                      bill.id,
                                      share.id,
                                    )
                                  }
                                >
                                  {isPaying
                                    ? 'Paying…'
                                    : 'Pay share'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e7e9ef',
  borderRadius: 14,
  padding: 20,
  boxShadow: '0 8px 24px rgba(20, 31, 56, 0.05)',
}

const mutedStyle = {
  color: '#687084',
  fontSize: 14,
}

const formRowStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  maxWidth: 620,
}

const billFormStyle = {
  display: 'grid',
  gridTemplateColumns:
    'minmax(0, 1fr) minmax(180px, 260px) auto',
  gap: 10,
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 20,
}

const primaryButtonStyle = {
  border: 0,
  borderRadius: 10,
  padding: '12px 16px',
  background: '#2563eb',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
}

const secondaryButtonStyle = {
  border: '1px solid #d7dbe3',
  borderRadius: 10,
  padding: '10px 14px',
  background: '#ffffff',
  color: '#344055',
  cursor: 'pointer',
}

const badgeStyle = {
  background: '#eff6ff',
  color: '#1d4ed8',
  borderRadius: 999,
  padding: '6px 10px',
  fontSize: 13,
  fontWeight: 600,
}

const paidBadgeStyle = {
  background: '#ecfdf3',
  color: '#15803d',
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 700,
}