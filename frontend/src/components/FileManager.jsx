import React, { useState, useEffect, useCallback, useRef } from 'react';
import './FileManager.css';

// Base64-encoded, this inflates to ~171KB per message — comfortably under
// typical WebRTC datachannel SCTP message-size limits (usually 256KB+).
const CHUNK_SIZE = 128 * 1024;

const EXT_ICON = {
    folder: '📁',
    image: '🖼️', doc: '📄', archive: '🗜️', exe: '⚙️', audio: '🎵', video: '🎬', code: '📝'
};
const EXT_MAP = {
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image', svg: 'image', webp: 'image',
    pdf: 'doc', doc: 'doc', docx: 'doc', txt: 'doc', rtf: 'doc', odt: 'doc',
    xls: 'doc', xlsx: 'doc', csv: 'doc', ppt: 'doc', pptx: 'doc',
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
    exe: 'exe', msi: 'exe', app: 'exe', dmg: 'exe',
    mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio',
    mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
    js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code', json: 'code', html: 'code', css: 'code', sh: 'code', java: 'code', c: 'code', cpp: 'code'
};
function iconFor(item) {
    if (item.isDirectory) return EXT_ICON.folder;
    const ext = (item.name.split('.').pop() || '').toLowerCase();
    return EXT_ICON[EXT_MAP[ext]] || '📄';
}

function joinPath(dir, name) {
    if (!dir) return name;
    const sep = dir.includes('\\') ? '\\' : '/';
    return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

// Split a path into clickable breadcrumb segments: [{ label, path }, ...]
function breadcrumbSegments(currentPath) {
    if (!currentPath) return [];
    const isWin = /^[a-zA-Z]:\\?/.test(currentPath);
    if (isWin) {
        const drive = currentPath.slice(0, 2) + '\\'; // "C:\"
        const rest = currentPath.slice(3).split('\\').filter(Boolean);
        const segs = [{ label: currentPath.slice(0, 2), path: drive }];
        let acc = drive;
        for (const part of rest) {
            acc = acc.endsWith('\\') ? acc + part : acc + '\\' + part;
            segs.push({ label: part, path: acc });
        }
        return segs;
    }
    const parts = currentPath.split('/').filter(Boolean);
    let acc = '';
    const segs = [{ label: '/', path: '/' }];
    for (const part of parts) {
        acc += '/' + part;
        segs.push({ label: part, path: acc });
    }
    return segs;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}
function base64Length(b64) {
    // Decoded byte length of a base64 string, without allocating the buffer.
    if (!b64) return 0;
    let len = (b64.length / 4) * 3;
    if (b64.endsWith('==')) len -= 2; else if (b64.endsWith('=')) len -= 1;
    return Math.round(len);
}
function b64ToBlob(b64Chunks, contentType = '') {
    const byteArrays = [];
    for (const b64 of b64Chunks) {
        const bin = window.atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        byteArrays.push(arr);
    }
    return new Blob(byteArrays, { type: contentType });
}
function formatSize(bytes) {
    if (bytes === 0 || bytes == null) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
function formatDate(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString();
}

export default function FileManager({ channel, onClose }) {
    const [drives, setDrives] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState('ready'); // ready, loading, error
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [lastClickedIdx, setLastClickedIdx] = useState(null);
    const [sortBy, setSortBy] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [queue, setQueue] = useState([]); // [{id, name, mode, percent}]
    const [contextMenu, setContextMenu] = useState(null); // { x, y, item }
    const [renaming, setRenaming] = useState(null); // { item, value }
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [dragOver, setDragOver] = useState(false);

    const reqIdCounter = useRef(0);
    const pending = useRef(new Map()); // reqId -> { resolve, reject }
    const contentRef = useRef(null);

    const sendRequest = useCallback((msg) => {
        if (!channel || channel.readyState !== 'open') {
            return Promise.reject(new Error('Connection lost'));
        }
        const reqId = `req-${++reqIdCounter.current}`;
        return new Promise((resolve, reject) => {
            pending.current.set(reqId, { resolve, reject });
            channel.send(JSON.stringify({ ...msg, reqId }));
        });
    }, [channel]);

    const refresh = useCallback(async () => {
        setStatus('loading');
        setError(null);
        setSelected(new Set());
        try {
            if (!currentPath) {
                const resp = await sendRequest({ action: 'drives' });
                if (resp.error) throw new Error(resp.error);
                setDrives(resp.drives || []);
                setItems([]);
            } else {
                const resp = await sendRequest({ action: 'list', path: currentPath });
                if (resp.error) throw new Error(resp.error);
                setItems(resp.items || []);
            }
            setStatus('ready');
        } catch (e) {
            setError(e.message);
            setStatus('error');
        }
    }, [currentPath, sendRequest]);

    // Route every channel message to whichever pending request it answers.
    useEffect(() => {
        if (!channel) return;
        const handleMessage = (evt) => {
            let data;
            try { data = JSON.parse(evt.data); } catch { return; }
            if (!data || !data.reqId) return;
            const entry = pending.current.get(data.reqId);
            if (!entry) return; // stray/duplicate — ignore
            // 'read'/'write' responses are consumed by a loop (see below) which
            // re-registers the same reqId per chunk internally, so always resolve
            // (never delete here for read/write — the loop owns its lifecycle).
            pending.current.delete(data.reqId);
            entry.resolve(data);
        };
        channel.onmessage = handleMessage;
        refresh();
        return () => { channel.onmessage = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channel, currentPath]);

    /* ---------- Navigation ---------- */
    const handleNavigate = (path) => { setCurrentPath(path); setLastClickedIdx(null); };
    const handleUp = () => {
        if (!currentPath) return;
        const segs = breadcrumbSegments(currentPath);
        if (segs.length <= 1) { handleNavigate(''); return; }
        handleNavigate(segs[segs.length - 2].path);
    };

    /* ---------- Sorting ---------- */
    const toggleSort = (col) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };
    const sortedItems = [...items].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1; // folders first, always
        let cmp = 0;
        if (sortBy === 'name') cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        else if (sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
        else if (sortBy === 'type') cmp = (a.name.split('.').pop() || '').localeCompare(b.name.split('.').pop() || '');
        else if (sortBy === 'modified') cmp = (a.mtime || 0) - (b.mtime || 0);
        return sortDir === 'asc' ? cmp : -cmp;
    });

    /* ---------- Selection ---------- */
    const clickItem = (item, idx, e) => {
        e.preventDefault();
        if (e.shiftKey && lastClickedIdx !== null) {
            const [lo, hi] = [lastClickedIdx, idx].sort((a, b) => a - b);
            const range = sortedItems.slice(lo, hi + 1).map(i => i.name);
            setSelected(new Set(range));
        } else if (e.ctrlKey || e.metaKey) {
            setSelected(prev => {
                const next = new Set(prev);
                next.has(item.name) ? next.delete(item.name) : next.add(item.name);
                return next;
            });
            setLastClickedIdx(idx);
        } else {
            setSelected(new Set([item.name]));
            setLastClickedIdx(idx);
        }
    };
    const openItem = (item) => {
        if (item.isDirectory) handleNavigate(item.path);
        else enqueueDownload(item);
    };

    /* ---------- Transfers (queue, sequential — the datachannel is ordered) ---------- */
    const queueRef = useRef([]);
    const processingRef = useRef(false);

    const runQueue = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        while (queueRef.current.length > 0) {
            const job = queueRef.current[0];
            try {
                await job.run((percent) => {
                    setQueue(q => q.map(x => x.id === job.id ? { ...x, percent } : x));
                });
            } catch (e) {
                setError(`${job.name}: ${e.message}`);
            }
            queueRef.current.shift();
            setQueue(q => q.filter(x => x.id !== job.id));
        }
        processingRef.current = false;
    }, []);

    const enqueue = useCallback((name, mode, run) => {
        const id = `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        queueRef.current.push({ id, name, mode, run });
        setQueue(q => [...q, { id, name, mode, percent: 0 }]);
        runQueue();
    }, [runQueue]);

    const enqueueDownload = useCallback((item) => {
        enqueue(item.name, 'down', async (onProgress) => {
            const chunks = [];
            let offset = 0;
            let received = 0;
            while (true) {
                const resp = await sendRequest({ action: 'read', path: item.path, offset, length: CHUNK_SIZE });
                if (resp.error) throw new Error(resp.error);
                if (resp.chunk) { chunks.push(resp.chunk); received += base64Length(resp.chunk); }
                if (item.size) onProgress(Math.min(100, Math.round((received / item.size) * 100)));
                offset += CHUNK_SIZE;
                if (resp.eof) break;
            }
            const blob = b64ToBlob(chunks);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = item.name; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        });
    }, [enqueue, sendRequest]);

    const enqueueUpload = useCallback((file) => {
        const fullPath = joinPath(currentPath, file.name);
        enqueue(file.name, 'up', async (onProgress) => {
            let offset = 0;
            while (offset < file.size) {
                const slice = file.slice(offset, offset + CHUNK_SIZE);
                const buf = await slice.arrayBuffer();
                const b64 = arrayBufferToBase64(buf);
                const resp = await sendRequest({ action: 'write', path: fullPath, chunk: b64, offset });
                if (resp.error) throw new Error(resp.error);
                offset += buf.byteLength;
                onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
            }
            if (file.size === 0) await sendRequest({ action: 'write', path: fullPath, chunk: '', offset: 0 });
            refresh();
        });
    }, [enqueue, sendRequest, currentPath, refresh]);

    /* ---------- Context menu actions ---------- */
    const doDelete = async (names) => {
        if (!window.confirm(`Delete ${names.length} item(s)? This cannot be undone.`)) return;
        for (const name of names) {
            const item = items.find(i => i.name === name);
            if (!item) continue;
            try {
                const resp = await sendRequest({ action: 'delete', path: item.path });
                if (resp.error) throw new Error(resp.error);
            } catch (e) { setError(`Delete failed: ${e.message}`); }
        }
        refresh();
    };
    const startRename = (item) => setRenaming({ item, value: item.name });
    const commitRename = async () => {
        if (!renaming) return;
        const { item, value } = renaming;
        setRenaming(null);
        if (!value || value === item.name) return;
        try {
            const newPath = joinPath(currentPath, value);
            const resp = await sendRequest({ action: 'rename', path: item.path, newPath });
            if (resp.error) throw new Error(resp.error);
            refresh();
        } catch (e) { setError(`Rename failed: ${e.message}`); }
    };
    const commitNewFolder = async () => {
        const name = newFolderName.trim();
        setCreatingFolder(false);
        setNewFolderName('');
        if (!name) return;
        try {
            const resp = await sendRequest({ action: 'mkdir', path: joinPath(currentPath, name) });
            if (resp.error) throw new Error(resp.error);
            refresh();
        } catch (e) { setError(`New folder failed: ${e.message}`); }
    };

    /* ---------- Drag and drop upload ---------- */
    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (!currentPath) return; // can't upload into the drives list
        const files = Array.from(e.dataTransfer.files || []);
        files.forEach(enqueueUpload);
    };

    /* ---------- Keyboard nav ---------- */
    const onKeyDown = (e) => {
        if (renaming || creatingFolder) return;
        if (e.key === 'Delete' && selected.size > 0) { doDelete([...selected]); return; }
        if (e.key === 'Escape') { setContextMenu(null); return; }
        if (!sortedItems.length) return;
        const idx = lastClickedIdx ?? -1;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = Math.min(sortedItems.length - 1, idx + 1);
            setLastClickedIdx(next); setSelected(new Set([sortedItems[next].name]));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const next = Math.max(0, idx - 1);
            setLastClickedIdx(next); setSelected(new Set([sortedItems[next].name]));
        } else if (e.key === 'Enter' && idx >= 0) {
            openItem(sortedItems[idx]);
        }
    };

    // Close context menu on outside click.
    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [contextMenu]);

    const activeJob = queue[0];
    const segs = breadcrumbSegments(currentPath);

    return (
        <div className="file-manager-overlay">
            <div className="file-manager-modal" tabIndex={0} onKeyDown={onKeyDown}>
                <div className="fm-header">
                    <div className="fm-title"><span>📁</span> File Manager</div>
                    <button className="fm-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="fm-toolbar">
                    <button className="fm-btn" onClick={handleUp} disabled={!currentPath} title="Up one level">⬆ Up</button>
                    <button className="fm-btn" onClick={refresh} title="Refresh">⟳</button>
                    <button className="fm-btn" onClick={() => setCreatingFolder(true)} disabled={!currentPath} title="New folder">📁+ New</button>
                    <div className="fm-breadcrumbs">
                        <span className="fm-crumb" onClick={() => handleNavigate('')}>💻</span>
                        {segs.map((s, i) => (
                            <React.Fragment key={s.path}>
                                <span className="fm-crumb-sep">/</span>
                                <span
                                    className={`fm-crumb ${i === segs.length - 1 ? 'current' : ''}`}
                                    onClick={() => handleNavigate(s.path)}
                                >
                                    {s.label}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div
                    className={`fm-content ${dragOver ? 'drag-over' : ''}`}
                    ref={contentRef}
                    onDragOver={(e) => { e.preventDefault(); if (currentPath) setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onContextMenu={(e) => { if (currentPath) { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item: null }); } }}
                >
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
                                    <th className="sortable" style={{ width: '46%' }} onClick={() => toggleSort('name')}>
                                        Name {sortBy === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="sortable" onClick={() => toggleSort('size')}>
                                        Size {sortBy === 'size' && (sortDir === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="sortable" onClick={() => toggleSort('type')}>
                                        Type {sortBy === 'type' && (sortDir === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="sortable" onClick={() => toggleSort('modified')}>
                                        Modified {sortBy === 'modified' && (sortDir === 'asc' ? '▲' : '▼')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {creatingFolder && (
                                    <tr className="fm-row new-folder-row">
                                        <td colSpan={4}>
                                            <span className="fm-icon">{EXT_ICON.folder}</span>
                                            <input
                                                autoFocus
                                                className="fm-inline-input"
                                                value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') commitNewFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
                                                onBlur={commitNewFolder}
                                                placeholder="New folder name"
                                            />
                                        </td>
                                    </tr>
                                )}
                                {sortedItems.map((item, idx) => (
                                    <tr
                                        key={item.name}
                                        className={`fm-row ${selected.has(item.name) ? 'selected' : ''}`}
                                        onClick={(e) => clickItem(item, idx, e)}
                                        onDoubleClick={() => openItem(item)}
                                        onContextMenu={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            if (!selected.has(item.name)) setSelected(new Set([item.name]));
                                            setContextMenu({ x: e.clientX, y: e.clientY, item });
                                        }}
                                    >
                                        <td>
                                            <span className="fm-icon">{iconFor(item)}</span>
                                            {renaming?.item.name === item.name ? (
                                                <input
                                                    autoFocus
                                                    className="fm-inline-input"
                                                    value={renaming.value}
                                                    onChange={e => setRenaming(r => ({ ...r, value: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                                                    onBlur={commitRename}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : item.name}
                                        </td>
                                        <td>{item.isDirectory ? '' : formatSize(item.size)}</td>
                                        <td className="muted">{item.isDirectory ? 'Folder' : (item.name.split('.').pop() || '').toUpperCase()}</td>
                                        <td className="muted">{formatDate(item.mtime)}</td>
                                    </tr>
                                ))}
                                {items.length === 0 && !creatingFolder && (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>Empty folder — drop files here to upload</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}

                    {contextMenu && (
                        <div className="fm-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
                            {contextMenu.item && !contextMenu.item.isDirectory && (
                                <div className="fm-menu-item" onClick={() => { enqueueDownload(contextMenu.item); setContextMenu(null); }}>⬇ Download</div>
                            )}
                            {contextMenu.item && (
                                <div className="fm-menu-item" onClick={() => { startRename(contextMenu.item); setContextMenu(null); }}>✎ Rename</div>
                            )}
                            {selected.size > 0 && (
                                <div className="fm-menu-item danger" onClick={() => { doDelete([...selected]); setContextMenu(null); }}>🗑 Delete{selected.size > 1 ? ` (${selected.size})` : ''}</div>
                            )}
                            <div className="fm-menu-item" onClick={() => { setCreatingFolder(true); setContextMenu(null); }}>📁+ New folder</div>
                            <div className="fm-menu-item" onClick={() => { refresh(); setContextMenu(null); }}>⟳ Refresh</div>
                        </div>
                    )}
                </div>

                <div className="fm-footer">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label className="fm-btn primary">
                            Upload
                            <input
                                type="file" hidden multiple
                                onChange={e => { Array.from(e.target.files || []).forEach(enqueueUpload); e.target.value = ''; }}
                            />
                        </label>
                        <button
                            className="fm-btn"
                            disabled={selected.size === 0}
                            onClick={() => {
                                [...selected].forEach(name => {
                                    const item = items.find(i => i.name === name);
                                    if (item && !item.isDirectory) enqueueDownload(item);
                                });
                            }}
                        >
                            Download{selected.size > 1 ? ` (${selected.size})` : ''}
                        </button>
                    </div>

                    {activeJob && (
                        <div className="fm-progress-wrap">
                            <span className="fm-progress-label">
                                {activeJob.mode === 'up' ? 'Uploading' : 'Downloading'} {activeJob.name}
                                {queue.length > 1 ? ` (+${queue.length - 1} queued)` : ''}
                            </span>
                            <div className="fm-progress">
                                <div className="fm-progress-bar" style={{ width: `${activeJob.percent}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="muted">{items.length} items{selected.size > 0 ? ` · ${selected.size} selected` : ''}</div>
                </div>
            </div>
        </div>
    );
}
