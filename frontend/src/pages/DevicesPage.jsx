import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PageStyles.css';

function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editCustomer, setEditCustomer] = useState('');
  const [editMachine, setEditMachine] = useState('');
  const [requestingDevice, setRequestingDevice] = useState(null);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const res = await axios.get('/api/devices');
      setDevices(res.data.devices || []);
    } catch (e) {
      console.error('Error loading devices:', e);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (device) => {
    setEditingId(device.device_id);
    setEditCustomer(device.customer_name || '');
    setEditMachine(device.machine_name || '');
  };

  const saveEdit = async (deviceId) => {
    try {
      await axios.patch(`/api/devices/${deviceId}`, { customerName: editCustomer, machineName: editMachine });
      setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, customer_name: editCustomer, machine_name: editMachine } : d));
      setEditingId(null);
    } catch (e) {
      alert('Error saving: ' + (e.response?.data?.error || e.message));
    }
  };

  const deregister = async (deviceId, label) => {
    if (!confirm(`Deregister "${label}"?`)) return;
    try {
      await axios.delete(`/api/devices/${deviceId}`);
      setDevices(prev => prev.filter(d => d.device_id !== deviceId));
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  };

  const requestSession = async (deviceId) => {
    setRequestingDevice(deviceId);
    try {
      const res = await axios.post(`/api/devices/${deviceId}/request`);
      if (res.data.success) alert('Session requested. Ask the user to open the helper.');
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    } finally {
      setRequestingDevice(null);
    }
  };

  const filtered = devices.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [d.customer_name, d.machine_name, d.display_name, d.hostname, d.device_id, d.os, d.last_ip, d.last_city, d.last_country]
      .some(v => (v || '').toLowerCase().includes(q));
  });

  const geoLabel = (d) => [d.last_city, d.last_region, d.last_country].filter(Boolean).join(', ');

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Registered Devices</h2>
        <span className="page-count">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="page-toolbar">
        <input
          type="text"
          placeholder="Search devices..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="page-search"
        />
      </div>
      {loading ? (
        <div className="page-empty">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="page-empty">{search ? 'No devices match your search.' : 'No registered devices yet. Devices appear when a customer runs the helper.'}</div>
      ) : (
        <div className="page-table-wrap">
          <table className="page-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Machine</th>
                <th>Hostname</th>
                <th>OS</th>
                <th>IP</th>
                <th>Location</th>
                <th>Last Seen</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.device_id}>
                  <td>
                    {editingId === d.device_id ? (
                      <input className="inline-edit" value={editCustomer} onChange={e => setEditCustomer(e.target.value)} placeholder="Customer name" />
                    ) : (
                      d.customer_name || <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {editingId === d.device_id ? (
                      <input className="inline-edit" value={editMachine} onChange={e => setEditMachine(e.target.value)} placeholder="Machine name" />
                    ) : (
                      d.machine_name || d.display_name || <span className="muted">—</span>
                    )}
                  </td>
                  <td>{d.hostname || '—'}</td>
                  <td>{d.os || '—'}</td>
                  <td className="mono">{d.last_ip || '—'}</td>
                  <td>{geoLabel(d) || '—'}</td>
                  <td>{d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Never'}</td>
                  <td>
                    <span className={`badge ${d.pending_session_id ? 'badge-warn' : 'badge-ok'}`}>
                      {d.pending_session_id ? 'Pending' : 'Ready'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    {editingId === d.device_id ? (
                      <>
                        <button className="btn-sm btn-primary" onClick={() => saveEdit(d.device_id)}>Save</button>
                        <button className="btn-sm btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-sm btn-secondary" onClick={() => startEdit(d)}>Edit</button>
                        <button className="btn-sm btn-primary" onClick={() => requestSession(d.device_id)} disabled={requestingDevice === d.device_id}>
                          {requestingDevice === d.device_id ? '...' : 'Request'}
                        </button>
                        <button className="btn-sm btn-danger" onClick={() => deregister(d.device_id, d.customer_name || d.hostname || d.device_id)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default DevicesPage;
