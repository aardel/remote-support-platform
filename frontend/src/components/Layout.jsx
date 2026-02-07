import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { to: '/sessions', icon: '🔗', label: 'Active Sessions' },
  { to: '/devices', icon: '💻', label: 'Registered Devices' },
  { to: '/statistics', icon: '📊', label: 'Statistics' },
  { to: '/helper-templates', icon: '📦', label: 'Helper Templates' },
  { to: '/dashboard/classic', icon: '📋', label: 'Classic Dashboard' },
];

function Layout({ user, onLogout, onGenerateClick }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appVersion, setAppVersion] = useState(null);
  const location = useLocation();

  useEffect(() => {
    axios.get('/api/version').then(r => setAppVersion(r.data.version)).catch(() => {});
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="layout">
      {/* Sidebar overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src="/logo.png" alt="Logo" className="sidebar-logo" onError={(e) => e.target.style.display = 'none'} />
          <span className="sidebar-title">Remote Support</span>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
        {appVersion && (
          <div className="sidebar-footer">v{appVersion}</div>
        )}
      </nav>

      {/* Header */}
      <header className="layout-header">
        <div className="header-left">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Menu">
            ☰
          </button>
          <img src="/logo.png" alt="Logo" className="header-logo" onError={(e) => e.target.style.display = 'none'} />
          <span className="header-brand">Remote Support</span>
        </div>
        <div className="header-center">
          <button className="header-generate-btn" onClick={onGenerateClick}>
            + Generate Support Package
          </button>
        </div>
        <div className="header-right">
          <span className="header-user">{user?.username || 'Technician'}</span>
          <button className="header-logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {/* Main */}
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
