const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const { router: stocksRoutes } = require('./routes/stocks');
const tradesRoutes = require('./routes/trades');
const rankingRoutes = require('./routes/ranking');
const { startOrderChecker } = require('./jobs/orderChecker');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/ranking', rankingRoutes);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

async function start() {
  try {
    await initDb();
    console.log('[BeBold] Database initialized (tables ensured).');
  } catch (err) {
    console.error('[BeBold] Failed to initialize database:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`BeBold server listening on port ${PORT}`);
    startOrderChecker();
  });
}

start();
