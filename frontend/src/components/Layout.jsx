import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { to: '/sessions', icon: '🔗', label: 'Active Sessions' },
  { to: '/devices', icon: '💻', label: 'Registered Devices' },
  { to: '/statistics', icon: '📊', label: 'Statistics' },
  { to: '/helper-templates', icon: '📦', label: 'Helper Templates' },
  { to: '/dashboard/classic', icon: '📋', label: 'Classic Dashboard' },
  { to: '/preferences', icon: '⚙', label: 'Preferences' },
];

function Layout({ user, onLogout, onGenerateClick }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appVersion, setAppVersion] = useState(null);
  const [templatesNew, setTemplatesNew] = useState(false);
  const [templatesLatestTs, setTemplatesLatestTs] = useState(0);
  const location = useLocation();

  const templatesSeenKey = useMemo(() => 'rs_templates_seen_ts', []);

  const computeLatestTemplateTs = (templates) => {
    if (!templates) return 0;
    const ts = ['exe', 'dmg']
      .map(k => templates?.[k]?.updatedAt)
      .filter(Boolean)
      .map(v => new Date(v).getTime())
      .filter(n => Number.isFinite(n));
    return ts.length ? Math.max(...ts) : 0;
  };

  const refreshTemplateNewState = async (templatesOverride) => {
    try {
      const templates = templatesOverride || (await axios.get('/api/packages/templates')).data?.templates;
      const latest = computeLatestTemplateTs(templates);
      setTemplatesLatestTs(latest);
      const seen = Number(localStorage.getItem(templatesSeenKey) || 0);
      setTemplatesNew(latest > seen);
    } catch (_) {
      // Ignore failures, do not block layout.
    }
  };

  useEffect(() => {
    axios.get('/api/version').then(r => setAppVersion(r.data.version)).catch(() => {});
    refreshTemplateNewState();
  }, []);

  // Listen for template uploads in realtime.
  useEffect(() => {
    const socket = io(window.location.origin);
    socket.on('templates-updated', (data) => {
      const latest = computeLatestTemplateTs(data?.templates);
      if (latest) {
        setTemplatesLatestTs(latest);
        const seen = Number(localStorage.getItem(templatesSeenKey) || 0);
        setTemplatesNew(latest > seen);
      } else {
        refreshTemplateNewState();
      }
    });
    return () => socket.disconnect();
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // When user visits the templates page, mark current templates as seen.
  useEffect(() => {
    if (location.pathname.startsWith('/helper-templates')) {
      const seen = Number(localStorage.getItem(templatesSeenKey) || 0);
      const next = Math.max(seen, templatesLatestTs || 0);
      if (next > seen) localStorage.setItem(templatesSeenKey, String(next));
      setTemplatesNew(false);
    }
  }, [location.pathname, templatesLatestTs]);

  // One-time notification: once shown, clear automatically after a short delay.
  useEffect(() => {
    if (!templatesNew) return;
    const t = setTimeout(() => {
      const latest = templatesLatestTs || 0;
      if (latest) localStorage.setItem(templatesSeenKey, String(latest));
      setTemplatesNew(false);
    }, 2500);
    return () => clearTimeout(t);
  }, [templatesNew, templatesLatestTs]);

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
          <div className="header-generate-wrap">
            <button className="header-generate-btn" onClick={onGenerateClick}>
              + Generate Support Package
            </button>
            {templatesNew && <span className="header-notify-dot" title="New helper templates available" />}
          </div>
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
