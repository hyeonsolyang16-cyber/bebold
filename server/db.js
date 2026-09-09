const { Pool } = require('pg');

const INITIAL_CAPITAL = 10000000; // 1,000만원

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error(`
========================================================================
[BeBold] DATABASE_URL 환경변수가 설정되지 않았습니다.
서버가 PostgreSQL에 연결할 수 없어 시작할 수 없습니다.

Render 배포 환경:
  Render 대시보드에서 PostgreSQL 인스턴스를 생성하고, 생성된 Internal
  Database URL을 이 서비스(Web Service)의 환경변수 DATABASE_URL 에
  등록하세요.

로컬 개발 환경:
  DATABASE_URL=postgresql://<user>:<password>@localhost:5432/bebold
========================================================================
`);
  throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSLMODE === 'disable'
      ? false
      : process.env.DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[BeBold] Unexpected PostgreSQL pool error:', err);
});

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  cash DOUBLE PRECISION NOT NULL DEFAULT ${INITIAL_CAPITAL},
  initial_capital DOUBLE PRECISION NOT NULL DEFAULT ${INITIAL_CAPITAL},
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  reset_token TEXT,
  reset_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holdings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  symbol TEXT NOT NULL,
  name TEXT,
  qty DOUBLE PRECISION NOT NULL,
  avg_price DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  symbol TEXT NOT NULL,
  name TEXT,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty DOUBLE PRECISION NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  realized_pnl DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  symbol TEXT NOT NULL,
  name TEXT,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type TEXT NOT NULL DEFAULT 'LIMIT' CHECK (order_type IN ('MARKET','LIMIT')),
  qty DOUBLE PRECISION NOT NULL,
  limit_price DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','FILLED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ,
  filled_price DOUBLE PRECISION,
  avg_price_at_order DOUBLE PRECISION
);
`;

async function initDb() {
  await pool.query(INIT_SQL);
}

module.exports = { pool, INITIAL_CAPITAL, initDb };
