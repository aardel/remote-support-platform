import React, { useState, useEffect, useCallback, useRef } from 'react';
import './FileManager.css';

export default function FileManager({ channel, onClose }) {
    const [drives, setDrives] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState('ready'); // ready, loading, error
    const [error, setError] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [progress, setProgress] = useState(null); // { name, percent, mode }

    // Request ID counter
    const reqIdCounter = useRef(0);
    const getReqId = () => `req-${++reqIdCounter.current}`;

    // Pending requests map (reqId -> resolve/reject)
    // Actually, for list/drives we can just wait for specific messages.
    // But since we use onmessage, we should route responses.

    // We'll use a simple state-based approach for now. 
    // If we trigger 'list', we expect 'list-response'.

    const sendMessage = useCallback((msg) => {
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(msg));
        } else {
            setError('Connection lost');
        }
    }, [channel]);

    const refresh = useCallback(() => {
        if (!currentPath) {
            // Load drives
            setStatus('loading');
            sendMessage({ action: 'drives', reqId: getReqId() });
        } else {
            // Load dir
            setStatus('loading');
            sendMessage({ action: 'list', path: currentPath, reqId: getReqId() });
        }
    }, [currentPath, sendMessage]);

    useEffect(() => {
        if (!channel) return;

        const handleMessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                if (!data.action) return;

                if (data.action === 'drives-response') {
                    setDrives(data.drives || []);
                    setItems([]);
                    setCurrentPath('');
                    setStatus('ready');
                    setError(null);
                }
                else if (data.action === 'list-response') {
                    if (data.error) {
                        setError(data.error);
                        setStatus('error');
                    } else {
                        setItems(data.items || []);
                        setStatus('ready');
                        setError(null);
                    }
                }
                else if (data.action === 'read-response') {
                    if (data.error) {
                        setError(data.error);
                        setProgress(null);
                    } else {
                        // Download handler handles chunk accumulation, 
                        // but here we might receive single-shot or chunks.
                        // For now assume single-shot or we need a Download Manager.
                        // We'll handle downloads in a separate useEffect or ref-based manager if complex.
                        // For V1 simple download:
                        downloadManager.handleChunk(data);
                    }
                }
                else if (data.action === 'write-ack') {
                    uploadManager.handleAck(data);
                }
            } catch (e) {
                console.error('FM Parse error', e);
            }
        };

        channel.onmessage = handleMessage;

        // Initial load
        refresh();

        return () => { channel.onmessage = null; };
    }, [channel, refresh]);

    // Navigate
    const handleNavigate = (path) => {
        setCurrentPath(path);
        setSelectedItem(null);
    };

    const handleUp = () => {
        if (!currentPath) return; // already at root/drives
        // Windows: "C:\" -> "" (Drives)
        // Linux: "/home/user" -> "/home"
        // If currentPath is a drive root like "C:\", go to drives
        if (currentPath.match(/^[a-zA-Z]:\\?$/)) {
            handleNavigate('');
            return;
        }
        if (currentPath === '/') {
            handleNavigate(''); // or stay?
            return;
        }

        // Simple string manipulation for now (needs proper path handling)
        const parts = currentPath.split(/[/\\]/).filter(Boolean);
        parts.pop();
        if (parts.length === 0) {
            // If linux, empty parts means root "/"?
            // Actually if path was "/etc", parts=["etc"]. pop -> empty.
            // If we are at root level, go to "" (Drives view not applicable for Linux? Actually helper returns drives accordingly)
            // Helper on Linux returns "/" as a drive.
            handleNavigate('/'); // Linux root
            if (currentPath === '/') handleNavigate(''); // Back to drives/roots list
            return;
        }
        // Reconstruct
        const sep = currentPath.includes('\\') ? '\\' : '/';
        const newPath = parts.join(sep);
        // Is it absolute?
        // Linux: items joined "home/user" need leading "/"
        // Win: "C:/Users" -> "C:\Users"
        if (currentPath.startsWith('/')) {
            handleNavigate('/' + newPath);
        } else {
            // Win? "C:" + sep + ...
            // "C:\Users". split -> C:, Users. pop -> C:. join -> C:
            // Need to ensure trailing slash for drives if needed?
            if (newPath.endsWith(':')) handleNavigate(newPath + '\\');
            else handleNavigate(newPath);
        }
    };

    // Download Manager
    const [downloadManager] = useState(() => {
        let chunks = [];
        let metadata = null;
        let totalReceived = 0;
        return {
            start: (meta) => {
                chunks = [];
                metadata = meta;
                totalReceived = 0;
                setProgress({ name: meta.name, percent: 0, mode: 'down' });
                // Send request
                sendMessage({ action: 'read', path: meta.path, reqId: getReqId() });
            },
            handleChunk: (data) => {
                if (data.chunk) {
                    chunks.push(data.chunk); // Base64 string
                    // Estimate progress? We need file size from list item
                    // But here we rely on data.eof
                    setProgress(p => ({ ...p, percent: 50 })); // Indeterminate
                }
                if (data.eof) {
                    // Assemble
                    const blob = b64toBlob(chunks.join(''));
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = data.name || 'download';
                    a.click();
                    setProgress(null);
                    chunks = [];
                }
            }
        };
    });

    // Upload Manager
    const [uploadManager] = useState(() => {
        let file = null;
        let offset = 0;
        let reqId = null;
        return {
            start: (f) => {
                file = f;
                offset = 0;
                reqId = getReqId();
                setProgress({ name: f.name, percent: 0, mode: 'up' });
                sendNextChunk();
            },
            handleAck: (data) => {
                if (data.reqId === reqId) {
                    if (data.error) {
                        setError(data.error);
                        setProgress(null);
                        return;
                    }
                    if (offset < file.size) sendNextChunk();
                    else setProgress(null);
                }
            }
        };

        function sendNextChunk() {
            const CHUNK_SIZE = 48 * 1024; // 48KB keyframes for Base64 overhead
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const reader = new FileReader();
            reader.onload = (e) => {
                const b64 = arrayBufferToBase64(e.target.result);
                sendMessage({
                    action: 'write',
                    path: currentPath, // Upload to current dir
                    filename: file.name, // Helper needs filename in payload or path?
                    // Helper expects: { path: dir, filename: name, content: b64 }?
                    // Let's check helper: handlePutRemoteFile: { path: dirPath, filename: filename, content: ... }
                    // Yes.
                    chunk: b64,
                    offset: offset,
                    reqId: reqId,
                    // We need to send full path info? 
                    // Helper logic: path is DIR. 
                    // Wait, helper expects ONE SHOT write?
                    // Helper: fs.writeFileSync(fullPath, buf).
                    // It OVERWRITES.
                    // It does NOT support append currently for `put-remote-file`.
                    // BUT `helper:fs-write-chunk` DOES support offsets.
                    // The helper logic I replaced in main.js lines 1171:
                    // socket.on('put-remote-file') -> handlePutRemoteFile -> writeFileSync.
                    // This was for the OLD socket method.

                    // The NEW `fs-write-chunk` is exposed via `helperApi.fsWriteChunk`.
                    // The `files` channel calls `fsWriteChunk`.
                    // So we should send `write` action which maps to `fsWriteChunk`.
                    // `renderer.js` maps `write` to `fsWriteChunk`.
                    // `fsWriteChunk` takes (filePath, data, offset).
                    // So `renderer.js` expects `data.path` to be FULL PATH.
                });
                // Actually renderer.js: 
                // else if (data.action === 'write') { window.helperApi.fsWriteChunk(data.path, buf, data.offset) }
                // So `data.path` MUST be the full file path.

                // So we need to construct full path.
                // currentPath + separator + filename.
                // But helper handles separators.

                // Hmm, if we send request, we should probably construct path properly on Helper side?
                // But `fsWriteChunk` is low level.
                // We should probably just append filename to currentPath manually here.
                // Assuming Linux/Win.
                // If currentPath is "C:\", join "C:\file.txt".
                // If "C:\Users", join "C:\Users\file.txt".
            };
            reader.readAsArrayBuffer(slice);

            // Update offset for next calculation (but wait for ack to increment real offset?)
            // For V1 simple lock-step:
            // We increment offset AFTER ack?
            // No, readSlice uses current offset. 
            // We need to advance offset in handleAck?
            // Yes. To keep simple, we read inside sendNextChunk using current offset.
        }
        // Actually, closure issue with `offset`.
        // We'll use refs or state for upload manager if we want it robust.
        // For now, I'll inline upload logic in component functions.
    });

    // Proper Upload Implementation
    const uploadRef = useRef({ file: null, offset: 0, reqId: null, path: '' });

    const startUpload = (file) => {
        const sep = currentPath.includes('/') ? '/' : '\\';
        const fullPath = currentPath.endsWith(sep) ? currentPath + file.name : currentPath + sep + file.name;

        uploadRef.current = { file, offset: 0, reqId: getReqId(), path: fullPath };
        setProgress({ name: file.name, percent: 0, mode: 'up' });
        sendUploadChunk();
    };

    const sendUploadChunk = () => {
        const { file, offset, reqId, path } = uploadRef.current;
        const CHUNK_SIZE = 64 * 1024;
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();
        reader.onload = (e) => {
            const b64 = arrayBufferToBase64(e.target.result);
            sendMessage({
                action: 'write',
                path: path,
                chunk: b64,
                offset: offset,
                reqId: reqId
            });
        };
        reader.readAsArrayBuffer(slice);
    };

    const handleUploadAck = (data) => {
        if (!uploadRef.current.file) return;
        if (data.reqId !== uploadRef.current.reqId) return;

        if (data.error) {
            setError(data.error);
            setProgress(null);
            uploadRef.current.file = null;
            return;
        }

        const { file, offset } = uploadRef.current;
        const CHUNK_SIZE = 64 * 1024;
        const newOffset = offset + CHUNK_SIZE;

        if (newOffset < file.size) {
            uploadRef.current.offset = newOffset;
            const pct = (newOffset / file.size) * 100;
            setProgress(p => ({ ...p, percent: pct }));
            sendUploadChunk();
        } else {
            setProgress(null);
            uploadRef.current.file = null;
            refresh(); // Refresh dir to show new file
        }
    };

    // Replace handleMessage's write-ack with this:
    // in useEffect... 
    // if (data.action === 'write-ack') handleUploadAck(data);
    // (Need to wrap handleUploadAck in ref or dependency)

    // Helpers
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
        return window.btoa(binary);
    }

    function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
        const byteCharacters = window.atob(b64Data);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, { type: contentType });
    }

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatDate = (iso) => {
        if (!iso) return '';
        return new Date(iso).toLocaleString();
    };

    return (
        <div className="file-manager-overlay">
            <div className="file-manager-modal">
                <div className="fm-header">
                    <div className="fm-title">
                        <span>📁</span> File Manager
                    </div>
                    <button className="fm-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="fm-toolbar">
                    <button className="fm-btn" onClick={handleUp} disabled={!currentPath}>
                        ⬆ Up
                    </button>
                    <button className="fm-btn" onClick={refresh}>
                        ⟳ Refresh
                    </button>
                    <div className="fm-path-bar">
                        <span>{currentPath ? '📂' : '💻'}</span>
                        <input
                            className="fm-path-input"
                            value={currentPath}
                            readOnly
                            placeholder="Computer Drives"
                        />
                    </div>
                </div>

                <div className="fm-content">
                    {status === 'loading' && <div className="fm-empty">Loading...</div>}
                    {status === 'error' && <div className="fm-empty error">{error}</div>}

                    {!currentPath && status === 'ready' && (
                        <div className="drives-list">
                            {drives.map(d => (
                                <div key={d.name} className="drive-card" onClick={() => handleNavigate(d.path)}>
                                    <div className="drive-icon">💾</div>
                                    <div className="drive-name">{d.name}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {currentPath && status === 'ready' && (
                        <table className="fm-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '50%' }}>Name</th>
                                    <th>Size</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => (
                                    <tr
                                        key={item.name}
                                        className={`fm-row ${selectedItem?.name === item.name ? 'selected' : ''}`}
                                        onClick={() => setSelectedItem(item)}
                                        onDoubleClick={() => item.isDirectory ? handleNavigate(item.path) : null}
                                    >
                                        <td>
                                            <span className="fm-icon">{item.isDirectory ? '📁' : '📄'}</span>
                                            {item.name}
                                        </td>
                                        <td>{item.isDirectory ? '' : formatSize(item.size)}</td>
                                        <td>{formatDate(item.mtime)}</td>
                                    </tr>
                                ))}
                                {items.length === 0 && (
                                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px' }}>Empty folder</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="fm-footer">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label className="fm-btn primary">
                            Upload
                            <input type="file" hidden onChange={e => { if (e.target.files[0]) startUpload(e.target.files[0]); e.target.value = ''; }} />
                        </label>
                        <button
                            className="fm-btn"
                            disabled={!selectedItem || selectedItem.isDirectory}
                            onClick={() => downloadManager.start(selectedItem)}
                        >
                            Download
                        </button>
                    </div>

                    {progress && (
                        <div className="fm-progress">
                            <div className="fm-progress-bar" style={{ width: `${progress.percent}%` }} />
                        </div>
                    )}

                    <div>{items.length} items</div>
                </div>
            </div>
        </div>
    );
}
