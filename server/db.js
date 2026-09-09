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
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  reset_token TEXT,
  reset_token_expires TEXT,
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

// Lightweight migration for DBs created before the account-security columns existed.
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('failed_attempts')) {
  db.exec('ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0');
}
if (!userCols.includes('locked_until')) {
  db.exec('ALTER TABLE users ADD COLUMN locked_until TEXT');
}
if (!userCols.includes('reset_token')) {
  db.exec('ALTER TABLE users ADD COLUMN reset_token TEXT');
}
if (!userCols.includes('reset_token_expires')) {
  db.exec('ALTER TABLE users ADD COLUMN reset_token_expires TEXT');
}

module.exports = { db, INITIAL_CAPITAL };
