import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import './SessionView.css';

const MONITOR_OPTIONS = [1, 2, 3, 4];

function SessionView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState(null);
  const [monitorIndex, setMonitorIndex] = useState(0);
  const [switchingMonitor, setSwitchingMonitor] = useState(false);
  const [files, setFiles] = useState([]);
  const [filesOpen, setFilesOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const loadFiles = async () => {
    try {
      const res = await fetch(`/api/files/session/${sessionId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Load files failed', err);
    }
  };

  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to signaling server');
      setStatus('Waiting for helper...');
      newSocket.emit('join-session', { sessionId, role: 'technician' });
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setError('Connection error: ' + err.message);
    });

    // When helper sends WebRTC offer
    newSocket.on('webrtc-offer', async (data) => {
      console.log('Received WebRTC offer');
      setStatus('Connecting to helper...');

      try {
        const pc = createPeerConnection(newSocket, sessionId);
        setPeerConnection(pc);

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log('Set remote description');

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('Created and set local description');

        newSocket.emit('webrtc-answer', {
          sessionId,
          answer: pc.localDescription,
          role: 'technician'
        });
        console.log('Sent answer');
      } catch (err) {
        console.error('Error handling offer:', err);
        setError('Failed to connect: ' + err.message);
      }
    });

    // Handle ICE candidates from helper
    newSocket.on('webrtc-ice-candidate', async (data) => {
      console.log('Received ICE candidate from', data.role);
      if (peerConnection && data.role === 'helper') {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    // Handle peer disconnect
    newSocket.on('peer-disconnected', (data) => {
      if (data.role === 'helper') {
        setStatus('Helper disconnected');
        setConnected(false);
      }
    });

    newSocket.on('file-available', () => {
      loadFiles();
    });

    return () => {
      if (peerConnection) {
        peerConnection.close();
      }
      newSocket.disconnect();
    };
  }, [sessionId]);

  // Update ICE candidate handler when peerConnection changes
  useEffect(() => {
    if (!socket || !peerConnection) return;

    const handleIceCandidate = async (data) => {
      if (data.role === 'helper') {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    };

    socket.on('webrtc-ice-candidate', handleIceCandidate);
    return () => socket.off('webrtc-ice-candidate', handleIceCandidate);
  }, [socket, peerConnection]);

  useEffect(() => {
    if (sessionId) loadFiles();
  }, [sessionId]);

  function createPeerConnection(socket, sessionId) {
    const rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(rtcConfig);

    pc.ontrack = (event) => {
      console.log('Received track:', event.track.kind);
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setConnected(true);
        setStatus('Connected');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        socket.emit('webrtc-ice-candidate', {
          sessionId,
          candidate: event.candidate,
          role: 'technician'
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        setConnected(true);
        setStatus('Connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setConnected(false);
        setStatus('Disconnected');
      }
    };

    return pc;
  }

  const handleMouseEvent = (e) => {
    if (!socket || !connected) return;

    const rect = videoRef.current.getBoundingClientRect();
    const video = videoRef.current;

    // Calculate relative position (0-1 range)
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    socket.emit('remote-mouse', {
      sessionId,
      type: e.type,
      x,
      y,
      button: e.button
    });
  };

  const handleKeyEvent = (e) => {
    if (!socket || !connected) return;

    e.preventDefault();
    socket.emit('remote-keyboard', {
      sessionId,
      type: e.type,
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    });
  };

  const disconnect = () => {
    if (peerConnection) {
      peerConnection.close();
    }
    if (socket) {
      socket.disconnect();
    }
    navigate('/dashboard');
  };

  const uploadFileToUser = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);
      formData.append('direction', 'technician-to-user');
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      if (res.ok) {
        await loadFiles();
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadFile = (fileId, fileName) => {
    window.open(`${window.location.origin}/api/files/download/${fileId}`, '_blank');
  };

  const switchMonitor = async (index) => {
    if (index === monitorIndex || switchingMonitor) return;
    setSwitchingMonitor(true);
    try {
      const res = await fetch(`/api/monitors/session/${sessionId}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ monitorIndex: index })
      });
      if (res.ok) {
        setMonitorIndex(index);
      }
    } catch (err) {
      console.error('Switch monitor failed', err);
    } finally {
      setSwitchingMonitor(false);
    }
  };

  return (
    <div className="session-view">
      <div className="session-header">
        <div className="session-info">
          <h2>Session: {sessionId}</h2>
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '🟢 ' : '⚪ '}{status}
          </span>
        </div>
        <div className="session-controls">
          {connected && (
            <div className="monitor-switch">
              <label htmlFor="session-monitor">Monitor:</label>
              <select
                id="session-monitor"
                value={monitorIndex}
                onChange={(e) => switchMonitor(Number(e.target.value))}
                disabled={switchingMonitor}
              >
                {MONITOR_OPTIONS.map((n) => (
                  <option key={n} value={n - 1}>Monitor {n}</option>
                ))}
              </select>
            </div>
          )}
          <button onClick={disconnect} className="disconnect-btn">
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="session-files">
        <button type="button" className="files-toggle" onClick={() => setFilesOpen(!filesOpen)}>
          📁 Files {filesOpen ? '▼' : '▶'}
        </button>
        {filesOpen && (
          <div className="files-panel">
            <div className="files-actions">
              <input
                ref={fileInputRef}
                type="file"
                onChange={uploadFileToUser}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Send file to user'}
              </button>
            </div>
            <ul className="files-list">
              {files.length === 0 && <li className="files-empty">No files yet</li>}
              {files.map((f) => (
                <li key={f.id}>
                  <span className="files-item-name">{f.original_name || f.originalName}</span>
                  <span className="files-item-dir">{f.direction === 'user-to-technician' ? '← from user' : '→ to user'}</span>
                  {f.direction === 'user-to-technician' && (
                    <button type="button" onClick={() => downloadFile(f.id, f.original_name || f.originalName)}>Download</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          onClick={handleMouseEvent}
          onMouseMove={handleMouseEvent}
          onMouseDown={handleMouseEvent}
          onMouseUp={handleMouseEvent}
          onKeyDown={handleKeyEvent}
          onKeyUp={handleKeyEvent}
          tabIndex={0}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            cursor: connected ? 'crosshair' : 'default'
          }}
        />
        {!connected && (
          <div className="connecting-overlay">
            <div className="spinner"></div>
            <p>{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionView;
