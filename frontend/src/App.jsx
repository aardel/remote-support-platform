import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from './api/axios';

import Login from './pages/Login';
import Register from './pages/Register';
import SessionView from './pages/SessionView';
import Layout from './pages/Layout';
import WidgetDashboard from './pages/WidgetDashboard';
import ClassicDashboard from './pages/ClassicDashboard';
import DevicesPage from './pages/DevicesPage';
import SessionsPage from './pages/SessionsPage';
import CasesPage from './pages/CasesPage';
import StatisticsPage from './pages/StatisticsPage';
import HelperTemplatesPage from './pages/HelperTemplatesPage';
import PreferencesPage from './pages/PreferencesPage';
import GenerateModal from './components/GenerateModal';

const BASE = '/remote';

axios.defaults.baseURL = BASE;

// -- Patch window.fetch so bare /api calls go through the base path --
const _origFetch = window.fetch;
window.fetch = function (url, init) {
    if (typeof url === 'string' && url.startsWith('/api') && !url.startsWith('http')) {
        url = BASE + url;
    }
    return _origFetch.call(this, url, init);
};

export default function App() {
    const [isAuthenticated, setAuth] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);

    // Listen for custom event to open the generate modal from anywhere
    useEffect(() => {
        const handler = () => setModalOpen(true);
        window.addEventListener('open-generate-modal', handler);
        return () => window.removeEventListener('open-generate-modal', handler);
    }, []);

    // Check authentication on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get('/api/auth/me');
                setUser(res.data.user);
                setAuth(true);
            } catch {
                setUser(null);
                setAuth(false);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleLogout = async () => {
        try { await axios.get('/api/auth/logout'); } catch { /* ignore */ }
        finally {
            setUser(null);
            setAuth(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748b' }}>
                Loading...
            </div>
        );
    }

    return (
        <BrowserRouter basename="/remote">
            <GenerateModal open={modalOpen} onClose={() => setModalOpen(false)} />

            <Routes>
                {/* Auth pages */}
                <Route
                    path="/login"
                    element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
                />
                <Route
                    path="/register"
                    element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />}
                />

                {/* Session view (no sidebar layout) */}
                <Route
                    path="/session/:sessionId"
                    element={isAuthenticated ? <SessionView user={user} /> : <Navigate to="/login" />}
                />

                {/* Dashboard pages inside Layout */}
                <Route
                    element={
                        isAuthenticated
                            ? <Layout user={user} onLogout={handleLogout} onGenerateClick={() => setModalOpen(true)} />
                            : <Navigate to="/login" />
                    }
                >
                    <Route path="/dashboard" element={<WidgetDashboard />} />
                    <Route path="/dashboard/classic" element={<ClassicDashboard user={user} onLogout={handleLogout} />} />
                    <Route path="/devices" element={<DevicesPage />} />
                    <Route path="/sessions" element={<SessionsPage />} />
                    <Route path="/cases" element={<CasesPage />} />
                    <Route path="/statistics" element={<StatisticsPage />} />
                    <Route path="/helper-templates" element={<HelperTemplatesPage />} />
                    <Route path="/preferences" element={<PreferencesPage />} />
                </Route>

                {/* Catch-all */}
                <Route path="/" element={<Navigate to="/dashboard" />} />
            </Routes>
        </BrowserRouter>
    );
}
