import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from '../api/axios';
import FileManager from '../components/FileManager';
import './SessionView.css';

const SOCKET_PATH = '/remote/socket.io';
const DEFAULT_MONITORS = []; // populated dynamically from helper
const QUALITY_PRESETS = ['speed', 'balanced', 'quality'];

/* ---------- SDP bitrate booster (match helper: 16 Mbps) ---------- */
function boostSdpBitrate(sdp) {
    const lines = sdp.split('\r\n');
    const out = [];
    let inVideo = false;
    for (const line of lines) {
        if (line.startsWith('m=video')) { inVideo = true; out.push(line); continue; }
        if (line.startsWith('m=') && !line.startsWith('m=video')) inVideo = false;
        // Remove existing b=AS for video — we insert our own
        if (inVideo && line.startsWith('b=AS:')) continue;
        out.push(line);
        // After c= in video section, insert bitrate
        if (inVideo && line.startsWith('c=')) {
            out.push('b=AS:16000');
        }
        // Append google bitrate hints to fmtp lines for faster ramp-up
        if (inVideo && line.startsWith('a=fmtp:') && !line.includes('x-google-min-bitrate')) {
            out[out.length - 1] = line + ';x-google-min-bitrate=4000;x-google-start-bitrate=16000;x-google-max-bitrate=16000';
        }
    }
    return out.join('\r\n');
}

/* ---------- Timestamp helper ---------- */
function ts() { return new Date().toLocaleTimeString(); }

/* ---------- SessionView component ---------- */
export default function SessionView({ user }) {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const controlChannel = useRef(null);
    const filesChannel = useRef(null);
    const pcRef = useRef(null);
    const socketRef = useRef(null);
    const chatEndRef = useRef(null);
    const splitVideoRef = useRef(null);

    // Connection state
    const [connected, setConnected] = useState(false);
    const [helperOnline, setHelperOnline] = useState(false);
    const [peerConnected, setPeerConnected] = useState(false);
    const [iceState, setIceState] = useState('new');
    const [dcState, setDcState] = useState('closed');

    // Video / control
    const [isControlEnabled, setControlEnabled] = useState(true);
    const [helperCanControl, setHelperCanControl] = useState(true);
    const [isSplitView, setSplitView] = useState(false);
    const [selectedMonitor, setMonitor] = useState(0);
    const [monitors, setMonitors] = useState(DEFAULT_MONITORS);
    const [viewing, setViewing] = useState(true);
    const [vncFallback, setVncFallback] = useState(false);
    const [quality, setQuality] = useState('balanced');

    // Chat
    const [chatOpen, setChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChat] = useState([]);
    const [unread, setUnread] = useState(0);

    // File transfer
    const [sendProgress, setSendProgress] = useState(null);
    const [recvProgress, setRecvProgress] = useState(null);
    const [showFileManager, setShowFileManager] = useState(false);

    // Case report
    const [caseOpen, setCaseOpen] = useState(false);
    const [sessionNotes, setNotes] = useState('');
    const [phoneMinutes, setPhoneMin] = useState(0);
    const [whatsappMinutes, setWhatsappMin] = useState(0);
    const [openCase, setOpenCase] = useState(null);
    const [remoteViewingSeconds, setViewingSec] = useState(0);

    // Misc
    const [zoom, setZoom] = useState(1);
    const [panOffset, setPan] = useState({ x: 0, y: 0 });
    const [sessionInfo, setInfo] = useState(null);
    const [errorMsg, setError] = useState(null);
    const [leaving, setLeaving] = useState(false);
    const [showControlsHelp, setShowControlsHelp] = useState(false);

    // Timer for viewing seconds
    const viewingTimerRef = useRef(null);

    // Mouse throttle ref (RustDesk pattern: cap at ~60fps = 16ms)
    const lastMouseSendRef = useRef(0);

    /* ---------- Socket.io setup ---------- */
    useEffect(() => {
        const socket = io(window.location.origin, {
            path: SOCKET_PATH,
            query: { sessionId, role: 'technician' },
        });
        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => { setConnected(false); setPeerConnected(false); });

        socket.on('helper-status', (data) => {
            setHelperOnline(data?.online ?? false);
            if (data?.monitors) setMonitors(data.monitors);
        });

        socket.on('session-info', (data) => setInfo(data));
        socket.on('session-ended', () => {
            setError('The support session has ended.');
            setPeerConnected(false);
        });
        socket.on('vnc-ready', () => {
            setVncFallback(true);
            setPeerConnected(false);
        });

        // Helper joined after us — update status
        socket.on('peer-joined', (data) => {
            if (data?.role === 'helper') setHelperOnline(true);
        });
        socket.on('peer-disconnected', (data) => {
            if (data?.role === 'helper') {
                setHelperOnline(false);
                setPeerConnected(false);
            }
        });

        // Helper capabilities (includes monitor info)
        socket.on('helper-capabilities', (data) => {
            if (typeof data?.capabilities?.robotjs === 'boolean') {
                setHelperCanControl(data.capabilities.robotjs);
                if (!data.capabilities.robotjs) {
                    setControlEnabled(false);
                }
            }
            if (data?.displays && data.displays.length > 0) {
                setMonitors(data.displays.map((d, i) => ({
                    index: i,
                    label: d.label || `Display ${i + 1}`,
                    width: d.width || 0,
                    height: d.height || 0,
                    primary: !!d.primary,
                })));
            }
        });

        // Chat from helper
        socket.on('chat-message', (msg) => {
            setChat(prev => [...prev, { from: 'helper', text: msg.text || msg.message, time: ts() }]);
            if (!chatOpen) setUnread(u => u + 1);
        });

        // File transfer: helper/user uploads are announced via backend `file-available`
        socket.on('file-available', (data) => {
            const direction = data?.direction || 'technician-to-user';
            if (direction !== 'user-to-technician') return;
            const fileId = data?.id;
            const fileName = data?.original_name || data?.originalName || 'download';
            if (!fileId) return;
            setRecvProgress({ name: fileName, percent: 100 });
            const a = document.createElement('a');
            a.href = `/remote/api/files/download/${encodeURIComponent(fileId)}`;
            a.download = fileName;
            a.click();
            setTimeout(() => setRecvProgress(null), 1200);
        });

        // WebRTC signalling (event names must match websocketHandler.js)
        socket.on('webrtc-offer', async (data) => {
            try {
                await handleIncomingOffer(data.offer, data.candidates || []);
            } catch (err) {
                console.error('Error handling offer:', err);
            }
        });
        socket.on('webrtc-ice-candidate', (data) => {
            if (pcRef.current && data.candidate) {
                pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => { });
            }
        });
        socket.on('webrtc-answer', async (data) => {
            if (pcRef.current && data.answer) {
                try {
                    await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                } catch (err) {
                    console.error('Error setting answer:', err);
                }
            }
        });

        // VNC fallback
        socket.on('vnc-frame', (data) => {
            if (canvasRef.current && data.image) {
                const img = new Image();
                img.onload = () => {
                    const ctx = canvasRef.current.getContext('2d');
                    canvasRef.current.width = img.width;
                    canvasRef.current.height = img.height;
                    ctx.drawImage(img, 0, 0);
                };
                img.src = 'data:image/jpeg;base64,' + data.image;
            }
        });

        // Tell server we joined (must match websocketHandler's 'join-session' event)
        socket.emit('join-session', { sessionId, role: 'technician', technicianName: user?.username });

        return () => { socket.disconnect(); };
    }, [sessionId, user?.username]);

    /* ---------- WebRTC offer handler ---------- */
    const handleIncomingOffer = async (offer, pendingCandidates = []) => {
        closePeer();

        let iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ];

        try {
            const res = await axios.get('/api/turn-servers');
            if (res.data && Array.isArray(res.data.servers)) {
                iceServers = res.data.servers;
            }
        } catch (e) {
            // Fallback to STUN
        }

        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        pc.oniceconnectionstatechange = () => {
            setIceState(pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                setPeerConnected(true);
            }
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                setPeerConnected(false);
            }
        };

        pc.onicecandidate = (e) => {
            if (e.candidate && socketRef.current) {
                socketRef.current.emit('webrtc-ice-candidate', {
                    sessionId,
                    candidate: e.candidate,
                    role: 'technician',
                });
            }
        };

        // Receive video track
        pc.ontrack = (e) => {
            if (videoRef.current && e.streams[0]) {
                videoRef.current.srcObject = e.streams[0];
                setVncFallback(false);
            }
        };

        // Receive DataChannels from helper
        pc.ondatachannel = (e) => {
            const ch = e.channel;
            if (ch.label === 'files') {
                filesChannel.current = ch;
                ch.binaryType = 'arraybuffer';
                ch.onopen = () => console.log('Files channel open');
                return;
            }
            // Control channel
            ch.binaryType = 'arraybuffer';
            ch.onopen = () => { controlChannel.current = ch; setDcState('open'); };
            ch.onclose = () => {
                if (controlChannel.current === ch) {
                    controlChannel.current = null;
                    setDcState('closed');
                }
            };
            ch.onmessage = (msg) => {
                try {
                    const data = JSON.parse(msg.data);
                    if (data.kind === 'chat') {
                        setChat(prev => [...prev, { from: 'helper', text: data.text, time: ts() }]);
                        if (!chatOpen) setUnread(u => u + 1);
                    }
                } catch { /* binary or unknown */ }
            };
        };

        // Set remote description (boost bitrate to match helper's 16 Mbps)
        let boosted = offer;
        if (offer.sdp) boosted = { ...offer, sdp: boostSdpBitrate(offer.sdp) };
        await pc.setRemoteDescription(new RTCSessionDescription(boosted));

        // Add pending candidates
        for (const c of pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => { });
        }

        // Create answer
        const answer = await pc.createAnswer();
        if (answer.sdp) answer.sdp = boostSdpBitrate(answer.sdp);
        await pc.setLocalDescription(answer);

        socketRef.current?.emit('webrtc-answer', { sessionId, answer });
    };

    /* ---------- Close peer ---------- */
    const closePeer = () => {
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        controlChannel.current = null;
        filesChannel.current = null;
        setPeerConnected(false);
        setDcState('closed');
        setIceState('new');
    };

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || !sessionId) return;
        const technicianId = user?.id || user?.username;
        socket.emit('viewer-state', {
            sessionId,
            viewing: !!(peerConnected && viewing),
            technicianId
        });
        return () => {
            socket.emit('viewer-state', {
                sessionId,
                viewing: false,
                technicianId
            });
        };
    }, [sessionId, peerConnected, viewing, user?.id, user?.username]);

    /* ---------- Viewing timer ---------- */
    useEffect(() => {
        if (peerConnected && viewing) {
            viewingTimerRef.current = setInterval(() => setViewingSec(s => s + 1), 1000);
        } else {
            clearInterval(viewingTimerRef.current);
        }
        return () => clearInterval(viewingTimerRef.current);
    }, [peerConnected, viewing]);

    /* ---------- Binary Encoding Helper ---------- */
    const encodeBinaryMouse = (data) => {
        const x = Math.max(0, Math.min(65535, Math.round(data.x * 65535)));
        const y = Math.max(0, Math.min(65535, Math.round(data.y * 65535)));

        const dv = new DataView(new ArrayBuffer(data.type === 'scroll' ? 9 : (data.type === 'move' ? 5 : 6)));

        if (data.type === 'move') {
            dv.setUint8(0, 0x01);
            dv.setUint16(1, x, true);
            dv.setUint16(3, y, true);
        } else if (data.type === 'down' || data.type === 'up') {
            dv.setUint8(0, data.type === 'down' ? 0x02 : 0x03);
            dv.setUint16(1, x, true);
            dv.setUint16(3, y, true);
            dv.setUint8(5, data.button || 0);
        } else if (data.type === 'scroll') {
            dv.setUint8(0, 0x04);
            dv.setUint16(1, x, true);
            dv.setUint16(3, y, true);
            dv.setInt16(5, data.deltaX || 0, true);
            dv.setInt16(7, data.deltaY || 0, true);
        }
        return dv.buffer;
    };

    /* ---------- Input helpers ---------- */
    const sendInput = useCallback((data) => {
        const ch = controlChannel.current;
        if (ch && ch.readyState === 'open') {
            if (data.kind === 'mouse') {
                ch.send(encodeBinaryMouse(data));
            } else {
                ch.send(JSON.stringify(data));
            }
        } else if (socketRef.current) {
            if (data.kind === 'mouse') {
                const type =
                    data.type === 'move' ? 'mousemove' :
                    data.type === 'down' ? 'mousedown' :
                    data.type === 'up' ? 'mouseup' :
                    data.type;
                socketRef.current.emit('remote-mouse', { ...data, type });
            }
            if (data.kind === 'keyboard') {
                const type = data.type === 'down' ? 'keydown' : data.type === 'up' ? 'keyup' : data.type;
                socketRef.current.emit('remote-keyboard', { ...data, type });
            }
        }
    }, []);

    const getVideoCoords = useCallback((e) => {
        const vid = videoRef.current;
        if (!vid) return null;
        const rect = vid.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        return {
            x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
        };
    }, []);

    /* ---------- Mouse handlers (with 16ms throttle for move) ---------- */
    const handleMouseMove = useCallback((e) => {
        if (!isControlEnabled) return;
        // Throttle: max ~60 events/sec (RustDesk-inspired — reduces wire traffic and input lag)
        const now = performance.now();
        if (now - lastMouseSendRef.current < 16) return;
        lastMouseSendRef.current = now;
        const coords = getVideoCoords(e);
        if (!coords) return;
        sendInput({ kind: 'mouse', type: 'move', ...coords });
    }, [isControlEnabled, getVideoCoords, sendInput]);

    const handleMouseDown = useCallback((e) => {
        if (!isControlEnabled) return;
        const coords = getVideoCoords(e);
        if (!coords) return;
        sendInput({ kind: 'mouse', type: 'down', button: e.button, ...coords });
    }, [isControlEnabled, getVideoCoords, sendInput]);

    const handleMouseUp = useCallback((e) => {
        if (!isControlEnabled) return;
        const coords = getVideoCoords(e);
        if (!coords) return;
        sendInput({ kind: 'mouse', type: 'up', button: e.button, ...coords });
    }, [isControlEnabled, getVideoCoords, sendInput]);

    const handleWheel = useCallback((e) => {
        if (!isControlEnabled) return;
        e.preventDefault();
        const coords = getVideoCoords(e);
        if (!coords) return;
        sendInput({ kind: 'mouse', type: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY, ...coords });
    }, [isControlEnabled, getVideoCoords, sendInput]);

    const handleDoubleClick = useCallback((e) => {
        if (!isControlEnabled) return;
        const coords = getVideoCoords(e);
        if (!coords) return;
        sendInput({ kind: 'mouse', type: 'dblclick', button: e.button, ...coords });
    }, [isControlEnabled, getVideoCoords, sendInput]);

    /* ---------- Keyboard handlers ---------- */
    const handleKeyDown = useCallback((e) => {
        if (!isControlEnabled) return;
        e.preventDefault();
        sendInput({
            kind: 'keyboard', type: 'down', key: e.key, code: e.code, keyCode: e.keyCode,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey
        });
    }, [isControlEnabled, sendInput]);

    const handleKeyUp = useCallback((e) => {
        if (!isControlEnabled) return;
        e.preventDefault();
        sendInput({
            kind: 'keyboard', type: 'up', key: e.key, code: e.code, keyCode: e.keyCode,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey
        });
    }, [isControlEnabled, sendInput]);

    /* ---------- Context menu block ---------- */
    const blockCtx = useCallback((e) => { if (isControlEnabled) e.preventDefault(); }, [isControlEnabled]);

    /* ---------- Monitor switch ---------- */
    const switchMonitor = useCallback((monIdx) => {
        setMonitor(monIdx);
        // Helper expects monitorIndex (0-based)
        socketRef.current?.emit('switch-monitor', { sessionId, monitorIndex: monIdx });
    }, [sessionId]);

    /* ---------- Quality switch ---------- */
    const switchQuality = useCallback((preset) => {
        setQuality(preset);
        socketRef.current?.emit('set-stream-quality', { sessionId, quality: preset });
    }, [sessionId]);

    /* ---------- Chat ---------- */
    const sendChat = useCallback(() => {
        const text = chatInput.trim();
        if (!text) return;
        setChat(prev => [...prev, { from: 'technician', text, time: ts() }]);
        setChatInput('');
        const ch = controlChannel.current;
        if (ch && ch.readyState === 'open') {
            ch.send(JSON.stringify({ kind: 'chat', text }));
        } else {
            socketRef.current?.emit('chat-message', { sessionId, text });
        }
    }, [chatInput, sessionId]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
    useEffect(() => { if (chatOpen) setUnread(0); }, [chatOpen]);

    /* ---------- File send ---------- */
    const handleFileSend = useCallback(async (file) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);
        formData.append('direction', 'technician-to-user');
        setSendProgress({ name: file.name, percent: 0 });
        try {
            await axios.post('/api/files/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (evt) => {
                    const total = evt.total || file.size || 1;
                    const loaded = evt.loaded || 0;
                    setSendProgress({ name: file.name, percent: Math.round((loaded / total) * 100) });
                }
            });
            setSendProgress({ name: file.name, percent: 100 });
            setTimeout(() => setSendProgress(null), 800);
        } catch (err) {
            console.error('Error uploading file:', err);
            setSendProgress(null);
        }
    }, [sessionId]);

    /* ---------- Case report ---------- */
    const loadCase = useCallback(async () => {
        try {
            const res = await axios.get('/api/cases', { params: { q: sessionId, limit: 50 } });
            const list = Array.isArray(res.data?.cases) ? res.data.cases : [];
            const c = list.find(row => (row.session_id || row.sessionId) === sessionId);
            if (!c) {
                setOpenCase(null);
                return;
            }
            setOpenCase(c);
            setNotes(c.problem_description || '');
            setPhoneMin(c.phone_support_minutes || 0);
            setWhatsappMin(c.whatsapp_support_minutes || 0);
        } catch { /* no case yet */ }
    }, [sessionId]);

    useEffect(() => { loadCase(); }, [loadCase]);

    const saveCase = useCallback(async () => {
        try {
            await axios.post(`/api/sessions/${sessionId}/case`, {
                notes: sessionNotes,
                phoneMinutes,
                whatsappMinutes,
                remoteViewingSeconds,
            });
            loadCase();
        } catch (err) {
            console.error('Error saving case:', err);
        }
    }, [sessionId, sessionNotes, phoneMinutes, whatsappMinutes, remoteViewingSeconds, loadCase]);

    const closeCase = useCallback(async () => {
        try {
            await axios.post(`/api/sessions/${sessionId}/case/close`, {
                notes: sessionNotes,
                phoneMinutes,
                whatsappMinutes,
                remoteViewingSeconds,
            });
            loadCase();
        } catch (err) {
            console.error('Error closing case:', err);
        }
    }, [sessionId, sessionNotes, phoneMinutes, whatsappMinutes, remoteViewingSeconds, loadCase]);

    /* ---------- Leave session ---------- */
    const leaveSession = useCallback(async () => {
        setLeaving(true);
        closePeer();
        if (socketRef.current) {
            socketRef.current.emit('leave-session', { sessionId });
            socketRef.current.disconnect();
        }
        navigate('/dashboard');
    }, [sessionId, navigate]);

    /* ---------- Format time ---------- */
    const formatTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    /* ---------- Render ---------- */
    return (
        <div className="session-view" tabIndex={0} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}>
            {/* Toolbar */}
            <div className="session-toolbar">
                <div className="toolbar-left">
                    <button className="toolbar-btn back-btn" onClick={leaveSession} disabled={leaving}>
                        ← Back
                    </button>
                    <span className="session-id-label" title={sessionId}>
                        {sessionId?.slice(0, 8)}…
                    </span>
                    <span className={`status-dot ${peerConnected ? 'online' : connected ? 'partial' : 'offline'}`} />
                    <span className="status-text">
                        {peerConnected
                            ? `P2P (${iceState})`
                            : connected
                                ? `Socket (helper: ${helperOnline ? 'on' : 'off'})`
                                : 'Disconnected'}
                    </span>
                    {dcState === 'open' && (
                        <span className="dc-badge" title="DataChannel open">DC</span>
                    )}
                </div>

                <div className="toolbar-center">
                    {/* Monitor selector */}
                    {monitors.length > 0 && (
                        <div className="monitor-selector">
                            {monitors.map((m) => (
                                <button
                                    key={m.index}
                                    className={`monitor-btn ${selectedMonitor === m.index ? 'active' : ''}`}
                                    onClick={() => switchMonitor(m.index)}
                                    title={`${m.label}${m.width ? ` (${m.width}x${m.height})` : ''}`}
                                >
                                    <span className="monitor-num">{m.index + 1}</span>
                                    <span className="monitor-desc">
                                        {m.primary ? 'Primary' : m.label.replace(/^Display\s*/i, '').replace(/^Screen\s*/i, 'Scr ') || `#${m.index + 1}`}
                                        {m.width ? ` ${m.width}x${m.height}` : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Quality selector */}
                    {peerConnected && (
                        <div className="quality-selector">
                            {QUALITY_PRESETS.map(q => (
                                <button
                                    key={q}
                                    className={`quality-btn ${quality === q ? 'active' : ''}`}
                                    onClick={() => switchQuality(q)}
                                    title={q === 'speed' ? 'Lower quality, less lag' : q === 'quality' ? 'Best quality, 60fps' : 'Balanced'}
                                >
                                    {q === 'speed' ? 'Fast' : q === 'quality' ? 'HD' : 'Bal'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="toolbar-right">
                    <span className="timer" title="Remote viewing time">{formatTime(remoteViewingSeconds)}</span>

                    <button
                        className={`toolbar-btn ${isControlEnabled ? 'active' : ''}`}
                        onClick={() => {
                            if (!helperCanControl) return;
                            setControlEnabled(c => !c);
                        }}
                        disabled={!helperCanControl}
                        title={
                            !helperCanControl
                                ? 'Control unavailable on helper (view-only mode)'
                                : (isControlEnabled ? 'Disable control' : 'Enable control')
                        }
                    >
                        <span className="tb-icon">{isControlEnabled ? '\uD83D\uDDB1' : '\uD83D\uDC41'}</span>
                        <span className="tb-label">{isControlEnabled ? 'Control On' : 'Control Off'}</span>
                    </button>
                    {!helperCanControl && (
                        <span className="control-inline-status control-inline-status-warn">
                            View-only: helper control unavailable
                        </span>
                    )}
                    {helperCanControl && !isControlEnabled && (
                        <span className="control-inline-status">
                            View-only: control is disabled
                        </span>
                    )}

                    <button
                        className={`toolbar-btn ${isSplitView ? 'active' : ''}`}
                        onClick={() => setSplitView(s => !s)}
                        title="Split view"
                    >
                        <span className="tb-icon">{'\u2B1B'}</span>
                        <span className="tb-label">Split</span>
                    </button>

                    <button
                        className={`toolbar-btn ${chatOpen ? 'active' : ''}`}
                        onClick={() => setChatOpen(o => !o)}
                        title="Chat"
                    >
                        <span className="tb-icon">{'\uD83D\uDCAC'}{unread > 0 && <span className="chat-badge">{unread}</span>}</span>
                        <span className="tb-label">Chat</span>
                    </button>

                    <button
                        className={`toolbar-btn ${caseOpen ? 'active' : ''}`}
                        onClick={() => setCaseOpen(o => !o)}
                        title="Case report"
                    >
                        <span className="tb-icon">{'\uD83D\uDCCB'}</span>
                        <span className="tb-label">Report</span>
                    </button>

                    <label className="toolbar-btn file-upload-label" title="Send file">
                        <span className="tb-icon">{'\uD83D\uDCCE'}</span>
                        <span className="tb-label">Send</span>
                        <input
                            type="file"
                            hidden
                            onChange={e => { if (e.target.files?.[0]) handleFileSend(e.target.files[0]); e.target.value = ''; }}
                        />
                    </label>

                    <button
                        className={`toolbar-btn ${showFileManager ? 'active' : ''}`}
                        onClick={() => setShowFileManager(s => !s)}
                        title="File Manager"
                    >
                        <span className="tb-icon">{'\uD83D\uDCC2'}</span>
                        <span className="tb-label">Files</span>
                    </button>

                    <button
                        className={`toolbar-btn ${showControlsHelp ? 'active' : ''}`}
                        onClick={() => setShowControlsHelp(v => !v)}
                        title="Show button guide"
                    >
                        <span className="tb-icon">?</span>
                        <span className="tb-label">Help</span>
                    </button>
                </div>
            </div>

            {showControlsHelp && (
                <div className="button-help-panel">
                    <span><strong>Control On/Off:</strong> Enable or disable remote mouse and keyboard input.</span>
                    <span><strong>Split:</strong> Show a second monitor pane and switch monitors quickly.</span>
                    <span><strong>Chat:</strong> Open session chat with the helper user.</span>
                    <span><strong>Report:</strong> Open case report notes and billing fields.</span>
                    <span><strong>Send:</strong> Upload a file to the helper machine.</span>
                    <span><strong>Files:</strong> Open remote file manager (P2P channel).</span>
                    <span><strong>Fast/Bal/HD:</strong> Stream quality presets (latency vs image quality).</span>
                    {!helperCanControl && (
                        <span className="button-help-warning">
                            Helper reported control capability is unavailable, so this session is view-only.
                        </span>
                    )}
                </div>
            )}

            {/* Error banner */}
            {errorMsg && (
                <div className="session-error-banner">
                    {errorMsg}
                    <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
                </div>
            )}

            {/* Main area */}
            <div className={`session-main ${isSplitView ? 'split' : ''}`}>
                {/* Video */}
                <div
                    className="video-container"
                    style={{
                        transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                    }}
                >
                    {vncFallback ? (
                        <canvas
                            ref={canvasRef}
                            className={`remote-canvas ${isControlEnabled && helperCanControl ? '' : 'control-disabled'}`}
                            onMouseMove={handleMouseMove}
                            onMouseDown={handleMouseDown}
                            onMouseUp={handleMouseUp}
                            onWheel={handleWheel}
                            onDoubleClick={handleDoubleClick}
                            onContextMenu={blockCtx}
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            className={`remote-video ${isControlEnabled && helperCanControl ? '' : 'control-disabled'}`}
                            autoPlay
                            playsInline
                            onMouseMove={handleMouseMove}
                            onMouseDown={handleMouseDown}
                            onMouseUp={handleMouseUp}
                            onWheel={handleWheel}
                            onDoubleClick={handleDoubleClick}
                            onContextMenu={blockCtx}
                        />
                    )}

                    {!peerConnected && !vncFallback && (
                        <div className="video-overlay">
                            <div className="spinner" />
                            <p>
                                {connected
                                    ? helperOnline
                                        ? 'Establishing peer connection...'
                                        : 'Waiting for helper to connect...'
                                    : 'Connecting to server...'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Split view: second monitor */}
                {isSplitView && monitors.length > 1 && (
                    <div className="video-container split-secondary">
                        <div className="split-label">
                            Monitor {monitors.find(m => m.index !== selectedMonitor)?.index + 1 || 2}
                            {' \u2013 '}click to switch
                        </div>
                        <video
                            ref={splitVideoRef}
                            className="remote-video"
                            autoPlay
                            playsInline
                            onClick={() => {
                                const other = monitors.find(m => m.index !== selectedMonitor);
                                if (other) switchMonitor(other.index);
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Chat panel */}
            {chatOpen && (
                <div className="chat-panel">
                    <div className="chat-header">
                        <span>Chat</span>
                        <button onClick={() => setChatOpen(false)}>{'\u00D7'}</button>
                    </div>
                    <div className="chat-messages">
                        {chatMessages.map((msg, i) => (
                            <div key={i} className={`chat-msg ${msg.from}`}>
                                <span className="chat-sender">{msg.from === 'technician' ? 'You' : 'Helper'}</span>
                                <span className="chat-text">{msg.text}</span>
                                <span className="chat-time">{msg.time}</span>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <div className="chat-input-row">
                        <input
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); sendChat(); } }}
                            placeholder="Type a message..."
                        />
                        <button onClick={sendChat}>Send</button>
                    </div>
                </div>
            )}

            {/* Case report panel */}
            {caseOpen && (
                <div className="case-panel">
                    <div className="case-header">
                        <span>Case Report</span>
                        <button onClick={() => setCaseOpen(false)}>{'\u00D7'}</button>
                    </div>
                    <div className="case-body">
                        <div className="case-field">
                            <label>Remote Viewing Time</label>
                            <span className="mono">{formatTime(remoteViewingSeconds)}</span>
                        </div>
                        <div className="case-field">
                            <label>Phone Support (min)</label>
                            <input
                                type="number"
                                min={0}
                                value={phoneMinutes}
                                onChange={e => setPhoneMin(Number(e.target.value))}
                            />
                        </div>
                        <div className="case-field">
                            <label>WhatsApp Support (min)</label>
                            <input
                                type="number"
                                min={0}
                                value={whatsappMinutes}
                                onChange={e => setWhatsappMin(Number(e.target.value))}
                            />
                        </div>
                        <div className="case-field">
                            <label>Notes</label>
                            <textarea
                                rows={4}
                                value={sessionNotes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Session notes..."
                            />
                        </div>
                        {openCase && (
                            <div className="case-info">
                                <small>Case #{openCase.case_number || openCase.id} — {openCase.status}</small>
                            </div>
                        )}
                        <div className="case-actions">
                            <button className="btn-sm btn-primary" onClick={saveCase}>Save</button>
                            <button className="btn-sm btn-secondary" onClick={closeCase}>Close Case</button>
                        </div>
                    </div>
                </div>
            )}

            {/* File transfer progress */}
            {sendProgress && (
                <div className="file-progress sending">
                    Sending {sendProgress.name}: {Math.round(sendProgress.percent)}%
                    <div className="progress-bar" style={{ width: `${sendProgress.percent}%` }} />
                </div>
            )}
            {recvProgress && (
                <div className="file-progress receiving">
                    Receiving {recvProgress.name}: {Math.round(recvProgress.percent)}%
                    <div className="progress-bar" style={{ width: `${recvProgress.percent}%` }} />
                </div>
            )}

            {/* Zoom controls */}
            <div className="zoom-controls">
                <button onClick={() => setZoom(z => Math.min(z + 0.25, 4))}>+</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>{'\u2013'}</button>
                <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{'\u21BB'}</button>
            </div>
            {showFileManager && (
                <FileManager
                    channel={filesChannel.current}
                    onClose={() => setShowFileManager(false)}
                />
            )}
        </div>
    );
}
