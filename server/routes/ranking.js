const express = require('express');
const { pool } = require('../db');
const { getQuote } = require('./stocks');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT * FROM users');
    const users = usersRes.rows;
    const holdingsRes = await pool.query('SELECT * FROM holdings');
    const allHoldings = holdingsRes.rows;

    const holdingsByUser = new Map();
    for (const h of allHoldings) {
      if (!holdingsByUser.has(h.user_id)) holdingsByUser.set(h.user_id, []);
      holdingsByUser.get(h.user_id).push(h);
    }

    const symbols = [...new Set(allHoldings.map((h) => h.symbol))];
    const quoteMap = new Map();
    await Promise.all(
      symbols.map(async (sym) => {
        const q = await getQuote(sym);
        quoteMap.set(sym, q.price);
      })
    );

    const ranked = users.map((u) => {
      const holdings = holdingsByUser.get(u.id) || [];
      const holdingsValue = holdings.reduce(
        (sum, h) => sum + h.qty * (quoteMap.get(h.symbol) ?? h.avg_price),
        0
      );
      const totalAssets = u.cash + holdingsValue;
      const returnPct = ((totalAssets / u.initial_capital) - 1) * 100;
      return {
        nickname: u.nickname,
        totalAssets,
        cash: u.cash,
        holdingsValue,
        returnPct,
      };
    });

    ranked.sort((a, b) => b.returnPct - a.returnPct);
    const withRank = ranked.map((r, i) => ({ rank: i + 1, ...r }));
    res.json({ ranking: withRank });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '랭킹 조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
