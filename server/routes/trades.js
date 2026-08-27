const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getQuote } = require('./stocks');

const router = express.Router();
router.use(authMiddleware);

const buyTxn = db.transaction((userId, symbol, name, qty, price) => {
  const amount = qty * price;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  if (user.cash < amount) throw new Error('INSUFFICIENT_CASH');

  const holding = db
    .prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?')
    .get(userId, symbol);

  if (holding) {
    const newQty = holding.qty + qty;
    const newAvg = (holding.qty * holding.avg_price + qty * price) / newQty;
    db.prepare(
      "UPDATE holdings SET qty = ?, avg_price = ?, name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newQty, newAvg, name || holding.name, holding.id);
  } else {
    db.prepare(
      'INSERT INTO holdings (user_id, symbol, name, qty, avg_price) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, symbol, name, qty, price);
  }

  db.prepare('UPDATE users SET cash = cash - ? WHERE id = ?').run(amount, userId);

  db.prepare(
    'INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
  ).run(userId, symbol, name, 'BUY', qty, price, amount);
});

const sellTxn = db.transaction((userId, symbol, qty, price) => {
  const holding = db
    .prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?')
    .get(userId, symbol);
  if (!holding || holding.qty < qty) throw new Error('INSUFFICIENT_SHARES');

  const amount = qty * price;
  const realizedPnl = (price - holding.avg_price) * qty;
  const newQty = holding.qty - qty;

  if (newQty <= 0) {
    db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
  } else {
    db.prepare("UPDATE holdings SET qty = ?, updated_at = datetime('now') WHERE id = ?").run(
      newQty,
      holding.id
    );
  }

  db.prepare('UPDATE users SET cash = cash + ? WHERE id = ?').run(amount, userId);

  db.prepare(
    'INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, symbol, holding.name, 'SELL', qty, price, amount, realizedPnl);

  return realizedPnl;
});

router.post('/buy', async (req, res) => {
  try {
    const { symbol, name, qty } = req.body || {};
    const quantity = Number(qty);
    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ error: '종목과 수량을 확인해주세요.' });
    }
    const quote = await getQuote(symbol);
    const price = quote.price;
    try {
      buyTxn(req.userId, symbol, name || quote.name, quantity, price);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_CASH') {
        return res.status(400).json({ error: '현금이 부족합니다.' });
      }
      throw err;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    res.json({ ok: true, price, cash: user.cash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '매수 처리 중 오류가 발생했습니다.' });
  }
});

router.post('/sell', async (req, res) => {
  try {
    const { symbol, qty } = req.body || {};
    const quantity = Number(qty);
    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ error: '종목과 수량을 확인해주세요.' });
    }
    const quote = await getQuote(symbol);
    const price = quote.price;
    let realizedPnl;
    try {
      realizedPnl = sellTxn(req.userId, symbol, quantity, price);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_SHARES') {
        return res.status(400).json({ error: '보유 수량이 부족합니다.' });
      }
      throw err;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    res.json({ ok: true, price, cash: user.cash, realizedPnl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '매도 처리 중 오류가 발생했습니다.' });
  }
});

router.get('/holdings', async (req, res) => {
  try {
    const holdings = db
      .prepare('SELECT * FROM holdings WHERE user_id = ? ORDER BY updated_at DESC')
      .all(req.userId);
    const enriched = await Promise.all(
      holdings.map(async (h) => {
        const quote = await getQuote(h.symbol);
        const marketValue = quote.price * h.qty;
        const costBasis = h.avg_price * h.qty;
        const unrealizedPnl = marketValue - costBasis;
        const returnPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
        return {
          symbol: h.symbol,
          name: h.name,
          qty: h.qty,
          avgPrice: h.avg_price,
          currentPrice: quote.price,
          marketValue,
          unrealizedPnl,
          returnPct,
        };
      })
    );
    res.json({ holdings: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '보유 종목 조회 중 오류가 발생했습니다.' });
  }
});

router.get('/history', (req, res) => {
  try {
    const rows = db
      .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(req.userId);
    res.json({ transactions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '거래 내역 조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
