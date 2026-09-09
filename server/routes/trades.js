const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getQuote } = require('./stocks');

const router = express.Router();
router.use(authMiddleware);

// Runs `fn(client)` inside a BEGIN/COMMIT/ROLLBACK transaction on a dedicated
// client, with `SELECT ... FOR UPDATE` used inside fn where rows need locking.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function buyTxn(userId, symbol, name, qty, price) {
  return withTransaction(async (client) => {
    const amount = qty * price;
    const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.cash < amount) throw new Error('INSUFFICIENT_CASH');

    const holdingRes = await client.query(
      'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
      [userId, symbol]
    );
    const holding = holdingRes.rows[0];

    if (holding) {
      const newQty = holding.qty + qty;
      const newAvg = (holding.qty * holding.avg_price + qty * price) / newQty;
      await client.query(
        'UPDATE holdings SET qty = $1, avg_price = $2, name = $3, updated_at = now() WHERE id = $4',
        [newQty, newAvg, name || holding.name, holding.id]
      );
    } else {
      await client.query(
        'INSERT INTO holdings (user_id, symbol, name, qty, avg_price) VALUES ($1, $2, $3, $4, $5)',
        [userId, symbol, name, qty, price]
      );
    }

    await client.query('UPDATE users SET cash = cash - $1 WHERE id = $2', [amount, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl)
       VALUES ($1, $2, $3, 'BUY', $4, $5, $6, 0)`,
      [userId, symbol, name, qty, price, amount]
    );
  });
}

async function sellTxn(userId, symbol, qty, price) {
  return withTransaction(async (client) => {
    const holdingRes = await client.query(
      'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
      [userId, symbol]
    );
    const holding = holdingRes.rows[0];
    if (!holding || holding.qty < qty) throw new Error('INSUFFICIENT_SHARES');

    const amount = qty * price;
    const realizedPnl = (price - holding.avg_price) * qty;
    const newQty = holding.qty - qty;

    if (newQty <= 0) {
      await client.query('DELETE FROM holdings WHERE id = $1', [holding.id]);
    } else {
      await client.query('UPDATE holdings SET qty = $1, updated_at = now() WHERE id = $2', [
        newQty,
        holding.id,
      ]);
    }

    await client.query('UPDATE users SET cash = cash + $1 WHERE id = $2', [amount, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl)
       VALUES ($1, $2, $3, 'SELL', $4, $5, $6, $7)`,
      [userId, symbol, holding.name, qty, price, amount, realizedPnl]
    );

    return realizedPnl;
  });
}

// Reserve cash for a LIMIT BUY order and record it as pending.
async function placeLimitBuyTxn(userId, symbol, name, qty, limitPrice) {
  return withTransaction(async (client) => {
    const reserveAmount = qty * limitPrice;
    const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.cash < reserveAmount) throw new Error('INSUFFICIENT_CASH');
    await client.query('UPDATE users SET cash = cash - $1 WHERE id = $2', [reserveAmount, userId]);
    const inserted = await client.query(
      `INSERT INTO pending_orders (user_id, symbol, name, side, order_type, qty, limit_price, status)
       VALUES ($1, $2, $3, 'BUY', 'LIMIT', $4, $5, 'PENDING') RETURNING id`,
      [userId, symbol, name, qty, limitPrice]
    );
    return inserted.rows[0].id;
  });
}

// Reserve (lock) shares for a LIMIT SELL order by removing them from the holding now.
async function placeLimitSellTxn(userId, symbol, name, qty, limitPrice) {
  return withTransaction(async (client) => {
    const holdingRes = await client.query(
      'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
      [userId, symbol]
    );
    const holding = holdingRes.rows[0];
    if (!holding || holding.qty < qty) throw new Error('INSUFFICIENT_SHARES');
    const newQty = holding.qty - qty;
    if (newQty <= 0) {
      await client.query('DELETE FROM holdings WHERE id = $1', [holding.id]);
    } else {
      await client.query('UPDATE holdings SET qty = $1, updated_at = now() WHERE id = $2', [
        newQty,
        holding.id,
      ]);
    }
    const inserted = await client.query(
      `INSERT INTO pending_orders (user_id, symbol, name, side, order_type, qty, limit_price, status, avg_price_at_order)
       VALUES ($1, $2, $3, 'SELL', 'LIMIT', $4, $5, 'PENDING', $6) RETURNING id`,
      [userId, symbol, name || holding.name, qty, limitPrice, holding.avg_price]
    );
    return inserted.rows[0].id;
  });
}

// Cancel a pending LIMIT order, releasing the reserved cash or shares.
async function cancelOrderTxn(userId, orderId) {
  return withTransaction(async (client) => {
    const orderRes = await client.query(
      'SELECT * FROM pending_orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [orderId, userId]
    );
    const order = orderRes.rows[0];
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status !== 'PENDING') throw new Error('ORDER_NOT_PENDING');

    if (order.side === 'BUY') {
      const reserveAmount = order.qty * order.limit_price;
      await client.query('UPDATE users SET cash = cash + $1 WHERE id = $2', [reserveAmount, userId]);
    } else {
      const holdingRes = await client.query(
        'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
        [userId, order.symbol]
      );
      const holding = holdingRes.rows[0];
      if (holding) {
        await client.query('UPDATE holdings SET qty = qty + $1, updated_at = now() WHERE id = $2', [
          order.qty,
          holding.id,
        ]);
      } else {
        await client.query(
          'INSERT INTO holdings (user_id, symbol, name, qty, avg_price) VALUES ($1, $2, $3, $4, $5)',
          [userId, order.symbol, order.name, order.qty, order.limit_price]
        );
      }
    }

    await client.query("UPDATE pending_orders SET status = 'CANCELLED' WHERE id = $1", [orderId]);
  });
}

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
        orderId = await placeLimitBuyTxn(req.userId, symbol, name || quote.name, quantity, lp);
      } catch (err) {
        if (err.message === 'INSUFFICIENT_CASH') {
          return res.status(400).json({ error: '현금이 부족합니다.' });
        }
        throw err;
      }
      const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      return res.json({ ok: true, pending: true, orderId, cash: userRes.rows[0].cash });
    }

    const quote = await getQuote(symbol);
    const price = quote.price;
    try {
      await buyTxn(req.userId, symbol, name || quote.name, quantity, price);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_CASH') {
        return res.status(400).json({ error: '현금이 부족합니다.' });
      }
      throw err;
    }
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json({ ok: true, price, cash: userRes.rows[0].cash });
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
        orderId = await placeLimitSellTxn(req.userId, symbol, name, quantity, lp);
      } catch (err) {
        if (err.message === 'INSUFFICIENT_SHARES') {
          return res.status(400).json({ error: '보유 수량이 부족합니다.' });
        }
        throw err;
      }
      const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      return res.json({ ok: true, pending: true, orderId, cash: userRes.rows[0].cash });
    }

    const quote = await getQuote(symbol);
    const price = quote.price;
    let realizedPnl;
    try {
      realizedPnl = await sellTxn(req.userId, symbol, quantity, price);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_SHARES') {
        return res.status(400).json({ error: '보유 수량이 부족합니다.' });
      }
      throw err;
    }
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json({ ok: true, price, cash: userRes.rows[0].cash, realizedPnl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '매도 처리 중 오류가 발생했습니다.' });
  }
});

router.get('/orders/pending', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pending_orders WHERE user_id = $1 AND status = 'PENDING' ORDER BY created_at DESC",
      [req.userId]
    );
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '대기중인 주문 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    try {
      await cancelOrderTxn(req.userId, orderId);
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
      }
      if (err.message === 'ORDER_NOT_PENDING') {
        return res.status(400).json({ error: '이미 처리된 주문입니다.' });
      }
      throw err;
    }
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json({ ok: true, cash: userRes.rows[0].cash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '주문 취소 중 오류가 발생했습니다.' });
  }
});

router.get('/holdings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM holdings WHERE user_id = $1 ORDER BY updated_at DESC', [
      req.userId,
    ]);
    const enriched = await Promise.all(
      result.rows.map(async (h) => {
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

router.get('/history', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.userId]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '거래 내역 조회 중 오류가 발생했습니다.' });
  }
});

// --- Used by the background order-checker job to fill matured LIMIT orders ---

async function getAllPendingOrders() {
  const result = await pool.query("SELECT * FROM pending_orders WHERE status = 'PENDING'");
  return result.rows;
}

// Fill a pending LIMIT BUY: cash for the full reservation was already deducted at
// order time, so we refund the difference between the reserved amount and the
// actual fill cost (fill price is always <= limit price).
async function fillBuyOrderTxn(order, fillPrice) {
  return withTransaction(async (client) => {
    const reserveAmount = order.qty * order.limit_price;
    const actualAmount = order.qty * fillPrice;
    const refund = reserveAmount - actualAmount;

    const holdingRes = await client.query(
      'SELECT * FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
      [order.user_id, order.symbol]
    );
    const holding = holdingRes.rows[0];
    if (holding) {
      const newQty = holding.qty + order.qty;
      const newAvg = (holding.qty * holding.avg_price + order.qty * fillPrice) / newQty;
      await client.query(
        'UPDATE holdings SET qty = $1, avg_price = $2, name = $3, updated_at = now() WHERE id = $4',
        [newQty, newAvg, order.name || holding.name, holding.id]
      );
    } else {
      await client.query(
        'INSERT INTO holdings (user_id, symbol, name, qty, avg_price) VALUES ($1, $2, $3, $4, $5)',
        [order.user_id, order.symbol, order.name, order.qty, fillPrice]
      );
    }

    if (refund > 0) {
      await client.query('UPDATE users SET cash = cash + $1 WHERE id = $2', [refund, order.user_id]);
    }

    await client.query(
      `INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl)
       VALUES ($1, $2, $3, 'BUY', $4, $5, $6, 0)`,
      [order.user_id, order.symbol, order.name, order.qty, fillPrice, actualAmount]
    );

    await client.query(
      "UPDATE pending_orders SET status = 'FILLED', filled_at = now(), filled_price = $1 WHERE id = $2",
      [fillPrice, order.id]
    );
  });
}

// Fill a pending LIMIT SELL: shares were already removed from the holding at order
// time, so we just credit cash and record the realized PnL vs. the cost basis
// captured when the order was placed.
async function fillSellOrderTxn(order, fillPrice) {
  return withTransaction(async (client) => {
    const amount = order.qty * fillPrice;
    const costBasis = order.avg_price_at_order ?? fillPrice;
    const realizedPnl = (fillPrice - costBasis) * order.qty;

    await client.query('UPDATE users SET cash = cash + $1 WHERE id = $2', [amount, order.user_id]);

    await client.query(
      `INSERT INTO transactions (user_id, symbol, name, side, qty, price, amount, realized_pnl)
       VALUES ($1, $2, $3, 'SELL', $4, $5, $6, $7)`,
      [order.user_id, order.symbol, order.name, order.qty, fillPrice, amount, realizedPnl]
    );

    await client.query(
      "UPDATE pending_orders SET status = 'FILLED', filled_at = now(), filled_price = $1 WHERE id = $2",
      [fillPrice, order.id]
    );
  });
}

module.exports = router;
module.exports.getAllPendingOrders = getAllPendingOrders;
module.exports.fillBuyOrderTxn = fillBuyOrderTxn;
module.exports.fillSellOrderTxn = fillSellOrderTxn;
