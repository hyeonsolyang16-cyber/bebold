import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function ForgotPassword() {
  const [step, setStep] = useState('request'); // 'request' | 'confirm'
  const [email, setEmail] = useState('');
  const [devToken, setDevToken] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api.post('/auth/password-reset/request', { email });
      setMessage(res.message);
      if (res.devToken) setDevToken(res.devToken);
      setStep('confirm');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api.post('/auth/password-reset/confirm', { email, token, newPassword });
      setMessage(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-page">
      <img src="/logo.png" alt="비볼드" className="brand-logo" />
      <div className="brand-sub">비밀번호 재설정</div>

      <div className="card" style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        데모 환경: 실제 이메일 발송을 지원하지 않아, 재설정 토큰을 화면에 직접 표시하고 서버 콘솔 로그에도 남깁니다.
      </div>

      {step === 'request' && (
        <form className="card" onSubmit={handleRequest}>
          <div className="form-group">
            <label className="form-label">이메일</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? '요청 중...' : '재설정 토큰 요청'}
          </button>
        </form>
      )}

      {step === 'confirm' && (
        <form className="card" onSubmit={handleConfirm}>
          {message && (
            <div style={{ color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>{message}</div>
          )}
          {devToken && (
            <div className="form-group">
              <label className="form-label">발급된 토큰 (데모)</label>
              <input className="input" value={devToken} readOnly onFocus={(e) => e.target.select()} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">토큰</label>
            <input
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="발급된 토큰을 입력하세요"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">새 비밀번호</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="영문+숫자 포함 8자 이상"
              required
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      )}

      <div style={{ textAlign: 'center', marginTop: 16 }} className="muted">
        <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700 }}>로그인으로 돌아가기</Link>
      </div>
    </div>
  );
}
