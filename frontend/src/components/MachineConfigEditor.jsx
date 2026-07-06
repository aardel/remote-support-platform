import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import axios from '../api/axios';
import { matchInstallFolder, looksLikeBackupFile, PFIELDS_FILENAME } from '../data/machineFolderMap';
import { alignParameterLines, formatCheck, compareConfigs, appendParameterChangeHistory } from '../utils/configTextTools';
import './MachineConfigEditor.css';

const CHUNK_SIZE = 128 * 1024;
const ROOT_PATH = 'C:\\lasercomb';

function joinPath(dir, name) {
    const sep = dir.includes('/') ? '/' : '\\';
    return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

// One stable backup filename per original file (e.g. ptsneo_backup.mk) — not
// re-timestamped per event, so repeated edits don't litter cfg\ with a new
// file every time. Written next to the original so a technician (or the
// customer) opening the machine's filesystem with any other tool sees it too.
function backupFilePath(originalPath) {
    const sep = originalPath.includes('/') ? '/' : '\\';
    const idx = originalPath.lastIndexOf(sep);
    const dir = idx === -1 ? '' : originalPath.slice(0, idx);
    const fileName = idx === -1 ? originalPath : originalPath.slice(idx + 1);
    const dotIdx = fileName.lastIndexOf('.');
    const base = dotIdx === -1 ? fileName : fileName.slice(0, dotIdx);
    const ext = dotIdx === -1 ? '' : fileName.slice(dotIdx);
    const backupName = `${base}_backup${ext}`;
    return dir ? `${dir}${sep}${backupName}` : backupName;
}

const BACKUP_HISTORY_HEADER = '; Backup History';

// Builds the new content for the single on-machine backup file: the latest
// snapshot, plus a running "Backup History" trailer with one timestamped
// entry per backup event — same pattern as the built-in editor's own
// "append changes as comments" feature, just applied to the backup file
// instead of the live one. Prior history lines are preserved across saves so
// nothing is lost each time the file gets overwritten with a fresh snapshot.
function buildBackupContent(existingBackupContent, snapshotContent, reason, technician, changes) {
    let priorHistory = [];
    if (existingBackupContent) {
        const idx = existingBackupContent.indexOf(BACKUP_HISTORY_HEADER);
        if (idx !== -1) {
            priorHistory = existingBackupContent.slice(idx).split(/\r\n|\r|\n/).slice(1).filter(l => l.trim());
        }
    }
    const timestamp = new Date().toISOString();
    const newLines = [`; [${timestamp}] ${reason} backup by ${technician || 'technician'}`];
    if (changes && changes.length) {
        changes.forEach(c => {
            newLines.push(`;   ${c.key || `line ${c.line}`}: ${c.oldValue || '(empty)'} -> ${c.newValue || '(empty)'}`);
        });
    }
    const trimmedSnapshot = snapshotContent.replace(/[\r\n]+$/, '');
    const historyBlock = [BACKUP_HISTORY_HEADER, ...priorHistory, ...newLines].join('\r\n');
    return `${trimmedSnapshot}\r\n\r\n${historyBlock}\r\n`;
}

export default function MachineConfigEditor({ channel, sessionId, deviceId, technicianName, onClose }) {
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
    const [historyVersion, setHistoryVersion] = useState(0); // bumped to force a re-render whenever textHistoryRef changes
    const [showTextHistory, setShowTextHistory] = useState(false);
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
    const [compareSelection, setCompareSelection] = useState([]); // up to 2: { path, name }
    const [compareResult, setCompareResult] = useState(null); // { fileA, fileB, rows }
    const [compareLoading, setCompareLoading] = useState(false);

    const reqIdCounter = useRef(0);
    const pending = useRef(new Map());
    const iframeRef = useRef(null);
    const textareaRef = useRef(null);
    const gutterRef = useRef(null);
    const fileContentRef = useRef(''); // original content of the currently-open file
    const backupIdRef = useRef(null);
    const lastBackedUpContentRef = useRef(null); // content captured by the most recent backup — skip taking an identical one again
    const openedFileIsBackupRef = useRef(false); // true when the currently open file is itself a backup — skip auto-backup entirely to avoid backup-of-a-backup
    const textHistoryRef = useRef({ list: [], index: -1 }); // undo/redo stack for text mode: { list: [{label, content, ts}], index }
    const skipNextHistorySnapshotRef = useRef(false); // set before a programmatic setRawText (align/undo/redo/jump) so the debounced typing-snapshot doesn't also fire for it

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

            // Always populate the manual-browse section with this same cfg\ folder
            // too — even when candidates were found, the "browse manually" hint
            // below them needs something to actually show.
            setBrowsePath(cfgPath);
            setBrowseItems(items);
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

    // Updates the single on-machine backup file (best-effort — failure here is
    // surfaced but doesn't block the DB record, which remains the authoritative
    // safety net) by appending a timestamped entry to its "Backup History"
    // trailer, then records the same event server-side. `changes` (from the
    // pre-save diff, when available) gets logged per-key, same as the built-in
    // editor's own change-history comments. Returns the backup row.
    const createSafetyBackup = async (filePath, content, reason, changes = null) => {
        const bkPath = backupFilePath(filePath);
        let onMachinePath = null;
        try {
            let existing = null;
            try { existing = await readFileFull(bkPath); } catch (_) { /* no backup file yet — start fresh */ }
            const combined = buildBackupContent(existing, content, reason, technicianName, changes);
            await writeFileFull(bkPath, combined);
            onMachinePath = bkPath;
            setBackupWarning(null);
        } catch (e) {
            setBackupWarning(`Could not write the on-machine backup file (${e.message}) — a server-side backup was still taken, but nothing will be visible if the machine's files are opened outside this tool.`);
        }
        lastBackedUpContentRef.current = content;
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

    /* ---------- File comparison (read-only — no backup/edit involved) ---------- */
    const toggleCompare = (item) => {
        setCompareSelection(prev => {
            const already = prev.find(f => f.path === item.path);
            if (already) return prev.filter(f => f.path !== item.path);
            if (prev.length >= 2) return [prev[1], { path: item.path, name: item.name }]; // keep most recent 2
            return [...prev, { path: item.path, name: item.name }];
        });
    };

    const runComparison = async () => {
        if (compareSelection.length !== 2) return;
        setCompareLoading(true);
        setError(null);
        try {
            const [fileA, fileB] = compareSelection;
            const [contentA, contentB] = await Promise.all([
                readFileFull(fileA.path),
                readFileFull(fileB.path)
            ]);
            const rows = compareConfigs(contentA, contentB);
            setCompareResult({ fileA, fileB, rows });
        } catch (e) {
            setError(`Comparison failed: ${e.message}`);
        } finally {
            setCompareLoading(false);
        }
    };

    const copyDifferencesToClipboard = () => {
        if (!compareResult) return;
        const { fileA, fileB, rows } = compareResult;
        const lines = [`${fileA.name}\tvs\t${fileB.name}`, ''];
        rows.forEach(r => {
            lines.push(`${r.key}\t${r.valueA ?? '(missing)'}\t${r.valueB ?? '(missing)'}`);
        });
        navigator.clipboard.writeText(lines.join('\n')).then(
            () => { setProgressMsg('Differences copied to clipboard.'); setTimeout(() => setProgressMsg(''), 3000); },
            () => setError('Could not copy to clipboard — your browser may be blocking clipboard access.')
        );
    };

    /* ---------- Remote file management: copy / rename / delete ---------- */
    // Re-runs whatever listing is currently on screen so it reflects a change
    // immediately, without the technician having to manually refresh.
    const refreshPickerListing = () => {
        if (candidates.length > 0) autoDetect();
        else navigateTo(browsePath);
    };

    const splitDirName = (fullPath) => {
        const sep = fullPath.includes('/') ? '/' : '\\';
        const idx = fullPath.lastIndexOf(sep);
        return { dir: idx === -1 ? '' : fullPath.slice(0, idx), sep, name: idx === -1 ? fullPath : fullPath.slice(idx + 1) };
    };

    const copyFile = async (item) => {
        const { dir, sep, name } = splitDirName(item.path);
        const dotIdx = name.lastIndexOf('.');
        const base = dotIdx === -1 ? name : name.slice(0, dotIdx);
        const ext = dotIdx === -1 ? '' : name.slice(dotIdx);
        const suggested = `${base}_copy${ext}`;
        const newName = window.prompt(`Copy "${name}" as:`, suggested);
        if (!newName || newName === name) return;
        try {
            const content = await readFileFull(item.path);
            await writeFileFull(`${dir}${sep}${newName}`, content);
            setProgressMsg(`Copied to ${newName}.`);
            setTimeout(() => setProgressMsg(''), 3000);
            refreshPickerListing();
        } catch (e) {
            setError(`Copy failed: ${e.message}`);
        }
    };

    const renameFile = async (item) => {
        const { dir, sep, name } = splitDirName(item.path);
        const isLiveConfig = !looksLikeBackupFile(name);
        const warn = isLiveConfig
            ? `"${name}" looks like a live machine config file, not a backup. If the machine's software expects this exact filename, renaming it may stop it from finding its configuration.\n\n`
            : '';
        const newName = window.prompt(`${warn}Rename "${name}" to:`, name);
        if (!newName || newName === name) return;
        try {
            const resp = await sendRequest({ action: 'rename', path: item.path, newPath: `${dir}${sep}${newName}` });
            if (resp.error) throw new Error(resp.error);
            setProgressMsg(`Renamed to ${newName}.`);
            setTimeout(() => setProgressMsg(''), 3000);
            refreshPickerListing();
        } catch (e) {
            setError(`Rename failed: ${e.message}`);
        }
    };

    const deleteFile = async (item) => {
        const isLiveConfig = !looksLikeBackupFile(item.name);
        const warn = isLiveConfig
            ? `"${item.name}" looks like a live machine config file, not a backup. Deleting it may prevent the machine's software from starting correctly.\n\n`
            : '';
        if (!window.confirm(`${warn}Delete "${item.name}"? This cannot be undone.`)) return;
        try {
            const resp = await sendRequest({ action: 'delete', path: item.path });
            if (resp.error) throw new Error(resp.error);
            setProgressMsg(`Deleted ${item.name}.`);
            setTimeout(() => setProgressMsg(''), 3000);
            refreshPickerListing();
        } catch (e) {
            setError(`Delete failed: ${e.message}`);
        }
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
        setShowTextHistory(false);
        try {
            const content = await readFileFull(file.path);
            fileContentRef.current = content;
            if (mode === 'text') { setRawText(content); resetTextHistory(content); }
            // A file that's itself a backup doesn't get auto-backed-up again —
            // otherwise opening ptsneo_backup.mk creates ptsneo_backup_backup.mk,
            // and opening that creates another layer, and so on.
            openedFileIsBackupRef.current = looksLikeBackupFile(file.name);
            if (openedFileIsBackupRef.current) {
                backupIdRef.current = null;
                lastBackedUpContentRef.current = null;
                setBackupInfo(null);
                setBackupWarning('This file looks like a backup itself — automatic backups are skipped here to avoid creating a backup of a backup.');
            } else {
                const backup = await createSafetyBackup(file.path, content, 'pre-edit');
                backupIdRef.current = backup?.id || null;
                setBackupInfo(backup);
            }
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
            // A fresh backup of the state right before THIS write — matters once the
            // technician has saved before, since the file-open snapshot no longer
            // reflects what's about to be overwritten. Skipped when it would be a
            // second, byte-identical backup of the state already captured at open
            // time — which is exactly what happens on the very first save (nothing
            // changed between opening the file and starting this edit).
            let preSaveBackupId = backupIdRef.current;
            if (!openedFileIsBackupRef.current && pendingSave.oldContent !== lastBackedUpContentRef.current) {
                setProgressMsg('Creating safety backup...');
                const backup = await createSafetyBackup(selectedFile.path, pendingSave.oldContent, 'pre-save', diff?.changes);
                preSaveBackupId = backup?.id || preSaveBackupId;
                setBackupInfo(backup);
            }

            // Append a "Parameter Change History" comment trailer to the LIVE file
            // itself — same header/format the built-in editors already use via
            // their own checkbox (now disabled for embedded use, see
            // enableEmbeddedMode), applied centrally here so it happens
            // consistently whether the edit came from the structured editor,
            // plain-text mode, or a restore — none of which otherwise share it.
            const contentToWrite = appendParameterChangeHistory(pendingSave.newContent, diff?.changes);

            setProgressMsg('Writing to the machine...');
            await writeFileFull(selectedFile.path, contentToWrite);
            setProgressMsg('Recording change history...');
            await axios.post('/api/machine-config/log-change', {
                sessionId, deviceId, filePath: selectedFile.path,
                oldContent: pendingSave.oldContent, newContent: contentToWrite,
                backupId: preSaveBackupId
            });
            fileContentRef.current = contentToWrite;
            // Keep whatever's currently displayed in sync with what's now actually
            // on the machine — matters for restore, where newContent is an old
            // backup, not what the technician was just looking at.
            if (viewMode === 'text') {
                setRawTextProgrammatic(contentToWrite);
                pushTextHistory('Saved', contentToWrite);
            } else {
                const win = iframeRef.current?.contentWindow;
                const api = selectedFile.editor === 'mk' ? win?.MkEditor : win?.PfieldEditor;
                api?.loadContent(contentToWrite, selectedFile.name);
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

    const lineNumbers = useMemo(() => {
        const count = rawText.split(/\r\n|\r|\n/).length;
        return Array.from({ length: count }, (_, i) => i + 1).join('\n');
    }, [rawText]);

    // Keeps the line-number gutter's scroll position matched to the textarea.
    const syncGutterScroll = (e) => {
        if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop;
    };

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

    /* ---------- Undo/redo history for text mode (manual edits, Align Parameters, etc.) ---------- */
    const resetTextHistory = (content) => {
        textHistoryRef.current = { list: [{ label: 'Opened', content, ts: Date.now() }], index: 0 };
        setHistoryVersion(v => v + 1);
    };

    const pushTextHistory = (label, content) => {
        const h = textHistoryRef.current;
        if (h.list[h.index]?.content === content) return; // no real change — nothing to record
        const truncated = h.list.slice(0, h.index + 1); // drop any redo-able future once a new branch is taken
        textHistoryRef.current = { list: [...truncated, { label, content, ts: Date.now() }], index: h.index + 1 };
        setHistoryVersion(v => v + 1);
    };

    const setRawTextProgrammatic = (content) => {
        skipNextHistorySnapshotRef.current = true;
        setRawText(content);
    };

    const undoText = () => {
        const h = textHistoryRef.current;
        if (h.index <= 0) return;
        textHistoryRef.current = { ...h, index: h.index - 1 };
        setRawTextProgrammatic(h.list[h.index - 1].content);
        setHistoryVersion(v => v + 1);
    };

    const redoText = () => {
        const h = textHistoryRef.current;
        if (h.index >= h.list.length - 1) return;
        textHistoryRef.current = { ...h, index: h.index + 1 };
        setRawTextProgrammatic(h.list[h.index + 1].content);
        setHistoryVersion(v => v + 1);
    };

    const jumpToTextHistory = (idx) => {
        const h = textHistoryRef.current;
        if (idx < 0 || idx >= h.list.length) return;
        textHistoryRef.current = { ...h, index: idx };
        setRawTextProgrammatic(h.list[idx].content);
        setHistoryVersion(v => v + 1);
        setShowTextHistory(false);
    };

    // Manual typing gets a debounced snapshot (once the technician pauses) so
    // every keystroke doesn't create its own history entry. Programmatic
    // changes (align, undo/redo, jump) skip this — they record their own
    // labeled entry explicitly instead.
    useEffect(() => {
        if (viewMode !== 'text' || phase !== 'editing') return;
        if (skipNextHistorySnapshotRef.current) { skipNextHistorySnapshotRef.current = false; return; }
        const t = setTimeout(() => pushTextHistory('Manual edit', rawText), 1500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawText]);

    const runAlign = () => {
        const aligned = alignParameterLines(rawText, selectedFile?.editor);
        setRawTextProgrammatic(aligned);
        pushTextHistory('Align Parameters', aligned);
    };
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
                        {compareSelection.length > 0 && (
                            <div className="mce-compare-bar">
                                <span>
                                    Compare: {compareSelection.map(f => f.name).join('  vs  ')}
                                    {compareSelection.length < 2 && ' — pick one more file'}
                                </span>
                                <div className="mce-cand-actions" style={{ width: 'auto', marginTop: 0 }}>
                                    <button className="mce-btn primary" disabled={compareSelection.length !== 2 || compareLoading} onClick={runComparison}>
                                        {compareLoading ? 'Comparing...' : 'Compare Selected Files'}
                                    </button>
                                    <button className="mce-btn" onClick={() => setCompareSelection([])}>Clear</button>
                                </div>
                            </div>
                        )}

                        {candidates.length > 0 && (
                            <>
                                <p className="mce-hint">Found these machine config files:</p>
                                {candidates.map(c => (
                                    <div key={c.path} className="mce-candidate">
                                        <input
                                            type="checkbox"
                                            className="mce-compare-check"
                                            checked={!!compareSelection.find(f => f.path === c.path)}
                                            onChange={() => toggleCompare(c)}
                                            title="Select to compare with another file"
                                        />
                                        <span className="mce-icon">{c.editor === 'mk' ? '⚙️' : '📄'}</span>
                                        <span className="mce-cand-name">{c.name}</span>
                                        {c.backupLike && <span className="mce-badge">looks like a backup — verify before editing</span>}
                                        <span className="mce-cand-path">{c.path}</span>
                                        <div className="mce-cand-actions">
                                            <button className="mce-btn primary" onClick={() => openFile(c, 'structured')}>Open in Editor</button>
                                            <button className="mce-btn" onClick={() => openFile(c, 'text')}>Open as Text</button>
                                            <button className="mce-btn" onClick={() => copyFile(c)} title="Copy">Copy</button>
                                            <button className="mce-btn" onClick={() => renameFile(c)} title="Rename">Rename</button>
                                            <button className="mce-btn danger" onClick={() => deleteFile(c)} title="Delete">Delete</button>
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
                                        <input
                                            type="checkbox"
                                            className="mce-compare-check"
                                            checked={!!compareSelection.find(f => f.path === item.path)}
                                            onChange={() => toggleCompare(item)}
                                            title="Select to compare with another file"
                                        />
                                        <span>📄 {item.name}</span>
                                        <div className="mce-cand-actions">
                                            <button className="mce-btn primary" onClick={() => pickFile(item, 'structured')}>Open in Editor</button>
                                            <button className="mce-btn" onClick={() => pickFile(item, 'text')}>Open as Text</button>
                                            <button className="mce-btn" onClick={() => copyFile(item)} title="Copy">Copy</button>
                                            <button className="mce-btn" onClick={() => renameFile(item)} title="Rename">Rename</button>
                                            <button className="mce-btn danger" onClick={() => deleteFile(item)} title="Delete">Delete</button>
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
                                        <button className="mce-btn" onClick={undoText} disabled={phase !== 'editing' || textHistoryRef.current.index <= 0} title="Undo">↶ Undo</button>
                                        <button className="mce-btn" onClick={redoText} disabled={phase !== 'editing' || textHistoryRef.current.index >= textHistoryRef.current.list.length - 1} title="Redo">↷ Redo</button>
                                        <button className="mce-btn" onClick={() => setShowTextHistory(s => !s)} title="View change history">History</button>
                                        <button className="mce-btn" onClick={runAlign} disabled={phase !== 'editing'} title="Line up parameter columns neatly">Align Parameters</button>
                                        <button className="mce-btn" onClick={runFormatCheck} disabled={phase !== 'editing'} title="Scan for duplicate keys, typos, and malformed lines">Format Check</button>
                                        <button className="mce-btn primary" onClick={saveTextEdits} disabled={phase !== 'editing'}>Save</button>
                                    </div>
                                </div>
                                {showTextHistory && (
                                    <div className="mce-format-panel">
                                        <div className="mce-format-header">
                                            <span>Edit history (click a step to jump to it)</span>
                                            <button className="mce-close-btn" onClick={() => setShowTextHistory(false)}>✕</button>
                                        </div>
                                        {textHistoryRef.current.list.map((h, i) => {
                                            const prev = textHistoryRef.current.list[i - 1];
                                            const stepDiff = prev ? compareConfigs(prev.content, h.content) : [];
                                            return (
                                                <div
                                                    key={i}
                                                    className={`mce-history-entry ${i === textHistoryRef.current.index ? 'current' : ''}`}
                                                    onClick={() => jumpToTextHistory(i)}
                                                >
                                                    <div className="mce-format-issue mce-history-step">
                                                        <span className="mce-format-line">{i === textHistoryRef.current.index ? '● ' : ''}{new Date(h.ts).toLocaleTimeString()}</span>
                                                        <span>{h.label}</span>
                                                    </div>
                                                    {stepDiff.length > 0 && (
                                                        <div className="mce-history-diff">
                                                            {stepDiff.slice(0, 8).map((c) => (
                                                                <span key={c.key} className="mce-history-diff-item">
                                                                    <span className="mce-diff-key">{c.key}</span>
                                                                    {c.status !== 'onlyB' && <span className="mce-diff-old">{c.valueA ?? '(none)'}</span>}
                                                                    {c.status === 'different' && <span className="mce-diff-arrow">→</span>}
                                                                    {c.status !== 'onlyA' && <span className="mce-diff-new">{c.valueB ?? '(none)'}</span>}
                                                                </span>
                                                            ))}
                                                            {stepDiff.length > 8 && <span className="mce-hint">+{stepDiff.length - 8} more</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
                                <div className="mce-textarea-wrap">
                                    <pre ref={gutterRef} className="mce-line-gutter">{lineNumbers}</pre>
                                    <textarea
                                        ref={textareaRef}
                                        className="mce-textarea"
                                        value={rawText}
                                        onChange={(e) => setRawText(e.target.value)}
                                        onKeyDown={handleTextareaKeyDown}
                                        onScroll={syncGutterScroll}
                                        spellCheck={false}
                                        disabled={phase !== 'editing'}
                                    />
                                </div>
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

                {compareResult && (
                    <div className="mce-history-overlay" onClick={() => setCompareResult(null)}>
                        <div className="mce-compare-box" onClick={(e) => e.stopPropagation()}>
                            <div className="mce-format-header">
                                <span>{compareResult.rows.length} difference{compareResult.rows.length !== 1 ? 's' : ''}</span>
                                <div className="mce-cand-actions" style={{ width: 'auto', marginTop: 0 }}>
                                    <button className="mce-btn primary" onClick={copyDifferencesToClipboard}>Copy Differences to Clipboard</button>
                                    <button className="mce-close-btn" onClick={() => setCompareResult(null)}>✕</button>
                                </div>
                            </div>
                            <div className="mce-compare-columns">
                                <div className="mce-compare-col-header">{compareResult.fileA.name}</div>
                                <div className="mce-compare-col-header">{compareResult.fileB.name}</div>
                            </div>
                            <div className="mce-compare-rows">
                                {compareResult.rows.length === 0 && (
                                    <div className="mce-hint" style={{ padding: 14 }}>No differences found — every recognized parameter matches.</div>
                                )}
                                {compareResult.rows.map(r => (
                                    <div key={r.key} className={`mce-compare-row ${r.status}`}>
                                        <span className="mce-compare-key">{r.key}</span>
                                        <span className="mce-compare-val a">{r.valueA ?? '(missing)'}</span>
                                        <span className="mce-compare-val b">{r.valueB ?? '(missing)'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
