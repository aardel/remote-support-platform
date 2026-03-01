import React, { useState, useEffect, useMemo } from 'react';
import './Layout.css';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from '../api/axios';

const SOCKET_PATH = '/remote/socket.io';

const NAV_ITEMS = [
    { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { to: '/sessions', icon: '🔗', label: 'Active Sessions' },
    { to: '/devices', icon: '💻', label: 'Registered Devices' },
    { to: '/cases', icon: '🧾', label: 'Online Cases' },
    { to: '/statistics', icon: '📊', label: 'Statistics' },
    { to: '/helper-templates', icon: '📦', label: 'Helper Templates' },
    { to: '/dashboard/classic', icon: '📋', label: 'Classic Dashboard' },
    { to: '/preferences', icon: '⚙', label: 'Preferences' },
];
export default function Layout({ user, onLogout, onGenerateClick }) {
    // Sidebar states
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [desktopCollapsed, setDesktopCollapsed] = useState(false);

    const [version, setVersion] = useState(null);
    const [newTemplates, setNew] = useState(false);
    const [latestTs, setLatestTs] = useState(0);
    const location = useLocation();

    const LS_KEY = useMemo(() => 'rs_templates_seen_ts', []);

    const extractMaxTs = (templates) => {
        if (!templates) return 0;
        const times = ['exe', 'dmg']
            .map(k => templates?.[k]?.updatedAt)
            .filter(Boolean)
            .map(d => new Date(d).getTime())
            .filter(t => Number.isFinite(t));
        return times.length ? Math.max(...times) : 0;
    };

    const refreshNotify = async (templates) => {
        try {
            const t = templates || (await axios.get('/api/packages/templates')).data?.templates;
            const ts = extractMaxTs(t);
            setLatestTs(ts);
            const seen = Number(localStorage.getItem(LS_KEY) || 0);
            setNew(ts > seen);
        } catch { /* ignore */ }
    };

    // Load version + template notification on mount
    useEffect(() => {
        axios.get('/api/version').then(r => setVersion(r.data.version)).catch(() => { });
        refreshNotify();
    }, []);

    // Real-time template updates
    useEffect(() => {
        const socket = io(window.location.origin, { path: SOCKET_PATH });
        socket.on('templates-updated', (data) => {
            const ts = extractMaxTs(data?.templates);
            if (ts) {
                setLatestTs(ts);
                const seen = Number(localStorage.getItem(LS_KEY) || 0);
                setNew(ts > seen);
            } else {
                refreshNotify();
            }
        });
        return () => socket.disconnect();
    }, []);

    // Mark templates as seen when visiting helper-templates page
    useEffect(() => {
        if (location.pathname.startsWith('/helper-templates')) {
            const seen = Number(localStorage.getItem(LS_KEY) || 0);
            const best = Math.max(seen, latestTs || 0);
            if (best > seen) localStorage.setItem(LS_KEY, String(best));
            setNew(false);
        }
    }, [location.pathname, latestTs]);

    // Auto-dismiss new-template badge after 2.5 s
    useEffect(() => {
        if (!newTemplates) return;
        const timer = setTimeout(() => {
            const ts = latestTs || 0;
            if (ts) localStorage.setItem(LS_KEY, String(ts));
            setNew(false);
        }, 2500);
        return () => clearTimeout(timer);
    }, [newTemplates, latestTs]);

    // Monitor screen size
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (!mobile) setMobileOpen(false); // Close mobile menu when switching to desktop
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Toggle function
    const toggleSidebar = () => {
        if (isMobile) setMobileOpen(!mobileOpen);
        else setDesktopCollapsed(!desktopCollapsed);
    };

    // Close mobile sidebar on navigation
    useEffect(() => {
        if (isMobile) setMobileOpen(false);
    }, [location.pathname, isMobile]);

    // ... (rest of the logic for templates, notifications etc) ...

    const sidebarClass = isMobile
        ? `sidebar mobile ${mobileOpen ? 'open' : ''}`
        : `sidebar desktop ${desktopCollapsed ? 'collapsed' : ''}`;

    return (
        <div className={`layout ${!isMobile && desktopCollapsed ? 'collapsed' : ''}`}>
            {isMobile && mobileOpen && (
                <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
            )}

            <nav className={sidebarClass}>
                <div className="sidebar-header">
                    <span className="sidebar-title">Remote Support</span>
                </div>

                <div className="sidebar-nav">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/dashboard'}
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            title={desktopCollapsed && !isMobile ? item.label : ''}
                        >
                            <span className="sidebar-link-icon">{item.icon}</span>
                            <span className="sidebar-link-label">{item.label}</span>
                        </NavLink>
                    ))}
                </div>

                {version && !desktopCollapsed && <div className="sidebar-footer">v{version}</div>}
            </nav>

            <header className="layout-header">
                <div className="header-left">
                    <button
                        className="hamburger-btn"
                        onClick={toggleSidebar}
                        title="Toggle Menu"
                    >
                        ☰
                    </button>
                    {/* On mobile, show brand in header. On desktop, sidebar has it. */}
                    {isMobile && (
                        <>
                            <span className="header-brand">Remote Support</span>
                        </>
                    )}
                </div>

                <div className="header-center">
                    <div className="header-generate-wrap">
                        <button className="header-generate-btn" onClick={onGenerateClick}>
                            + Generate Support Package
                        </button>
                        {newTemplates && (
                            <span className="header-notify-dot" title="New helper templates available" />
                        )}
                    </div>
                </div>

                <div className="header-right">
                    <span className="header-user">{user?.username || 'Technician'}</span>
                    <button className="header-logout-btn" onClick={onLogout}>
                        Logout
                    </button>
                </div>
            </header>

            <main className="layout-main">
                <Outlet />
            </main>
        </div>
    );
}
