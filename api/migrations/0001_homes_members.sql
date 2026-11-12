CREATE TABLE homes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE members (
    id INTEGER PRIMARY KEY,
    home_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),

    FOREIGN KEY (home_id)
        REFERENCES homes(id)
        ON DELETE CASCADE,

    UNIQUE (home_id, position)
);