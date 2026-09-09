const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { db, INITIAL_CAPITAL } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 30;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

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

function passwordPolicyError(password) {
  if (!password || password.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';
  }
  return null;
}

router.post('/signup', authLimiter, (req, res) => {
  try {
    const { email, password, nickname } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      return res.status(400).json({ error: policyError });
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

router.post('/login', authLimiter, (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMs = new Date(user.locked_until) - new Date();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(423).json({
        error: `로그인 실패가 반복되어 계정이 잠겼습니다. ${remainingMin}분 후 다시 시도해주세요.`,
      });
    }

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      const attempts = (user.failed_attempts || 0) + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
        db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(
          lockedUntil,
          user.id
        );
        return res.status(423).json({
          error: `로그인 실패가 ${MAX_FAILED_ATTEMPTS}회 반복되어 계정이 ${LOCK_MINUTES}분간 잠겼습니다.`,
        });
      }
      db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    if (user.failed_attempts || user.locked_until) {
      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
    }

    const token = issueToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// Demo-only password reset: no email service is configured, so the reset
// link/token is returned directly in the API response and logged to the
// server console instead of being emailed.
router.post('/password-reset/request', authLimiter, (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: '이메일을 입력해주세요.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Always respond the same way whether or not the email exists, to avoid
    // leaking which emails are registered.
    if (!user) {
      return res.json({
        ok: true,
        message: '해당 이메일이 가입되어 있다면 재설정 링크가 발급됩니다. (데모 환경: 이메일 발송 미지원)',
      });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(
      token,
      expires,
      user.id
    );
    console.log(`[BeBold] 비밀번호 재설정 토큰 (${email}): ${token} (30분 유효)`);
    res.json({
      ok: true,
      message: '데모 환경: 이메일 발송을 지원하지 않아 재설정 토큰을 아래에 그대로 반환합니다.',
      devToken: token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.post('/password-reset/confirm', authLimiter, (req, res) => {
  try {
    const { email, token, newPassword } = req.body || {};
    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: '이메일, 토큰, 새 비밀번호를 모두 입력해주세요.' });
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.reset_token || user.reset_token !== token) {
      return res.status(400).json({ error: '토큰이 유효하지 않습니다.' });
    }
    if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: '토큰이 만료되었습니다. 다시 요청해주세요.' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, failed_attempts = 0, locked_until = NULL WHERE id = ?'
    ).run(hash, user.id);
    res.json({ ok: true, message: '비밀번호가 재설정되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
