import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from '../api/axios';
import { matchInstallFolder, looksLikeBackupFile, PFIELDS_FILENAME } from '../data/machineFolderMap';
import './MachineConfigEditor.css';

const CHUNK_SIZE = 128 * 1024;
const ROOT_PATH = 'C:\\lasercomb';

function joinPath(dir, name) {
    const sep = dir.includes('/') ? '/' : '\\';
    return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export default function MachineConfigEditor({ channel, sessionId, deviceId, onClose }) {
    const [phase, setPhase] = useState('detecting'); // detecting | picking | loading | editing | confirming | saving | done | error
    const [error, setError] = useState(null);
    const [browsePath, setBrowsePath] = useState(ROOT_PATH);
    const [browseItems, setBrowseItems] = useState([]);
    const [candidates, setCandidates] = useState([]); // auto-detected files to choose from
    const [selectedFile, setSelectedFile] = useState(null); // { path, name, editor }
    const [pendingSave, setPendingSave] = useState(null); // { newContent, filename, oldContent }
    const [diff, setDiff] = useState(null);
    const [progressMsg, setProgressMsg] = useState('');

    const reqIdCounter = useRef(0);
    const pending = useRef(new Map());
    const iframeRef = useRef(null);
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

    const pickFile = (item) => {
        const editor = /\.mk$/i.test(item.name) ? 'mk'
            : item.name.toLowerCase() === PFIELDS_FILENAME ? 'pfields'
            : null;
        if (!editor) { setError(`${item.name} isn't a recognized machine config file (.mk or pfields.dat)`); return; }
        openFile({ path: item.path, name: item.name, editor });
    };

    /* ---------- Open + safety backup + embed editor ---------- */
    const openFile = async (file) => {
        setSelectedFile(file);
        setPhase('loading');
        setError(null);
        try {
            const content = await readFileFull(file.path);
            fileContentRef.current = content;
            const backupResp = await axios.post('/api/machine-config/backup', {
                sessionId, deviceId, filePath: file.path, content, reason: 'pre-edit'
            });
            backupIdRef.current = backupResp.data?.backup?.id || null;
            setPhase('editing');
        } catch (e) {
            setError(e.message);
            setPhase('error');
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
            setProgressMsg('Writing to the machine...');
            await writeFileFull(selectedFile.path, pendingSave.newContent);
            setProgressMsg('Recording change history...');
            await axios.post('/api/machine-config/log-change', {
                sessionId, deviceId, filePath: selectedFile.path,
                oldContent: pendingSave.oldContent, newContent: pendingSave.newContent,
                backupId: backupIdRef.current
            });
            fileContentRef.current = pendingSave.newContent;
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
                                    <div key={c.path} className="mce-candidate" onClick={() => openFile(c)}>
                                        <span className="mce-icon">{c.editor === 'mk' ? '⚙️' : '📄'}</span>
                                        <span className="mce-cand-name">{c.name}</span>
                                        {c.backupLike && <span className="mce-badge">looks like a backup — verify before editing</span>}
                                        <span className="mce-cand-path">{c.path}</span>
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
                                <div
                                    key={item.path}
                                    className="mce-browse-item"
                                    onClick={() => item.isDirectory ? navigateTo(item.path) : pickFile(item)}
                                >
                                    {item.isDirectory ? '📁' : '📄'} {item.name}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {phase === 'loading' && <div className="mce-empty">Reading {selectedFile?.name} and creating a safety backup...</div>}

                {(phase === 'editing' || phase === 'confirming' || phase === 'saving') && editorUrl && (
                    <div className="mce-editor-wrap">
                        <iframe
                            ref={iframeRef}
                            key={selectedFile.path}
                            src={editorUrl}
                            title="Machine parameter editor"
                            onLoad={onIframeLoad}
                            className="mce-iframe"
                        />
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
