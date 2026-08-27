import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: '홈', icon: '🏠', end: true },
  { to: '/search', label: '차트·검색', icon: '🔍' },
  { to: '/ranking', label: '랭킹', icon: '🏆' },
  { to: '/account', label: '내 계좌', icon: '👤' },
];

export default function BottomTabBar() {
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `tabbar-item${isActive ? ' active' : ''}`}
        >
          <span className="tabbar-icon">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
