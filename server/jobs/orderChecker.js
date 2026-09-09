const { getQuote } = require('../routes/stocks');
const { getAllPendingOrders, fillBuyOrderTxn, fillSellOrderTxn } = require('../routes/trades');

const CHECK_INTERVAL_MS = 20 * 1000; // 20s

async function checkPendingOrders() {
  let orders;
  try {
    orders = await getAllPendingOrders();
  } catch (err) {
    console.error('[orderChecker] failed to load pending orders', err);
    return;
  }
  if (!orders || orders.length === 0) return;

  // Group by symbol so we only fetch each quote once per pass.
  const symbols = [...new Set(orders.map((o) => o.symbol))];
  const quotes = {};
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        quotes[symbol] = await getQuote(symbol);
      } catch (err) {
        console.error(`[orderChecker] failed to fetch quote for ${symbol}`, err);
      }
    })
  );

  for (const order of orders) {
    const quote = quotes[order.symbol];
    if (!quote || quote.price == null) continue;
    const price = quote.price;
    try {
      if (order.side === 'BUY' && price <= order.limit_price) {
        await fillBuyOrderTxn(order, price);
        console.log(`[orderChecker] filled BUY order #${order.id} ${order.symbol} @ ${price}`);
      } else if (order.side === 'SELL' && price >= order.limit_price) {
        await fillSellOrderTxn(order, price);
        console.log(`[orderChecker] filled SELL order #${order.id} ${order.symbol} @ ${price}`);
      }
    } catch (err) {
      console.error(`[orderChecker] failed to fill order #${order.id}`, err);
    }
  }
}

function startOrderChecker() {
  checkPendingOrders();
  return setInterval(checkPendingOrders, CHECK_INTERVAL_MS);
}

module.exports = { startOrderChecker, checkPendingOrders };
