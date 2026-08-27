import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken, setUser } from '../api/client.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
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
      const data = await api.post('/auth/login', { email, password });
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
      <div className="brand-title">비볼드</div>
      <div className="brand-sub">주식 모의투자로 실력을 키워보세요</div>
      <form className="card" onSubmit={handleSubmit}>
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
            placeholder="비밀번호"
            required
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 16 }} className="muted">
        계정이 없으신가요? <Link to="/signup" style={{ color: 'var(--primary)', fontWeight: 700 }}>회원가입</Link>
      </div>
    </div>
  );
}
