import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import WidgetCard from './WidgetCard';

function HelperTemplatesWidget({ size }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    axios.get('/api/packages/templates').then(r => setStatus(r.data?.templates || null)).catch(() => {});
  }, []);

  return (
    <WidgetCard title="Helper Templates" size={size}>
      <div className="widget-row">
        <span>EXE</span>
        <span className={`widget-badge ${status?.exe?.available ? 'wb-ok' : 'wb-danger'}`}>{status?.exe?.available ? 'OK' : 'Missing'}</span>
      </div>
      <div className="widget-row">
        <span>DMG</span>
        <span className={`widget-badge ${status?.dmg?.available ? 'wb-ok' : 'wb-danger'}`}>{status?.dmg?.available ? 'OK' : 'Missing'}</span>
      </div>
      <Link to="/helper-templates" className="widget-view-all">Manage &rarr;</Link>
    </WidgetCard>
  );
}

export default HelperTemplatesWidget;
