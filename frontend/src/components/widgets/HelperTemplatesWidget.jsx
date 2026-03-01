import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from '../../api/axios';
import WidgetCard from './WidgetCard';

function HelperTemplatesWidget({ size, linkTo }) {
    const [templateStatus, setTemplateStatus] = useState(null);

    useEffect(() => {
        axios.get('/api/packages/templates')
            .then(r => setTemplateStatus(r.data?.templates || null))
            .catch(() => { });
    }, []);

    const exeReady = templateStatus?.exe?.available;
    const dmgReady = templateStatus?.dmg?.available;

    return (
        <WidgetCard title="Helper Templates" size={size} linkTo={linkTo}>
            <div className="widget-row">
                <span>EXE</span>
                <span className={`widget-badge ${exeReady ? 'wb-ok' : 'wb-warn'}`}>
                    {exeReady ? 'Installed' : 'Missing'}
                </span>
            </div>
            <div className="widget-row">
                <span>DMG</span>
                <span className={`widget-badge ${dmgReady ? 'wb-ok' : 'wb-warn'}`}>
                    {dmgReady ? 'Installed' : 'Missing'}
                </span>
            </div>
            <Link to="/helper-templates" className="widget-view-all">Manage &rarr;</Link>
        </WidgetCard>
    );
}

export default HelperTemplatesWidget;
