import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './pages/Login';
import Register from './pages/Register';
import Layout from './components/Layout';
import WidgetDashboard from './pages/WidgetDashboard';
import ClassicDashboard from './pages/ClassicDashboard';
import DevicesPage from './pages/DevicesPage';
import SessionsPage from './pages/SessionsPage';
import StatisticsPage from './pages/StatisticsPage';
import HelperTemplatesPage from './pages/HelperTemplatesPage';
import SessionView from './pages/SessionView';
import PreferencesPage from './pages/PreferencesPage';
import GenerateModal from './components/GenerateModal';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);

  // Listen for custom event from WidgetDashboard's GeneratePackageWidget
  useEffect(() => {
    const handler = () => setGenerateModalOpen(true);
    window.addEventListener('open-generate-modal', handler);
    return () => window.removeEventListener('open-generate-modal', handler);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await axios.get('/api/auth/me');
        setUser(response.data.user);
        setIsAuthenticated(true);
      } catch (error) {
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleLogout = async () => {
    try {
      await axios.get('/api/auth/logout');
    } catch (error) {
      // Ignore logout errors
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748b' }}>Loading...</div>;
  }

  return (
    <Router>
      <GenerateModal open={generateModalOpen} onClose={() => setGenerateModalOpen(false)} />
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />}
        />
        {/* Session view: full screen, no layout */}
        <Route
          path="/session/:sessionId"
          element={isAuthenticated ? <SessionView user={user} /> : <Navigate to="/login" />}
        />
        {/* All other authenticated pages use the Layout shell */}
        <Route
          element={
            isAuthenticated
              ? <Layout user={user} onLogout={handleLogout} onGenerateClick={() => setGenerateModalOpen(true)} />
              : <Navigate to="/login" />
          }
        >
          <Route path="/dashboard" element={<WidgetDashboard />} />
          <Route path="/dashboard/classic" element={<ClassicDashboard user={user} onLogout={handleLogout} />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/helper-templates" element={<HelperTemplatesPage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

export default App;
