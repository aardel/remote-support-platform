import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import './SessionView.css';

const MONITOR_OPTIONS = [1, 2, 3, 4];

function SessionView({ user }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const videoTopRef = useRef(null);
  const videoBottomRef = useRef(null);
  const splitTopRef = useRef(null);
  const splitBottomRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState(null);
  const [monitorIndex, setMonitorIndex] = useState(0);
  const [switchingMonitor, setSwitchingMonitor] = useState(false);
  const [streamQuality, setStreamQuality] = useState('balanced');
  const [splitView, setSplitView] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const splitContainerRef = useRef(null);
  const [helperCapabilities, setHelperCapabilities] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesOpen, setFilesOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filesToSend, setFilesToSend] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [remotePath, setRemotePath] = useState('');
  const [remoteEntries, setRemoteEntries] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(null);
  const [selectedRemotePaths, setSelectedRemotePaths] = useState(new Set());
  const [receiving, setReceiving] = useState(false);
  const [remoteRefreshKey, setRemoteRefreshKey] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chatWindowRef = useRef(null);
  const controlPanelRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const remoteRequestIdRef = useRef(0);
  const pendingGetFilesRef = useRef(new Map());
  const panelRequestIdRef = useRef(0);
  const panelListPathRef = useRef('');
  const sendSelectedToRemoteRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;

  const openControlPanel = () => {
    if (controlPanelRef.current && !controlPanelRef.current.closed) {
      controlPanelRef.current.focus();
      return true;
    }
    const w = window.open(
      `/control-panel.html?sessionId=${encodeURIComponent(sessionId)}`,
      `control-panel-${sessionId}`,
      'width=280,height=340,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );
    controlPanelRef.current = w;
    return !!(w && !w.closed);
  };

  const openChatPopup = () => {
    openControlPanel();
    setChatUnread(0);
  };

  function buildFileTree(fileList) {
    const root = { name: '', children: {}, files: [] };
    fileList.forEach((file) => {
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/');
      if (parts.length > 1) {
        let current = root;
        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i];
          if (!current.children[p]) current.children[p] = { name: p, children: {}, files: [] };
          current = current.children[p];
        }
        current.files.push(file);
      } else {
        root.files.push(file);
      }
    });
    return root;
  }

  function flattenTreeForSend(node) {
    let list = [...(node.files || [])];
    Object.values(node.children || {}).forEach((child) => {
      list = list.concat(flattenTreeForSend(child));
    });
    return list;
  }

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
      const u = userRef.current;
      const technicianName = (u?.username || u?.displayName || u?.email || (u?.id && String(u.id)) || 'Technician').trim() || 'Technician';
      const technicianId = u?.id ?? u?.nextcloudId ?? 'technician';
      newSocket.emit('join-session', { sessionId, role: 'technician', technicianId, technicianName });
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
        peerConnectionRef.current = pc;
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

    // Handle ICE candidates from helper (use ref so we don't miss candidates that arrive before state updates)
    newSocket.on('webrtc-ice-candidate', async (data) => {
      const pc = peerConnectionRef.current;
      if (!pc || data.role !== 'helper') return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    });

    // Handle peer disconnect
    newSocket.on('peer-disconnected', (data) => {
      if (data.role === 'helper') {
        setStatus('Helper disconnected');
        setConnected(false);
      }
    });

    newSocket.on('helper-capabilities', (data) => {
      console.log('Helper capabilities:', data.capabilities);
      setHelperCapabilities(data.capabilities);
    });

    newSocket.on('chat-message', () => {
      setChatUnread(prev => prev + 1);
    });

    newSocket.on('file-available', () => {
      loadFiles();
    });

    newSocket.on('list-remote-dir-result', (data) => {
      const isPanelRequest = typeof data.requestId === 'string' && data.requestId.startsWith('panel-');
      if (!isPanelRequest) {
        setRemoteLoading(false);
        if (data.error) setRemoteError(data.error);
        else setRemoteEntries(data.list || []);
      }
    });
    newSocket.on('get-remote-file-result', (data) => {
      const pending = pendingGetFilesRef.current.get(data.requestId);
      if (pending) {
        pendingGetFilesRef.current.delete(data.requestId);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          try {
            const bin = atob(data.content);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const blob = new Blob([arr]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.name || 'download';
            a.click();
            URL.revokeObjectURL(url);
            pending.resolve();
          } catch (e) {
            pending.reject(e);
          }
        }
      }
      if (pendingGetFilesRef.current.size === 0) setReceiving(false);
    });
    newSocket.on('put-remote-file-result', (data) => {
      if (data.success) loadFiles();
    });

    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      newSocket.disconnect();
    };
  }, [sessionId]);

  // Sync stream to whichever video element(s) are currently mounted
  useLayoutEffect(() => {
    if (!remoteStream) return;
    if (splitView) {
      if (videoTopRef.current) {
        videoTopRef.current.srcObject = remoteStream;
        videoTopRef.current.play().catch(() => {});
      }
      if (videoBottomRef.current) {
        videoBottomRef.current.srcObject = remoteStream;
        videoBottomRef.current.play().catch(() => {});
      }
    } else {
      if (videoRef.current) {
        videoRef.current.srcObject = remoteStream;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [remoteStream, splitView]);

  useEffect(() => {
    if (sessionId) loadFiles();
  }, [sessionId]);

  // Draggable split divider
  useEffect(() => {
    if (!draggingSplit) return;
    const onMove = (e) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const onUp = () => setDraggingSplit(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingSplit]);

  // Apply stream quality preset when connection is established
  useEffect(() => {
    if (connected && socket && sessionId && streamQuality) {
      socket.emit('set-stream-quality', { sessionId, quality: streamQuality });
    }
  }, [connected]);

  // Clamp monitor selection when helper has fewer displays (e.g. single monitor)
  useEffect(() => {
    const displayCount = helperCapabilities?.displayCount;
    if (typeof displayCount === 'number' && displayCount > 0 && monitorIndex >= displayCount) {
      setMonitorIndex(Math.max(0, displayCount - 1));
    }
  }, [helperCapabilities?.displayCount, monitorIndex]);

  // BroadcastChannel: sync state to control panel and handle commands from panel
  useEffect(() => {
    const channelName = 'session-control-' + sessionId;
    const channel = new BroadcastChannel(channelName);

    const postState = () => {
      channel.postMessage({
        type: 'state-update',
        monitorIndex,
        streamQuality,
        splitView,
        connected,
        chatUnread,
        displayCount: helperCapabilities?.displayCount
      });
    };
    postState();

    channel.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'switch-monitor') {
        switchMonitor(typeof msg.index === 'number' ? msg.index : 0);
      }
      if (msg.type === 'set-quality' && msg.quality) {
        setStreamQuality(msg.quality);
        if (socket && sessionId) socket.emit('set-stream-quality', { sessionId, quality: msg.quality });
      }
      if (msg.type === 'toggle-split') {
        setSplitView(!!msg.enabled);
      }
      if (msg.type === 'exit-fullscreen') {
        const el = document.fullscreenElement;
        if (el && el.classList.contains('video-container')) el.exitFullscreen?.();
      }
      if (msg.type === 'disconnect') {
        disconnect();
      }
      if (msg.type === 'files-list-remote') {
        const path = (msg.path === 'Home' || msg.path === '') ? '' : (msg.path ?? '');
        panelListPathRef.current = path;
        const reqId = 'panel-' + (++panelRequestIdRef.current);
        socket?.emit('list-remote-dir', { sessionId, path, requestId: reqId });
      }
      if (msg.type === 'open-file-picker') {
        fileInputRef.current?.click();
      }
      if (msg.type === 'files-send') {
        sendSelectedToRemoteRef.current?.();
      }
      if (msg.type === 'files-receive') {
        setFilesOpen(true);
        setRemoteRefreshKey((k) => k + 1);
      }
    };

    return () => channel.close();
  }, [sessionId, monitorIndex, streamQuality, splitView, connected, chatUnread, helperCapabilities?.displayCount]);

  // Post files-remote-list to control panel when list-remote-dir-result is for panel request
  useEffect(() => {
    if (!socket || !sessionId) return;
    const handler = (data) => {
      const id = data.requestId;
      if (typeof id !== 'string' || !id.startsWith('panel-')) return;
      try {
        const channel = new BroadcastChannel('session-control-' + sessionId);
        channel.postMessage({
          type: 'files-remote-list',
          path: panelListPathRef.current,
          list: data.error ? [] : (data.list || [])
        });
        channel.close();
      } catch (_) {}
    };
    socket.on('list-remote-dir-result', handler);
    return () => socket.off('list-remote-dir-result', handler);
  }, [socket, sessionId]);

  // Request remote directory listing when file modal opens, path changes, or refresh
  useEffect(() => {
    if (!socket || !sessionId || !filesOpen) return;
    setRemoteLoading(true);
    setRemoteError(null);
    const reqId = ++remoteRequestIdRef.current;
    socket.emit('list-remote-dir', { sessionId, path: remotePath, requestId: reqId });
  }, [socket, sessionId, filesOpen, remotePath, remoteRefreshKey]);

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
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (videoRef.current) videoRef.current.srcObject = event.streams[0];
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

  // half: undefined = single view, 'top' = top half, 'bottom' = bottom half (for split view)
  const handleMouseEvent = (e, half) => {
    e.preventDefault();
    if (!socket || !connected) {
      if (e.type === 'mousedown') console.warn('[mouse] blocked: socket=', !!socket, 'connected=', connected);
      return;
    }

    const video = half === 'top' ? videoTopRef.current : half === 'bottom' ? videoBottomRef.current : videoRef.current;
    if (!video) { if (e.type === 'mousedown') console.warn('[mouse] no video ref'); return; }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { if (e.type === 'mousedown') console.warn('[mouse] no video dimensions:', vw, vh); return; }

    // With object-view-box, each split video renders only its cropped portion.
    // The visible content aspect ratio changes based on the crop.
    const cropH = half === 'top' ? vh * splitRatio : half === 'bottom' ? vh * (1 - splitRatio) : vh;
    const rect = video.getBoundingClientRect();
    const scale = Math.min(rect.width / vw, rect.height / cropH);
    const contentW = vw * scale;
    const contentH = cropH * scale;
    const contentLeft = rect.left + (rect.width - contentW) / 2;
    const contentTop = rect.top + (rect.height - contentH) / 2;
    let x = (e.clientX - contentLeft) / contentW;
    let y = (e.clientY - contentTop) / contentH;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // Map local y back to full-screen y
    if (half === 'top') y = y * splitRatio;
    else if (half === 'bottom') y = splitRatio + y * (1 - splitRatio);

    if (e.type === 'mousedown') console.log('[mouse] emit', e.type, 'x=', x.toFixed(3), 'y=', y.toFixed(3), 'btn=', e.button);
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
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (socket) {
      socket.disconnect();
    }
    navigate('/dashboard');
  };

  const addFilesToSend = (e) => {
    const chosen = e.target.files;
    if (!chosen?.length) return;
    setFilesToSend((prev) => [...prev, ...Array.from(chosen)]);
    e.target.value = '';
  };

  const addFolderToSend = (e) => {
    const chosen = e.target.files;
    if (!chosen?.length) return;
    setFilesToSend((prev) => [...prev, ...Array.from(chosen)]);
    e.target.value = '';
  };

  const removeFileToSend = (index) => {
    setFilesToSend((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleFolder = (path) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buf = reader.result;
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        resolve(btoa(binary));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  const sendSelectedToRemote = async () => {
    if (!socket || !sessionId || !filesToSend.length || uploading) return;
    setUploading(true);
    try {
      const toSend = flattenTreeForSend(buildFileTree(filesToSend));
      for (const file of toSend) {
        const content = await fileToBase64(file);
        const requestId = ++remoteRequestIdRef.current;
        socket.emit('put-remote-file', {
          sessionId,
          path: remotePath,
          filename: file.name,
          content,
          requestId
        });
      }
      setFilesToSend([]);
      await loadFiles();
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
    }
  };
  sendSelectedToRemoteRef.current = sendSelectedToRemote;

  const handleFullscreenToggle = async () => {
    const container = splitContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    } else {
      try {
        // Open control panel *before* fullscreen so the popup doesn't steal focus
        // and trigger the browser to exit fullscreen immediately.
        openControlPanel();
        await container.requestFullscreen?.();
        setIsFullscreen(true);
        // Bring popup to front after fullscreen; it often opens behind the fullscreen window.
        setTimeout(() => {
          if (controlPanelRef.current && !controlPanelRef.current.closed) {
            controlPanelRef.current.focus();
          }
        }, 150);
      } catch (err) {
        console.error('Fullscreen failed', err);
      }
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      const full = !!document.fullscreenElement && document.fullscreenElement.classList?.contains('video-container');
      setIsFullscreen(full);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const downloadFile = (fileId, fileName) => {
    window.open(`${window.location.origin}/api/files/download/${fileId}`, '_blank');
  };

  const remoteParentPath = () => {
    if (!remotePath) return null;
    const sep = remotePath.includes('\\') ? '\\' : '/';
    const idx = Math.max(remotePath.lastIndexOf(sep), remotePath.lastIndexOf('/'));
    if (idx <= 0) return '';
    return remotePath.slice(0, idx);
  };

  const goRemoteUp = () => {
    const parent = remoteParentPath();
    setRemotePath(parent !== null ? parent : '');
  };

  const goRemoteInto = (entry) => {
    if (!entry.isDirectory) return;
    setRemotePath(entry.path);
  };

  const toggleRemoteSelection = (pathKey) => {
    setSelectedRemotePaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  };

  const receiveSelectedFromRemote = async () => {
    if (!socket || !sessionId || selectedRemotePaths.size === 0 || receiving) return;
    const entries = remoteEntries.filter((e) => selectedRemotePaths.has(e.path) && !e.isDirectory);
    if (entries.length === 0) return;
    setReceiving(true);
    try {
      for (const entry of entries) {
        const requestId = ++remoteRequestIdRef.current;
        await new Promise((resolve, reject) => {
          pendingGetFilesRef.current.set(requestId, { resolve, reject });
          socket.emit('get-remote-file', { sessionId, path: entry.path, requestId });
        });
      }
    } catch (err) {
      console.error('Receive failed', err);
    } finally {
      if (pendingGetFilesRef.current.size === 0) setReceiving(false);
    }
  };

  function renderTree(node, path = '') {
    if (!node) return null;
    const entries = [];
    Object.entries(node.children || {}).forEach(([name, child]) => {
      const childPath = path ? `${path}/${name}` : name;
      const isExpanded = expandedFolders[childPath] !== false;
      entries.push(
        <div key={childPath} className="file-tree-node">
          <button type="button" className="file-tree-folder" onClick={() => toggleFolder(childPath)}>
            <span className="file-tree-icon">{isExpanded ? '▼' : '▶'}</span>
            <span className="file-tree-folder-icon">📁</span>
            <span className="file-tree-label">{name}</span>
          </button>
          {isExpanded && (
            <div className="file-tree-children">
              {renderTree(child, childPath)}
              {(child.files || []).map((file, i) => (
                <div key={`${childPath}-f-${i}`} className="file-tree-file">
                  <span className="file-tree-file-icon">📄</span>
                  <span className="file-tree-label" title={file.name}>{file.name}</span>
                  <span className="file-tree-size">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
    (node.files || []).forEach((file, i) => {
      entries.push(
        <div key={`root-f-${i}`} className="file-tree-file">
          <span className="file-tree-file-icon">📄</span>
          <span className="file-tree-label" title={file.name}>{file.name}</span>
          <span className="file-tree-size">{(file.size / 1024).toFixed(1)} KB</span>
        </div>
      );
    });
    return entries.length ? entries : null;
  }

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
          {connected && helperCapabilities && (
            <span className={`capability-badge ${helperCapabilities.robotjs ? 'cap-ok' : 'cap-warn'}`}
              title={helperCapabilities.robotjs
                ? 'Remote mouse/keyboard control is available'
                : helperCapabilities.platform === 'darwin'
                  ? 'Remote control disabled — ask user to grant Accessibility permission in System Settings → Privacy & Security → Accessibility'
                  : 'Remote control disabled — robotjs not available on helper'
              }
            >
              {helperCapabilities.robotjs ? '🖱 Control: ON' : '🖱 Control: OFF'}
            </span>
          )}
        </div>
        <div className="session-controls">
          {connected && (
            <>
              <div className="monitor-switch">
                <label htmlFor="session-monitor">Monitor:</label>
                <select
                  id="session-monitor"
                  value={monitorIndex}
                  onChange={(e) => switchMonitor(Number(e.target.value))}
                  disabled={switchingMonitor}
                  title="Switch which display the user is sharing"
                >
                  {MONITOR_OPTIONS.map((n) => {
                    const value = n - 1;
                    const displayCount = helperCapabilities?.displayCount;
                    const isActive = displayCount == null || value < displayCount;
                    return (
                      <option key={n} value={value} disabled={!isActive}>
                        Monitor {n}{!isActive ? ' (not available)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="stream-quality-switch">
                <label htmlFor="session-stream-quality">Stream:</label>
                <select
                  id="session-stream-quality"
                  value={streamQuality}
                  onChange={(e) => {
                    const q = e.target.value;
                    setStreamQuality(q);
                    if (socket && sessionId) socket.emit('set-stream-quality', { sessionId, quality: q });
                  }}
                  title="Optimize for picture quality or for speed (lower bandwidth)"
                >
                  <option value="quality">Best quality</option>
                  <option value="balanced">Balanced</option>
                  <option value="speed">Optimize for speed</option>
                </select>
              </div>
              <label className="split-view-toggle">
                <input
                  type="checkbox"
                  checked={splitView}
                  onChange={(e) => setSplitView(e.target.checked)}
                  title="Split vertical screen: show top and bottom halves side by side"
                />
                <span>Split view</span>
              </label>
              <label className="split-view-toggle">
                <input
                  type="checkbox"
                  checked={isFullscreen}
                  onChange={handleFullscreenToggle}
                  title="Fullscreen viewer and open control panel"
                />
                <span>Fullscreen</span>
              </label>
            </>
          )}
          <button
            type="button"
            className="chat-header-btn"
            onClick={openChatPopup}
            title="Chat with user"
          >
            💬 Chat {chatUnread > 0 && <span className="chat-unread-badge">{chatUnread}</span>}
          </button>
          <button
            type="button"
            className={`files-header-btn ${filesOpen ? 'open' : ''}`}
            onClick={() => setFilesOpen(!filesOpen)}
            title="Send or download files"
          >
            📁 Files {filesOpen ? '▼' : '▶'}
          </button>
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

      {filesOpen && (
        <div className="files-modal-overlay" onClick={() => setFilesOpen(false)} role="dialog" aria-modal="true" aria-label="File transfer">
          <div className="files-modal" onClick={(e) => e.stopPropagation()}>
            <div className="files-modal-header">
              <h3 className="files-modal-title">File transfer</h3>
              <button type="button" className="files-modal-close" onClick={() => setFilesOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="files-modal-body two-panel">
              <div className="files-panel-left">
                <div className="files-panel-title">Your computer</div>
                <div className="files-toolbar">
                  <input ref={fileInputRef} type="file" multiple onChange={addFilesToSend} style={{ display: 'none' }} />
                  <input ref={folderInputRef} type="file" webkitDirectory multiple onChange={addFolderToSend} style={{ display: 'none' }} />
                  <button type="button" className="files-add-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>Add files</button>
                  <button type="button" className="files-add-btn" onClick={() => folderInputRef.current?.click()} disabled={uploading}>Add folder</button>
                  <button
                    type="button"
                    className="files-send-right-btn"
                    onClick={sendSelectedToRemote}
                    disabled={uploading || !filesToSend.length}
                    title="Send to remote computer"
                  >
                    {uploading ? 'Sending…' : 'Send to remote →'}
                  </button>
                </div>
                <div className="file-browser-tree">
                  {filesToSend.length === 0 ? (
                    <div className="files-empty">Add files or open a folder to browse</div>
                  ) : (
                    renderTree(buildFileTree(filesToSend))
                  )}
                </div>
              </div>
              <div className="files-panel-divider" />
              <div className="files-panel-right">
                <div className="files-panel-title">Remote computer</div>
                <div className="files-toolbar files-remote-toolbar">
                  <button type="button" className="files-up-btn" onClick={goRemoteUp} disabled={!remotePath} title="Up">↑ Up</button>
                  <button type="button" className="files-refresh-btn" onClick={() => setRemoteRefreshKey((k) => k + 1)} title="Refresh">Refresh</button>
                  <button
                    type="button"
                    className="files-receive-btn"
                    onClick={receiveSelectedFromRemote}
                    disabled={receiving || selectedRemotePaths.size === 0}
                    title="Download selected from remote"
                  >
                    {receiving ? 'Receiving…' : '← Receive'}
                  </button>
                </div>
                <div className="files-remote-path" title={remotePath || 'Home'}>{remotePath || 'Home'}</div>
                {remoteError && <div className="files-remote-error">{remoteError}</div>}
                <div className="file-browser-table-wrap">
                  {remoteLoading ? (
                    <div className="files-empty">Loading…</div>
                  ) : (
                    <table className="file-browser-table">
                      <thead>
                        <tr>
                          <th className="col-select" />
                          <th className="col-icon" />
                          <th className="col-name">Name</th>
                          <th className="col-size">Size</th>
                          <th className="col-date">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remoteEntries.map((e) => (
                          <tr
                            key={e.path}
                            className={e.isDirectory ? 'file-row-dir' : ''}
                            onDoubleClick={() => goRemoteInto(e)}
                          >
                            <td className="col-select">
                              {!e.isDirectory && (
                                <input
                                  type="checkbox"
                                  checked={selectedRemotePaths.has(e.path)}
                                  onChange={() => toggleRemoteSelection(e.path)}
                                  onClick={(ev) => ev.stopPropagation()}
                                />
                              )}
                            </td>
                            <td className="col-icon">
                              <span className="file-type-icon">{e.isDirectory ? '📁' : '📄'}</span>
                            </td>
                            <td className="col-name" title={e.name}>{e.name}</td>
                            <td className="col-size">{e.isDirectory ? '—' : `${(e.size / 1024).toFixed(1)} KB`}</td>
                            <td className="col-date">{e.mtime ? new Date(e.mtime).toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {!remoteLoading && remoteEntries.length === 0 && !remoteError && (
                    <div className="files-empty">No items. Use Up to go back or send files here.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`video-container ${splitView ? 'video-container-split' : ''}`} ref={splitContainerRef}>
        {splitView && remoteStream ? (
          <>
            <div
              ref={splitTopRef}
              className="split-view-half split-view-top"
              onClick={(e) => handleMouseEvent(e, 'top')}
              onMouseMove={(e) => handleMouseEvent(e, 'top')}
              onMouseDown={(e) => handleMouseEvent(e, 'top')}
              onMouseUp={(e) => handleMouseEvent(e, 'top')}
              onContextMenu={(e) => handleMouseEvent(e, 'top')}
              onKeyDown={handleKeyEvent}
              onKeyUp={handleKeyEvent}
              tabIndex={0}
              role="presentation"
            >
              <video
                ref={videoTopRef}
                autoPlay
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectViewBox: `inset(0% 0% ${(1 - splitRatio) * 100}% 0%)`
                }}
              />
            </div>
            <div
              className="split-divider"
              onMouseDown={(e) => { e.preventDefault(); setDraggingSplit(true); }}
              title={`Split: ${Math.round(splitRatio * 100)}% / ${Math.round((1 - splitRatio) * 100)}%`}
            >
              <div className="split-divider-handle" />
            </div>
            <div
              ref={splitBottomRef}
              className="split-view-half split-view-bottom"
              onClick={(e) => handleMouseEvent(e, 'bottom')}
              onMouseMove={(e) => handleMouseEvent(e, 'bottom')}
              onMouseDown={(e) => handleMouseEvent(e, 'bottom')}
              onMouseUp={(e) => handleMouseEvent(e, 'bottom')}
              onContextMenu={(e) => handleMouseEvent(e, 'bottom')}
              onKeyDown={handleKeyEvent}
              onKeyUp={handleKeyEvent}
              tabIndex={0}
              role="presentation"
            >
              <video
                ref={videoBottomRef}
                autoPlay
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectViewBox: `inset(${splitRatio * 100}% 0% 0% 0%)`
                }}
              />
            </div>
          </>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            onClick={(e) => handleMouseEvent(e)}
            onMouseMove={(e) => handleMouseEvent(e)}
            onMouseDown={(e) => handleMouseEvent(e)}
            onMouseUp={(e) => handleMouseEvent(e)}
            onContextMenu={(e) => handleMouseEvent(e)}
            onKeyDown={handleKeyEvent}
            onKeyUp={handleKeyEvent}
            tabIndex={0}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#000',
              cursor: connected ? 'crosshair' : 'default'
            }}
          />
        )}
        {!connected && (
          <div className="connecting-overlay">
            <div className="spinner"></div>
            <p>{status}</p>
          </div>
        )}
        {isFullscreen && (
          <div className="fullscreen-controls-bar" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="fullscreen-controls-btn"
              onClick={() => {
                const el = document.fullscreenElement;
                if (el?.classList?.contains('video-container')) el.exitFullscreen?.();
                setIsFullscreen(false);
              }}
              title="Exit fullscreen"
            >
              Exit fullscreen
            </button>
            <button
              type="button"
              className="fullscreen-controls-btn"
              onClick={() => openControlPanel()}
              title="Open control panel in a separate window"
            >
              Open controls
            </button>
            <button
              type="button"
              className="fullscreen-controls-btn fullscreen-controls-btn-danger"
              onClick={disconnect}
              title="Disconnect session"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionView;
