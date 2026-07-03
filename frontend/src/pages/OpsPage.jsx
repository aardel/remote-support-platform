import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import './PageStyles.css';

function StatCard({ value, label }) {
    return (
        <div className="stat-card">
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}

export default function OpsPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const r = await axios.get('/api/audit/stats?days=7');
            setData(r.data);
        } catch (e) { /* ignore */ }
        finally { setLoading(false); }
    };
    useEffect(() => {
        load();
        const t = setInterval(load, 30000); // refresh live counts
        return () => clearInterval(t);
    }, []);

    const w = data?.week || {};
    const connects = w.session_connected || 0;
    const declines = w.connection_declined || 0;
    const declineRate = connects + declines > 0 ? Math.round((declines / (connects + declines)) * 100) : 0;

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>Operations</h2>
                <span className="page-count">last 7 days</span>
            </div>

            {loading ? <div className="page-empty">Loading…</div> : (
                <>
                    <div className="stats-summary">
                        <StatCard value={data?.activeSessions ?? 0} label="Active sessions" />
                        <StatCard value={`${data?.online ?? 0} / ${data?.devices ?? 0}`} label="Devices online" />
                        <StatCard value={connects} label="Connections (7d)" />
                        <StatCard value={declines} label="Declined (7d)" />
                        <StatCard value={`${declineRate}%`} label="Decline rate" />
                        <StatCard value={w.file_transfer || 0} label="File transfers (7d)" />
                    </div>

                    <div className="page-card" style={{ maxWidth: 520 }}>
                        <div className="card-top"><span style={{ fontWeight: 600 }}>Today</span></div>
                        <div className="card-meta">
                            <span>Helper connects: <strong>{data?.today?.session_connected || 0}</strong></span>
                            <span>Technician joins: <strong>{data?.today?.technician_joined || 0}</strong></span>
                            <span>Declines: <strong>{data?.today?.connection_declined || 0}</strong></span>
                            <span>Files: <strong>{data?.today?.file_transfer || 0}</strong></span>
                        </div>
                        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                            Helper version distribution will appear here once the helper reports its
                            version (next helper release).
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
