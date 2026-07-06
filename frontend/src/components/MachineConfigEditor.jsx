import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import axios from '../api/axios';
import { matchInstallFolder, looksLikeBackupFile, PFIELDS_FILENAME } from '../data/machineFolderMap';
import { alignParameterLines, formatCheck } from '../utils/configTextTools';
import './MachineConfigEditor.css';

const CHUNK_SIZE = 128 * 1024;
const ROOT_PATH = 'C:\\lasercomb';

function joinPath(dir, name) {
    const sep = dir.includes('/') ? '/' : '\\';
    return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

// Same naming convention MkEditor's own local backup uses
// (`${name}_backup_${timestamp}.mk`) — written next to the original file so a
// technician (or the customer) opening the machine's filesystem with any other
// tool, not just this one, sees the exact same kind of backup they'd expect
// from a manual copy-before-editing workflow.
function backupFilePath(originalPath) {
    const sep = originalPath.includes('/') ? '/' : '\\';
    const idx = originalPath.lastIndexOf(sep);
    const dir = idx === -1 ? '' : originalPath.slice(0, idx);
    const fileName = idx === -1 ? originalPath : originalPath.slice(idx + 1);
    const dotIdx = fileName.lastIndexOf('.');
    const base = dotIdx === -1 ? fileName : fileName.slice(0, dotIdx);
    const ext = dotIdx === -1 ? '' : fileName.slice(dotIdx);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${base}_backup_${timestamp}${ext}`;
    return dir ? `${dir}${sep}${backupName}` : backupName;
}

export default function MachineConfigEditor({ channel, sessionId, deviceId, onClose }) {
    const [phase, setPhase] = useState('detecting'); // detecting | picking | loading | editing | confirming | saving | done | error
    const [error, setError] = useState(null);
    const [browsePath, setBrowsePath] = useState(ROOT_PATH);
    const [browseItems, setBrowseItems] = useState([]);
    const [candidates, setCandidates] = useState([]); // auto-detected files to choose from
    const [selectedFile, setSelectedFile] = useState(null); // { path, name, editor }
    const [viewMode, setViewMode] = useState('structured'); // 'structured' (built-in editor) | 'text' (plain text, tab-indent)
    const [rawText, setRawText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [matchIdx, setMatchIdx] = useState(0);
    const [formatIssues, setFormatIssues] = useState(null); // null = not run, [] = clean, [...] = issues found
    const [pendingSave, setPendingSave] = useState(null); // { newContent, filename, oldContent }
    const [diff, setDiff] = useState(null);
    const [progressMsg, setProgressMsg] = useState('');
    const [backupInfo, setBackupInfo] = useState(null); // most recent backup for the open file: { id, created_at, reason }
    const [backupWarning, setBackupWarning] = useState(null); // non-blocking: on-machine copy failed but DB backup still succeeded
    const [showHistory, setShowHistory] = useState(false);
    const [backupHistory, setBackupHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [viewingBackup, setViewingBackup] = useState(null); // { id, content, created_at, reason } — full content fetched on demand
    const [viewingLoading, setViewingLoading] = useState(null); // id currently being fetched

    const reqIdCounter = useRef(0);
    const pending = useRef(new Map());
    const iframeRef = useRef(null);
    const textareaRef = useRef(null);
    const fileContentRef = useRef(''); // original content of the currently-open file
    const backupIdRef = useRef(null);

    const sendRequest = useCallback((msg) => {
        if (!channel || channel.readyState !== 'open') return Promise.reject(new Error('Connection lost'));
        const reqId = `mcfg-${++reqIdCounter.current}`;
        return new Promise((resolve, reject) => {
            pending.current.set(reqId, { resolve, reject });
            channel.send(JSON.stringify({ ...msg, reqId }));
        });
    }, [channel]);

    useEffect(() => {
        if (!channel) return;
        const prevHandler = channel.onmessage;
        const handleMessage = (evt) => {
            let data;
            try { data = JSON.parse(evt.data); } catch { return; }
            if (data && data.reqId && pending.current.has(data.reqId)) {
                const entry = pending.current.get(data.reqId);
                pending.current.delete(data.reqId);
                entry.resolve(data);
                return;
            }
            if (prevHandler) prevHandler(evt); // don't break FileManager if it's also listening
        };
        channel.onmessage = handleMessage;
        return () => { channel.onmessage = prevHandler; };
    }, [channel]);

    const readFileFull = useCallback(async (path) => {
        const chunks = [];
        let offset = 0;
        while (true) {
            const resp = await sendRequest({ action: 'read', path, offset, length: CHUNK_SIZE });
            if (resp.error) throw new Error(resp.error);
            if (resp.chunk) chunks.push(window.atob(resp.chunk));
            offset += CHUNK_SIZE;
            if (resp.eof) break;
        }
        return chunks.join('');
    }, [sendRequest]);

    const writeFileFull = useCallback(async (path, content) => {
        // `content` is a byte-per-character "binary string" — the same convention
        // atob() produces on read (these files are Windows-1252, e.g. German
        // umlauts in comments — MkEditor's own FileReader uses that encoding
        // explicitly). Slice by character count and btoa() directly; running it
        // through TextEncoder (UTF-8) here would corrupt any non-ASCII byte.
        let offset = 0;
        const total = content.length;
        while (offset < total || total === 0) {
            const slice = content.slice(offset, offset + CHUNK_SIZE);
            const b64 = window.btoa(slice);
            const resp = await sendRequest({ action: 'write', path, chunk: b64, offset });
            if (resp.error) throw new Error(resp.error);
            offset += slice.length;
            if (total === 0) break;
        }
    }, [sendRequest]);

    /* ---------- Auto-detection ---------- */
    const autoDetect = useCallback(async () => {
        setPhase('detecting');
        setError(null);
        try {
            const rootList = await sendRequest({ action: 'list', path: ROOT_PATH });
            if (rootList.error) throw new Error(rootList.error);
            const folders = (rootList.items || []).filter(i => i.isDirectory);

            const matches = folders
                .map(f => ({ folder: f, match: matchInstallFolder(f.name) }))
                .filter(x => x.match && x.match.entry.editor !== null);

            if (matches.length !== 1) {
                // No clean, unambiguous match — manual browse.
                setBrowsePath(ROOT_PATH);
                setBrowseItems(rootList.items || []);
                setPhase('picking');
                return;
            }

            const { folder, match } = matches[0];
            const cfgPath = joinPath(folder.path, 'cfg');
            const cfgList = await sendRequest({ action: 'list', path: cfgPath });
            if (cfgList.error) {
                // Folder matched but cfg\ isn't there/readable — fall back to browsing from the model folder itself.
                setBrowsePath(folder.path);
                const folderList = await sendRequest({ action: 'list', path: folder.path });
                setBrowseItems(folderList.items || []);
                setPhase('picking');
                return;
            }

            const items = cfgList.items || [];
            const found = [];
            const mkFiles = items.filter(i => !i.isDirectory && /\.mk$/i.test(i.name));
            if (match.expectedFilename) {
                const exact = mkFiles.find(i => i.name.toLowerCase() === match.expectedFilename.toLowerCase());
                if (exact) found.push({ path: exact.path, name: exact.name, editor: 'mk', backupLike: false });
            }
            // Include any other .mk files too (flagged if they look like backups) so
            // the technician can pick a different one if the guess is wrong or there
            // are multiple candidates (e.g. a backup copy sitting alongside the live file).
            mkFiles.forEach(i => {
                if (found.some(f => f.path === i.path)) return;
                found.push({ path: i.path, name: i.name, editor: 'mk', backupLike: looksLikeBackupFile(i.name) });
            });
            const pfields = items.find(i => !i.isDirectory && i.name.toLowerCase() === PFIELDS_FILENAME);
            if (pfields) found.push({ path: pfields.path, name: pfields.name, editor: 'pfields', backupLike: false });

            if (found.length === 0) {
                setBrowsePath(cfgPath);
                setBrowseItems(items);
                setPhase('picking');
                return;
            }

            setCandidates(found);
            setPhase('picking');
        } catch (e) {
            setError(e.message);
            setPhase('error');
        }
    }, [sendRequest]);

    useEffect(() => { autoDetect(); }, [autoDetect]);

    /* ---------- Manual browse (fallback) ---------- */
    const navigateTo = async (path) => {
        try {
            const resp = await sendRequest({ action: 'list', path });
            if (resp.error) throw new Error(resp.error);
            setBrowsePath(path);
            setBrowseItems(resp.items || []);
            setCandidates([]);
        } catch (e) { setError(e.message); }
    };

    // Writes a timestamped backup copy onto the machine itself (best-effort —
    // failure here is surfaced but doesn't block the DB record, which remains
    // the authoritative safety net), then records it server-side. Returns the
    // backup row (with on_machine_path set if the on-machine write succeeded).
    const createSafetyBackup = async (filePath, content, reason) => {
        const bkPath = backupFilePath(filePath);
        let onMachinePath = null;
        try {
            await writeFileFull(bkPath, content);
            onMachinePath = bkPath;
            setBackupWarning(null);
        } catch (e) {
            setBackupWarning(`Could not write an on-machine backup copy (${e.message}) — a server-side backup was still taken, but nothing will be visible if the machine's files are opened outside this tool.`);
        }
        const backupResp = await axios.post('/api/machine-config/backup', {
            sessionId, deviceId, filePath, content, reason, onMachinePath
        });
        return backupResp.data?.backup || null;
    };

    const pickFile = (item, mode = 'structured') => {
        const editor = /\.mk$/i.test(item.name) ? 'mk'
            : item.name.toLowerCase() === PFIELDS_FILENAME ? 'pfields'
            : null;
        if (!editor) { setError(`${item.name} isn't a recognized machine config file (.mk or pfields.dat)`); return; }
        openFile({ path: item.path, name: item.name, editor }, mode);
    };

    /* ---------- Open + safety backup + embed editor (or plain text) ---------- */
    const openFile = async (file, mode = 'structured') => {
        setSelectedFile(file);
        setViewMode(mode);
        setPhase('loading');
        setError(null);
        setSearchQuery('');
        setFormatIssues(null);
        setBackupInfo(null);
        setBackupWarning(null);
        setShowHistory(false);
        setBackupHistory([]);
        try {
            const content = await readFileFull(file.path);
            fileContentRef.current = content;
            if (mode === 'text') setRawText(content);
            const backup = await createSafetyBackup(file.path, content, 'pre-edit');
            backupIdRef.current = backup?.id || null;
            setBackupInfo(backup);
            setPhase('editing');
        } catch (e) {
            setError(e.message);
            setPhase('error');
        }
    };

    const loadBackupHistory = async () => {
        if (!selectedFile) return;
        setShowHistory(true);
        setHistoryLoading(true);
        try {
            const resp = await axios.get('/api/machine-config/backups', {
                params: { filePath: selectedFile.path, deviceId, limit: 50 }
            });
            setBackupHistory(resp.data?.backups || []);
        } catch (e) {
            setBackupHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const viewBackup = async (id) => {
        setViewingLoading(id);
        try {
            const resp = await axios.get(`/api/machine-config/backups/${id}`);
            setViewingBackup(resp.data?.backup || null);
        } catch (e) {
            setBackupWarning(`Could not load that backup: ${e.message}`);
        } finally {
            setViewingLoading(null);
        }
    };

    // Loads a past backup's content as a pending change — it goes through the
    // exact same diff + confirmation + write pipeline as any other edit, so
    // restoring is reviewed just as carefully as a normal save, never silent.
    const restoreBackup = async (id) => {
        setViewingLoading(id);
        try {
            const resp = await axios.get(`/api/machine-config/backups/${id}`);
            const content = resp.data?.backup?.content;
            if (typeof content !== 'string') throw new Error('Backup has no content');
            setShowHistory(false);
            setViewingBackup(null);
            setPendingSave({ newContent: content, filename: selectedFile.name, oldContent: fileContentRef.current });
        } catch (e) {
            setBackupWarning(`Could not load that backup: ${e.message}`);
        } finally {
            setViewingLoading(null);
        }
    };

    // Called once the iframe finishes loading its editor.
    const onIframeLoad = () => {
        const win = iframeRef.current?.contentWindow;
        const api = selectedFile.editor === 'mk' ? win?.MkEditor : win?.PfieldEditor;
        if (!api) { setError('Editor failed to load inside the frame'); setPhase('error'); return; }
        api.loadContent(fileContentRef.current, selectedFile.name);
        api.setSaveHandler((newContent, filename, oldContent) => {
            setPendingSave({ newContent, filename: filename || selectedFile.name, oldContent: oldContent ?? fileContentRef.current });
        });
        // Technicians are already authenticated by the platform — the editor's
        // own password lock and local Open File/Load Sample controls (which
        // don't apply to content fed in via loadContent()) are just friction.
        api.enableEmbeddedMode?.();
    };

    // Once the embedded editor calls Save, compute a diff and require explicit confirmation
    // before anything is written back to the live machine.
    useEffect(() => {
        if (!pendingSave) return;
        (async () => {
            try {
                const resp = await axios.post('/api/machine-config/diff', {
                    oldContent: pendingSave.oldContent, newContent: pendingSave.newContent
                });
                setDiff(resp.data);
                setPhase('confirming');
            } catch (e) {
                setError(e.message);
                setPhase('error');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingSave]);

    const confirmSave = async () => {
        if (!pendingSave || !selectedFile) return;
        setPhase('saving');
        setError(null);
        try {
            // A fresh backup of the state right before THIS write — the one taken
            // at file-open only covers the very first edit; if the technician has
            // already saved once this session, that snapshot no longer reflects
            // what's about to be overwritten.
            setProgressMsg('Creating safety backup...');
            const backup = await createSafetyBackup(selectedFile.path, pendingSave.oldContent, 'pre-save');
            const preSaveBackupId = backup?.id || null;
            setBackupInfo(backup);

            setProgressMsg('Writing to the machine...');
            await writeFileFull(selectedFile.path, pendingSave.newContent);
            setProgressMsg('Recording change history...');
            await axios.post('/api/machine-config/log-change', {
                sessionId, deviceId, filePath: selectedFile.path,
                oldContent: pendingSave.oldContent, newContent: pendingSave.newContent,
                backupId: preSaveBackupId || backupIdRef.current
            });
            fileContentRef.current = pendingSave.newContent;
            // Keep whatever's currently displayed in sync with what's now actually
            // on the machine — matters for restore, where newContent is an old
            // backup, not what the technician was just looking at.
            if (viewMode === 'text') {
                setRawText(pendingSave.newContent);
            } else {
                const win = iframeRef.current?.contentWindow;
                const api = selectedFile.editor === 'mk' ? win?.MkEditor : win?.PfieldEditor;
                api?.loadContent(pendingSave.newContent, selectedFile.name);
            }
            setPendingSave(null);
            setDiff(null);
            setPhase('editing');
            setProgressMsg('Saved to the machine.');
            setTimeout(() => setProgressMsg(''), 4000);
        } catch (e) {
            setError(e.message);
            setPhase('error');
        }
    };

    const cancelSave = () => {
        setPendingSave(null);
        setDiff(null);
        setPhase('editing');
    };

    // Plain-text mode: pressing Tab inserts a real tab character (keeping the
    // file's column alignment intact) instead of shifting focus, which is what
    // a bare <textarea> does by default.
    const handleTextareaKeyDown = (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const ta = e.target;
        const { selectionStart, selectionEnd } = ta;
        const next = rawText.slice(0, selectionStart) + '\t' + rawText.slice(selectionEnd);
        setRawText(next);
        requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = selectionStart + 1;
        });
    };

    // Any further edit invalidates the last Format Check result — clear it so
    // stale "issue" text can't linger after the technician has already fixed it.
    useEffect(() => { setFormatIssues(null); }, [rawText]);

    // All (case-insensitive) match positions of the search query in the raw text.
    const searchMatches = useMemo(() => {
        if (!searchQuery) return [];
        const matches = [];
        const hay = rawText.toLowerCase();
        const needle = searchQuery.toLowerCase();
        let from = 0;
        while (true) {
            const at = hay.indexOf(needle, from);
            if (at === -1) break;
            matches.push({ start: at, end: at + needle.length });
            from = at + needle.length;
        }
        return matches;
    }, [rawText, searchQuery]);

    useEffect(() => { setMatchIdx(0); }, [searchQuery]);

    const jumpToMatch = (idx) => {
        if (!searchMatches.length) return;
        const wrapped = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
        setMatchIdx(wrapped);
        const m = searchMatches[wrapped];
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(m.start, m.end);
        // setSelectionRange alone doesn't reliably scroll a long textarea —
        // estimate the line and scroll proportionally to bring it into view.
        const lineNo = rawText.slice(0, m.start).split('\n').length;
        const totalLines = rawText.split('\n').length;
        ta.scrollTop = (lineNo / totalLines) * ta.scrollHeight - ta.clientHeight / 2;
    };

    const findNext = () => jumpToMatch(matchIdx + 1);
    const findPrev = () => jumpToMatch(matchIdx - 1);

    const runAlign = () => setRawText(prev => alignParameterLines(prev));
    const runFormatCheck = () => setFormatIssues(formatCheck(rawText));

    const saveTextEdits = () => {
        setPendingSave({ newContent: rawText, filename: selectedFile.name, oldContent: fileContentRef.current });
    };

    const editorUrl = selectedFile?.editor === 'mk' ? '/remote/editors/mkeditor/index.html'
        : selectedFile?.editor === 'pfields' ? '/remote/editors/pfieldeditor/index.html'
        : null;

    return (
        <div className="mce-overlay">
            <div className="mce-modal">
                <div className="mce-header">
                    <div className="mce-title">🛠 Machine Parameters {selectedFile ? `— ${selectedFile.name}` : ''}</div>
                    <button className="mce-close-btn" onClick={onClose}>✕</button>
                </div>

                {phase === 'detecting' && (
                    <div className="mce-empty">Looking for a matching machine folder under {ROOT_PATH}...</div>
                )}

                {phase === 'error' && (
                    <div className="mce-empty error">
                        {error}
                        <div style={{ marginTop: 10 }}>
                            <button className="mce-btn" onClick={() => { setError(null); autoDetect(); }}>Retry auto-detect</button>
                            <button className="mce-btn" onClick={() => { setError(null); navigateTo(ROOT_PATH); setPhase('picking'); }}>Browse manually</button>
                        </div>
                    </div>
                )}

                {phase === 'picking' && (
                    <div className="mce-picker">
                        {candidates.length > 0 && (
                            <>
                                <p className="mce-hint">Found these machine config files:</p>
                                {candidates.map(c => (
                                    <div key={c.path} className="mce-candidate">
                                        <span className="mce-icon">{c.editor === 'mk' ? '⚙️' : '📄'}</span>
                                        <span className="mce-cand-name">{c.name}</span>
                                        {c.backupLike && <span className="mce-badge">looks like a backup — verify before editing</span>}
                                        <span className="mce-cand-path">{c.path}</span>
                                        <div className="mce-cand-actions">
                                            <button className="mce-btn primary" onClick={() => openFile(c, 'structured')}>Open in Editor</button>
                                            <button className="mce-btn" onClick={() => openFile(c, 'text')}>Open as Text</button>
                                        </div>
                                    </div>
                                ))}
                                <p className="mce-hint" style={{ marginTop: 14 }}>Not the right file? Browse manually below.</p>
                            </>
                        )}
                        {candidates.length === 0 && (
                            <p className="mce-hint">No confident auto-match — browse to the file manually ({browsePath}):</p>
                        )}
                        <div className="mce-browser">
                            {browsePath !== ROOT_PATH && (
                                <div className="mce-browse-item" onClick={() => {
                                    const sep = browsePath.includes('/') ? '/' : '\\';
                                    const parts = browsePath.split(sep).filter(Boolean);
                                    parts.pop();
                                    navigateTo(parts.join(sep) || ROOT_PATH);
                                }}>⬆ Up</div>
                            )}
                            {browseItems.map(item => (
                                item.isDirectory ? (
                                    <div key={item.path} className="mce-browse-item" onClick={() => navigateTo(item.path)}>
                                        📁 {item.name}
                                    </div>
                                ) : (
                                    <div key={item.path} className="mce-browse-item mce-browse-file">
                                        <span>📄 {item.name}</span>
                                        <div className="mce-cand-actions">
                                            <button className="mce-btn primary" onClick={() => pickFile(item, 'structured')}>Open in Editor</button>
                                            <button className="mce-btn" onClick={() => pickFile(item, 'text')}>Open as Text</button>
                                        </div>
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                )}

                {phase === 'loading' && <div className="mce-empty">Reading {selectedFile?.name} and creating a safety backup...</div>}

                {(phase === 'editing' || phase === 'confirming' || phase === 'saving') && selectedFile && (
                    <div className="mce-editor-wrap">
                        <div className="mce-backup-bar">
                            <div className="mce-backup-status-group">
                                {backupInfo ? (
                                    <span className="mce-backup-status">
                                        🛡️ Safety backup saved — {new Date(backupInfo.created_at).toLocaleTimeString()}
                                        {backupInfo.on_machine_path && (
                                            <span className="mce-backup-onmachine"> · on machine as {backupInfo.on_machine_path.split(/[\\/]/).pop()}</span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="mce-backup-status warn">⚠ No backup confirmation received</span>
                                )}
                                {backupWarning && <span className="mce-backup-status warn">⚠ {backupWarning}</span>}
                            </div>
                            <button className="mce-btn" onClick={loadBackupHistory}>View Backup History</button>
                        </div>

                        {showHistory && (
                            <div className="mce-history-overlay" onClick={() => setShowHistory(false)}>
                                <div className="mce-history-box" onClick={(e) => e.stopPropagation()}>
                                    <div className="mce-format-header">
                                        <span>Backup history — {selectedFile.name}</span>
                                        <button className="mce-close-btn" onClick={() => setShowHistory(false)}>✕</button>
                                    </div>
                                    {historyLoading && <div className="mce-hint" style={{ padding: 14 }}>Loading...</div>}
                                    {!historyLoading && backupHistory.length === 0 && (
                                        <div className="mce-hint" style={{ padding: 14 }}>No backups found for this file yet.</div>
                                    )}
                                    {!historyLoading && backupHistory.map(b => (
                                        <div key={b.id} className="mce-history-row">
                                            <span className="mce-history-time">{new Date(b.created_at).toLocaleString()}</span>
                                            <span className={`mce-history-reason ${b.reason}`}>{b.reason}</span>
                                            <span className="mce-history-tech">{b.technician || 'unknown'}</span>
                                            <span className="mce-history-size">{b.content_length} bytes</span>
                                            {b.on_machine_path && (
                                                <span className="mce-history-onmachine" title={b.on_machine_path}>on machine</span>
                                            )}
                                            <div className="mce-history-actions">
                                                <button className="mce-btn" disabled={viewingLoading === b.id} onClick={() => viewBackup(b.id)}>View</button>
                                                <button className="mce-btn" disabled={viewingLoading === b.id} onClick={() => restoreBackup(b.id)}>Restore</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {viewingBackup && (
                            <div className="mce-history-overlay" onClick={() => setViewingBackup(null)}>
                                <div className="mce-history-box mce-view-box" onClick={(e) => e.stopPropagation()}>
                                    <div className="mce-format-header">
                                        <span>Backup content — {new Date(viewingBackup.created_at).toLocaleString()} ({viewingBackup.reason})</span>
                                        <button className="mce-close-btn" onClick={() => setViewingBackup(null)}>✕</button>
                                    </div>
                                    <textarea className="mce-textarea mce-view-textarea" value={viewingBackup.content} readOnly spellCheck={false} />
                                    <div className="mce-confirm-actions" style={{ padding: '10px 14px' }}>
                                        <button className="mce-btn primary" onClick={() => restoreBackup(viewingBackup.id)}>Restore This Version</button>
                                        <button className="mce-btn" onClick={() => setViewingBackup(null)}>Close</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {viewMode === 'structured' && editorUrl && (
                            <iframe
                                ref={iframeRef}
                                key={selectedFile.path}
                                src={editorUrl}
                                title="Machine parameter editor"
                                onLoad={onIframeLoad}
                                className="mce-iframe"
                            />
                        )}

                        {viewMode === 'text' && (
                            <div className="mce-text-editor">
                                <div className="mce-text-toolbar">
                                    <div className="mce-search-box">
                                        <input
                                            type="text"
                                            className="mce-search-input"
                                            placeholder="Search..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? findPrev() : findNext(); }
                                            }}
                                        />
                                        {searchQuery && (
                                            <span className="mce-search-count">
                                                {searchMatches.length ? `${matchIdx + 1}/${searchMatches.length}` : '0/0'}
                                            </span>
                                        )}
                                        <button className="mce-btn" onClick={findPrev} disabled={!searchMatches.length} title="Previous match">↑</button>
                                        <button className="mce-btn" onClick={findNext} disabled={!searchMatches.length} title="Next match">↓</button>
                                    </div>
                                    <div className="mce-toolbar-actions">
                                        <button className="mce-btn" onClick={runAlign} disabled={phase !== 'editing'} title="Line up parameter columns neatly">Align Parameters</button>
                                        <button className="mce-btn" onClick={runFormatCheck} disabled={phase !== 'editing'} title="Scan for duplicate keys, typos, and malformed lines">Format Check</button>
                                        <button className="mce-btn primary" onClick={saveTextEdits} disabled={phase !== 'editing'}>Save</button>
                                    </div>
                                </div>
                                {formatIssues !== null && (
                                    <div className="mce-format-panel">
                                        <div className="mce-format-header">
                                            <span>{formatIssues.length === 0 ? 'No issues found.' : `${formatIssues.length} issue${formatIssues.length !== 1 ? 's' : ''} found`}</span>
                                            <button className="mce-close-btn" onClick={() => setFormatIssues(null)}>✕</button>
                                        </div>
                                        {formatIssues.map((issue, i) => (
                                            <div key={i} className={`mce-format-issue ${issue.severity}`}>
                                                <span className="mce-format-line">{issue.line ? `L${issue.line}` : '—'}</span>
                                                <span>{issue.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <textarea
                                    ref={textareaRef}
                                    className="mce-textarea"
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    onKeyDown={handleTextareaKeyDown}
                                    spellCheck={false}
                                    disabled={phase !== 'editing'}
                                />
                            </div>
                        )}

                        {progressMsg && <div className="mce-toast">{progressMsg}</div>}

                        {phase === 'confirming' && diff && (
                            <div className="mce-confirm-overlay">
                                <div className="mce-confirm-box">
                                    <h3>Confirm changes to the live machine</h3>
                                    <p>{diff.changeCount} value{diff.changeCount !== 1 ? 's' : ''} will be written to <code>{selectedFile.path}</code> on the customer's machine.</p>
                                    <div className="mce-diff-list">
                                        {diff.changes.map((c, i) => (
                                            <div key={i} className="mce-diff-row">
                                                <span className="mce-diff-key">{c.key || `line ${c.line}`}</span>
                                                <span className="mce-diff-old">{c.oldValue || '(empty)'}</span>
                                                <span className="mce-diff-arrow">→</span>
                                                <span className="mce-diff-new">{c.newValue || '(empty)'}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mce-confirm-actions">
                                        <button className="mce-btn primary" onClick={confirmSave} disabled={phase === 'saving'}>
                                            {phase === 'saving' ? 'Saving...' : 'Confirm & Write to Machine'}
                                        </button>
                                        <button className="mce-btn" onClick={cancelSave} disabled={phase === 'saving'}>Cancel</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
