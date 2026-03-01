import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from '../../api/axios';
import WidgetCard from './WidgetCard';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isOffline(device) {
  if (!device.last_seen) return true;
  return Date.now() - new Date(device.last_seen).getTime() > OFFLINE_THRESHOLD_MS;
}

function RegisteredDevicesWidget({ size, linkTo }) {
  const [devices, setDevices] = useState([]);
  const [waking, setWaking] = useState({});
  const [wakeStatus, setWakeStatus] = useState({});
  const limit = size === 'large' ? 5 : size === 'medium' ? 3 : 0;

  useEffect(() => {
    axios.get('/api/devices').then(r => setDevices(r.data.devices || [])).catch(() => { });
  }, []);

  const handleWake = useCallback(async (deviceId, e) => {
    e.stopPropagation();
    setWaking(prev => ({ ...prev, [deviceId]: true }));
    setWakeStatus(prev => ({ ...prev, [deviceId]: null }));
    try {
      await axios.post(`/api/devices/${deviceId}/wake`);
      setWakeStatus(prev => ({ ...prev, [deviceId]: 'sent' }));
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed';
      setWakeStatus(prev => ({ ...prev, [deviceId]: msg }));
    } finally {
      setWaking(prev => ({ ...prev, [deviceId]: false }));
      setTimeout(() => setWakeStatus(prev => ({ ...prev, [deviceId]: null })), 4000);
    }
  }, []);

  return (
    <WidgetCard title="Registered Devices" size={size} linkTo={linkTo}>
      <div className="widget-stat">{devices.length}</div>
      {limit > 0 && devices.slice(0, limit).map(d => {
        const offline = isOffline(d);
        const hasWol = !!d.mac_address;
        const status = wakeStatus[d.device_id];
        return (
          <div key={d.device_id} className="widget-row">
            <span className={`widget-row-status ${offline ? 'status-offline' : 'status-online'}`} title={offline ? 'Offline' : 'Online'} />
            <span className="widget-row-id">{d.customer_name || d.display_name || d.hostname || d.device_id}</span>
            {status && <span className={`widget-row-meta ${status === 'sent' ? 'wol-ok' : 'wol-err'}`}>{status === 'sent' ? 'WOL sent ✓' : status}</span>}
            {offline && hasWol && !status && (
              <button
                className="widget-link-btn wol-btn"
                onClick={(e) => handleWake(d.device_id, e)}
                disabled={waking[d.device_id]}
                title="Send Wake-on-LAN packet"
              >
                {waking[d.device_id] ? '⏳' : '⏻ Wake'}
              </button>
            )}
            {!offline && <span className="widget-row-meta">{d.os || ''}</span>}
          </div>
        );
      })}
      <Link to="/devices" className="widget-view-all">View all &rarr;</Link>
    </WidgetCard>
  );
}

export default RegisteredDevicesWidget;

