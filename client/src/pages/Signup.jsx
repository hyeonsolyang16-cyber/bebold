import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken, setUser } from '../api/client.js';
import { useAuth } from '../App.jsx';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser: setAuthUser } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/auth/signup', { email, password, nickname });
      setToken(data.token);
      setUser(data.user);
      setAuthUser(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-page">
      <img src="/logo.png" alt="비볼드" className="brand-logo" />
      <div className="brand-sub">가입 즉시 1,000만원의 모의투자금이 지급됩니다</div>
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">닉네임</label>
          <input
            className="input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="투자왕"
          />
        </div>
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
        <div className="form-group">
          <label className="form-label">비밀번호</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="4자 이상"
            required
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 16 }} className="muted">
        이미 계정이 있으신가요? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700 }}>로그인</Link>
      </div>
    </div>
  );
}
