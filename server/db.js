const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'vestin.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

const INITIAL_CAPITAL = 10000000; // 1,000만원

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  cash REAL NOT NULL DEFAULT ${INITIAL_CAPITAL},
  initial_capital REAL NOT NULL DEFAULT ${INITIAL_CAPITAL},
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  symbol TEXT NOT NULL,
  name TEXT,
  qty REAL NOT NULL,
  avg_price REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  symbol TEXT NOT NULL,
  name TEXT,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  qty REAL NOT NULL,
  price REAL NOT NULL,
  amount REAL NOT NULL,
  realized_pnl REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  symbol TEXT NOT NULL,
  name TEXT,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  order_type TEXT NOT NULL CHECK(order_type IN ('MARKET','LIMIT')) DEFAULT 'LIMIT',
  qty REAL NOT NULL,
  limit_price REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','FILLED','CANCELLED')) DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  filled_at TEXT,
  filled_price REAL,
  avg_price_at_order REAL
);
`);

// Lightweight migration for DBs created before avg_price_at_order existed.
const pendingOrderCols = db.prepare('PRAGMA table_info(pending_orders)').all().map((c) => c.name);
if (!pendingOrderCols.includes('avg_price_at_order')) {
  db.exec('ALTER TABLE pending_orders ADD COLUMN avg_price_at_order REAL');
}

module.exports = { db, INITIAL_CAPITAL };
