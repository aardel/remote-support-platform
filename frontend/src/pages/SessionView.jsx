import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './SessionView.css';

// noVNC will be loaded from CDN
let RFB = null;
if (typeof window !== 'undefined') {
    // Load noVNC from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@novnc/novnc@1.4.0/core/rfb.js';
    script.onload = () => {
        RFB = window.RFB;
    };
    document.head.appendChild(script);
}

function SessionView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const screenRef = useRef(null);
  const [rfb, setRfb] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    connectToVNC();
    
    return () => {
      if (rfb) {
        rfb.disconnect();
      }
    };
  }, [sessionId]);

  const connectToVNC = () => {
    if (!RFB && typeof window !== 'undefined') {
      // Wait for RFB to load
      setTimeout(connectToVNC, 100);
      return;
    }
    
    if (!RFB) {
      setError('noVNC library not loaded');
      return;
    }
    
    try {
      // WebSocket URL for noVNC
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/websockify?session=${sessionId}`;
      
      console.log('Connecting to VNC:', wsUrl);
      
      const rfbInstance = new RFB(screenRef.current, wsUrl, {
        credentials: {
          password: '' // VNC password if needed
        }
      });

      rfbInstance.addEventListener('connect', () => {
        console.log('✅ Connected to VNC');
        setConnected(true);
        setError(null);
      });

      rfbInstance.addEventListener('disconnect', (e) => {
        console.log('❌ Disconnected from VNC:', e.detail);
        setConnected(false);
        if (e.detail.clean !== true) {
          setError('Connection lost');
        }
      });

      rfbInstance.addEventListener('credentialsrequired', () => {
        console.log('Credentials required');
        // Handle password if needed
      });

      setRfb(rfbInstance);
    } catch (err) {
      console.error('Error connecting to VNC:', err);
      setError('Failed to connect: ' + err.message);
    }
  };

  const disconnect = () => {
    if (rfb) {
      rfb.disconnect();
      setRfb(null);
      setConnected(false);
    }
    navigate('/dashboard');
  };

  return (
    <div className="session-view">
      <div className="session-header">
        <div className="session-info">
          <h2>Session: {sessionId}</h2>
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '✅ Connected' : '⚪ Disconnected'}
          </span>
        </div>
        <div className="session-controls">
          <button onClick={disconnect} className="disconnect-btn">
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={connectToVNC}>Retry</button>
        </div>
      )}

      <div className="vnc-container">
        <div 
          ref={screenRef} 
          className="vnc-screen"
          style={{ 
            width: '100%', 
            height: '100%',
            backgroundColor: '#000'
          }}
        />
      </div>
    </div>
  );
}

export default SessionView;
