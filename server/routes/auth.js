const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, INITIAL_CAPITAL } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function issueToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    cash: user.cash,
    initialCapital: user.initial_capital,
  };
}

router.post('/signup', (req, res) => {
  try {
    const { email, password, nickname } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const finalNickname = nickname && nickname.trim() ? nickname.trim() : email.split('@')[0];
    const info = db
      .prepare(
        'INSERT INTO users (email, password_hash, nickname, cash, initial_capital) VALUES (?, ?, ?, ?, ?)'
      )
      .run(email, hash, finalNickname, INITIAL_CAPITAL, INITIAL_CAPITAL);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = issueToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const token = issueToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
