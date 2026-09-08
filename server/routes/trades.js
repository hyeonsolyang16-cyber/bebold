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

// Reserve cash for a LIMIT BUY order and record it as pending.
const placeLimitBuyTxn = db.transaction((userId, symbol, name, qty, limitPrice) => {
  const reserveAmount = qty * limitPrice;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  if (user.cash < reserveAmount) throw new Error('INSUFFICIENT_CASH');
  db.prepare('UPDATE users SET cash = cash - ? WHERE id = ?').run(reserveAmount, userId);
  const info = db
    .prepare(
      `INSERT INTO pending_orders (user_id, symbol, name, side, order_type, qty, limit_price, status)
       VALUES (?, ?, ?, 'BUY', 'LIMIT', ?, ?, 'PENDING')`
    )
    .run(userId, symbol, name, qty, limitPrice);
  return info.lastInsertRowid;
});

// Reserve (lock) shares for a LIMIT SELL order by removing them from the holding now.
const placeLimitSellTxn = db.transaction((userId, symbol, name, qty, limitPrice) => {
  const holding = db
    .prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?')
    .get(userId, symbol);
  if (!holding || holding.qty < qty) throw new Error('INSUFFICIENT_SHARES');
  const newQty = holding.qty - qty;
  if (newQty <= 0) {
    db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
  } else {
    db.prepare("UPDATE holdings SET qty = ?, updated_at = datetime('now') WHERE id = ?").run(
      newQty,
      holding.id
    );
  }
  const info = db
    .prepare(
      `INSERT INTO pending_orders (user_id, symbol, name, side, order_type, qty, limit_price, status, avg_price_at_order)
       VALUES (?, ?, ?, 'SELL', 'LIMIT', ?, ?, 'PENDING', ?)`
    )
    .run(userId, symbol, name || holding.name, qty, limitPrice, holding.avg_price);
  return info.lastInsertRowid;
});

// Cancel a pending LIMIT order, releasing the reserved cash or shares.
const cancelOrderTxn = db.transaction((userId, orderId) => {
  const order = db
    .prepare('SELECT * FROM pending_orders WHERE id = ? AND user_id = ?')
    .get(orderId, userId);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (order.status !== 'PENDING') throw new Error('ORDER_NOT_PENDING');

  if (order.side === 'BUY') {
    const reserveAmount = order.qty * order.limit_price;
    db.prepare('UPDATE users SET cash = cash + ? WHERE id = ?').run(reserveAmount, userId);
  } else {
    const holding = db
      .prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?')
      .get(userId, order.symbol);
    if (holding) {
      db.prepare("UPDATE holdings SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?").run(
        order.qty,
        holding.id
      );
    } else {
      db.prepare(
        'INSERT INTO holdings (user_id, symbol, name, qty, avg_price) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, order.symbol, order.name, order.qty, order.limit_price);
    }
  }

  db.prepare("UPDATE pending_orders SET status = 'CANCELLED' WHERE id = ?").run(orderId);
});

router.post('/buy', async (req, res) => {
  try {
    const { symbol, name, qty, orderType, limitPrice } = req.body || {};
    const quantity = Number(qty);
    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ error: '종목과 수량을 확인해주세요.' });
    }

    if (orderType === 'LIMIT') {
      const lp = Number(limitPrice);
      if (!lp || lp <= 0) {
        return res.status(400).json({ error: '지정가를 입력해주세요.' });
      }
      const quote = await getQuote(symbol);
      let orderId;
      try {
        orderId = placeLimitBuyTxn(req.userId, symbol, name || quote.name, quantity, lp);
      } catch (err) {
        if (err.message === 'INSUFFICIENT_CASH') {
          return res.status(400).json({ error: '현금이 부족합니다.' });
        }
        throw err;
      }
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
      return res.json({ ok: true, pending: true, orderId, cash: user.cash });
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
    const { symbol, qty, orderType, limitPrice, name } = req.body || {};
    const quantity = Number(qty);
    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ error: '종목과 수량을 확인해주세요.' });
    }

    if (orderType === 'LIMIT') {
      const lp = Number(limitPrice);
      if (!lp || lp <= 0) {
        return res.status(400).json({ error: '지정가를 입력해주세요.' });
      }
      let orderId;
      try {
        orderId = placeLimitSellTxn(req.userId, symbol, name, quantity, lp);
      } catch (err) {
        if (err.message === 'INSUFFICIENT_SHARES') {
          return res.status(400).json({ error: '보유 수량이 부족합니다.' });
        }
        throw err;
      }
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
      return res.json({ ok: true, pending: true, orderId, cash: user.cash });
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

router.get('/orders/pending', (req, res) => {
  try {
    const orders = db
      .prepare(
        "SELECT * FROM pending_orders WHERE user_id = ? AND status = 'PENDING' ORDER BY created_at DESC"
      )
      .all(req.userId);
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '대기중인 주문 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/orders/:id/cancel', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    try {
      cancelOrderTxn(req.userId, orderId);
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
      }
      if (err.message === 'ORDER_NOT_PENDING') {
        return res.status(400).json({ error: '이미 처리된 주문입니다.' });
      }
      throw err;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    res.json({ ok: true, cash: user.cash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '주문 취소 중 오류가 발생했습니다.' });
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

// --- Used by the background order-checker job to fill matured LIMIT orders ---

// Fill a pending LIMIT BUY: cash for the full reservation was already deducted at
// order time, so we refund the difference between the reserved amount and the
// actual fill cost (fill price is always <= limit price).
const fillBuyOrderTxn = db.transaction((order, fillPrice) => {
  const reserveAmount = order.qty * order.limit_price;
  const actualAmount = order.qty * fillPrice;
  const refund = reserveAmount - actualAmount;

  const holding = db
    .prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?')
    .get(order.user_id, order.symbol);
  if (holding) {
    const newQty = holding.qty + order.qty;
    const newAvg = (holding.qty * holding.avg_price + order.qty * fillPrice) / newQty;
    db.prepare(
      "UPDATE holdings SET qty = ?, avg_price = ?, name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newQty, newAvg, order.name || holding.name, holding.id);
  } else {
    db.prepare(
      'INSERT INTO holdings (user_id, symbol, name, qty, avg_price) VALUES (?, ?, ?, ?, ?)'
    ).run(order.user_id, order.symbol, order.name, order.qty, fillPrice);
  }

  if (refund > 0) {
    db.prepare('UPDATE users SET cash = cash + ? WHERE id = ?').run(refund, order.user_id);
  }

  db.prepare(
    'INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
  ).run(order.user_id, order.symbol, order.name, 'BUY', order.qty, fillPrice, actualAmount);

  db.prepare(
    "UPDATE pending_orders SET status = 'FILLED', filled_at = datetime('now'), filled_price = ? WHERE id = ?"
  ).run(fillPrice, order.id);
});

// Fill a pending LIMIT SELL: shares were already removed from the holding at order
// time, so we just credit cash and record the realized PnL vs. the cost basis
// captured when the order was placed.
const fillSellOrderTxn = db.transaction((order, fillPrice) => {
  const amount = order.qty * fillPrice;
  const costBasis = order.avg_price_at_order ?? fillPrice;
  const realizedPnl = (fillPrice - costBasis) * order.qty;

  db.prepare('UPDATE users SET cash = cash + ? WHERE id = ?').run(amount, order.user_id);

  db.prepare(
    'INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(order.user_id, order.symbol, order.name, 'SELL', order.qty, fillPrice, amount, realizedPnl);

  db.prepare(
    "UPDATE pending_orders SET status = 'FILLED', filled_at = datetime('now'), filled_price = ? WHERE id = ?"
  ).run(fillPrice, order.id);
});

function getAllPendingOrders() {
  return db.prepare("SELECT * FROM pending_orders WHERE status = 'PENDING'").all();
}

module.exports = router;
module.exports.getAllPendingOrders = getAllPendingOrders;
module.exports.fillBuyOrderTxn = fillBuyOrderTxn;
module.exports.fillSellOrderTxn = fillSellOrderTxn;
