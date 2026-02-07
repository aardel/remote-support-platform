import React from 'react';

function WidgetCard({ title, size = 'medium', children, className = '' }) {
  const sizeClass = `widget-${size}`;
  return (
    <div className={`widget-card ${sizeClass} ${className}`}>
      {title && <div className="widget-title">{title}</div>}
      <div className="widget-body">{children}</div>
    </div>
  );
}

export default WidgetCard;
