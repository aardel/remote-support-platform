import React from 'react';
import WidgetCard from './WidgetCard';

function GeneratePackageWidget({ size, onGenerate }) {
  return (
    <WidgetCard title="Generate Package" size={size}>
      <p className="widget-desc">Create a new support session and get a shareable link.</p>
      <button className="widget-btn widget-btn-primary" onClick={onGenerate}>+ Generate Support Package</button>
    </WidgetCard>
  );
}

export default GeneratePackageWidget;
