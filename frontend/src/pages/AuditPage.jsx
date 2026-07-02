import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import './PageStyles.css';

// Human labels + badge style per event type (reusing shared .badge-* classes).
const EVENTS = {
    session_connected: { label: 'Helper connected', cls: 'badge-ok' },
    technician_joined: { label: 'Technician joined', cls: 'badge-neutral' },
    connection_declined: { label: 'Declined by user', cls: 'badge-warn' },
    file_transfer: { label: 'File transfer', cls: 'badge-neutral' },
    session_ended: { label: 'Session ended', cls: 'badge-neutral' },
};

function detailText(ev) {
    const d = ev.detail || {};
    if (ev.event === 'file_transfer') return `${d.name || 'file'} (${d.direction || ''})`;
    if (ev.event === 'session_connected') return `${d.attended ? 'attended' : 'unattended'}${d.os ? ' · ' + d.os : ''}`;
    return '';
}

export default function AuditPage() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const navigate = useNavigate();

    const load = async () => {
        try {
            const r = await axios.get('/api/audit/recent?limit=300');
            setEvents(r.data.events || []);
        } catch (e) { /* ignore */ }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = events.filter(e => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (e.session_id || '').toLowerCase().includes(q)
            || (e.actor || '').toLowerCase().includes(q)
            || (e.event || '').toLowerCase().includes(q);
    });

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>Audit Log</h2>
                <span className="page-count">{filtered.length} events</span>
            </div>

            <div className="page-toolbar">
                <input className="page-search" placeholder="Search session / user / event"
                    value={search} onChange={e => setSearch(e.target.value)} />
                <button className="btn-sm btn-secondary" onClick={load}>Refresh</button>
            </div>

            {loading ? <p className="muted">Loading…</p> : filtered.length === 0 ? (
                <div className="page-empty">No audit events yet.</div>
            ) : (
                <div className="page-table-wrap">
                    <table className="page-table">
                        <thead>
                            <tr><th>Time</th><th>Event</th><th>Session</th><th>Who</th><th>Details</th></tr>
                        </thead>
                        <tbody>
                            {filtered.map(e => {
                                const meta = EVENTS[e.event] || { label: e.event, cls: 'badge-neutral' };
                                return (
                                    <tr key={e.id}>
                                        <td className="mono">{new Date(e.created_at).toLocaleString()}</td>
                                        <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                                        <td className="mono">
                                            {e.session_id
                                                ? <button className="link-like" onClick={() => navigate(`/session/${e.session_id}`)}>{e.session_id}</button>
                                                : '—'}
                                        </td>
                                        <td>{e.actor || '—'}</td>
                                        <td className="muted">{detailText(e)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
