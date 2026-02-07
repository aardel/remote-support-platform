import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import WidgetCard from './WidgetCard';

function RegisteredDevicesWidget({ size }) {
  const [devices, setDevices] = useState([]);
  const limit = size === 'large' ? 5 : size === 'medium' ? 3 : 0;

  useEffect(() => {
    axios.get('/api/devices').then(r => setDevices(r.data.devices || [])).catch(() => {});
  }, []);

  return (
    <WidgetCard title="Registered Devices" size={size}>
      <div className="widget-stat">{devices.length}</div>
      {limit > 0 && devices.slice(0, limit).map(d => (
        <div key={d.device_id} className="widget-row">
          <span className="widget-row-id">{d.customer_name || d.display_name || d.hostname || d.device_id}</span>
          <span className="widget-row-meta">{d.os || ''}</span>
        </div>
      ))}
      <Link to="/devices" className="widget-view-all">View all &rarr;</Link>
    </WidgetCard>
  );
}

export default RegisteredDevicesWidget;
