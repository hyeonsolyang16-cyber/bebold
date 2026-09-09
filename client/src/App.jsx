import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import BottomTabBar from './components/BottomTabBar.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import StockDetail from './pages/StockDetail.jsx';
import Ranking from './pages/Ranking.jsx';
import Account from './pages/Account.jsx';
import { getUser } from './api/client.js';

export const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(() => getUser());

  useEffect(() => {
    // keep in sync if changed elsewhere (e.g. logout)
  }, []);

  const authValue = { user, setUser };

  return (
    <AuthContext.Provider value={authValue}>
      <div className="app-shell">
        <div className="app-main">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />
            <Route
              path="/search"
              element={
                <RequireAuth>
                  <Search />
                </RequireAuth>
              }
            />
            <Route
              path="/stock/:symbol"
              element={
                <RequireAuth>
                  <StockDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/ranking"
              element={
                <RequireAuth>
                  <Ranking />
                </RequireAuth>
              }
            />
            <Route
              path="/account"
              element={
                <RequireAuth>
                  <Account />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {user && <BottomTabBar />}
        <InstallPrompt />
      </div>
    </AuthContext.Provider>
  );
}
