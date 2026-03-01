import React from 'react';
import { useNavigate } from 'react-router-dom';

function WidgetCard({ title, size = 'medium', children, className = '', linkTo }) {
  const navigate = useNavigate();
  const sizeClass = `widget-${size}`;
  const handleClick = (e) => {
    if (!linkTo) return;
    // Don't navigate if user clicked a button, link, input, or select inside the card
    const tag = e.target.tagName;
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.target.closest('button, a, input, select')) return;
    navigate(linkTo);
  };
  return (
    <div
      className={`widget-card ${sizeClass} ${className} ${linkTo ? 'widget-clickable' : ''}`}
      onClick={handleClick}
      style={linkTo ? { cursor: 'pointer' } : undefined}
    >
      {title && <div className="widget-title">{title}</div>}
      <div className="widget-body">{children}</div>
    </div>
  );
}

export default WidgetCard;
