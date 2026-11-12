CREATE TABLE bills (
  id INTEGER PRIMARY KEY,
  home_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),

  FOREIGN KEY (home_id)
    REFERENCES homes(id)
    ON DELETE CASCADE
);

CREATE TABLE shares (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),

  paid_at TEXT,
  idempotency_key TEXT,

  FOREIGN KEY (bill_id)
    REFERENCES bills(id)
    ON DELETE CASCADE,

  FOREIGN KEY (member_id)
    REFERENCES members(id)
    ON DELETE CASCADE,

  UNIQUE (bill_id, member_id)
);