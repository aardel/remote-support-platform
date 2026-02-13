import React, { useState, useEffect, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from '../api/axios';
import GeneratePackageWidget from '../components/widgets/GeneratePackageWidget';
import ActiveSessionsWidget from '../components/widgets/ActiveSessionsWidget';
import RegisteredDevicesWidget from '../components/widgets/RegisteredDevicesWidget';
import HelperTemplatesWidget from '../components/widgets/HelperTemplatesWidget';
import StatsSummaryWidget from '../components/widgets/StatsSummaryWidget';
import RecentActivityWidget from '../components/widgets/RecentActivityWidget';
import QuickConnectWidget from '../components/widgets/QuickConnectWidget';
import ClassicDashboardWidget from '../components/widgets/ClassicDashboardWidget';
import './WidgetDashboard.css';

const WIDGET_TYPES = {
  generate:   { label: 'Generate Package',   component: GeneratePackageWidget, defaultSize: 'medium' },
  sessions:   { label: 'Active Sessions',    component: ActiveSessionsWidget,  defaultSize: 'medium', linkTo: '/sessions' },
  activity:   { label: 'Recent Activity',    component: RecentActivityWidget,  defaultSize: 'medium', linkTo: '/sessions' },
  devices:    { label: 'Registered Devices',  component: RegisteredDevicesWidget, defaultSize: 'medium', linkTo: '/devices' },
  templates:  { label: 'Helper Templates',   component: HelperTemplatesWidget, defaultSize: 'small', linkTo: '/helper-templates' },
  stats:      { label: 'Statistics Summary', component: StatsSummaryWidget,    defaultSize: 'small', linkTo: '/statistics' },
  quickConnect: { label: 'Quick Connect',    component: QuickConnectWidget,    defaultSize: 'small' },
  classic:    { label: 'Classic Dashboard',  component: ClassicDashboardWidget, defaultSize: 'small', linkTo: '/dashboard/classic' },
};

const DEFAULT_LAYOUT = [
  { id: 'generate', type: 'generate', size: 'medium', visible: true },
  { id: 'sessions', type: 'sessions', size: 'medium', visible: true },
  { id: 'activity', type: 'activity', size: 'medium', visible: true },
  { id: 'devices', type: 'devices', size: 'medium', visible: true },
  { id: 'templates', type: 'templates', size: 'small', visible: true },
  { id: 'stats', type: 'stats', size: 'small', visible: true },
  { id: 'quickConnect', type: 'quickConnect', size: 'small', visible: true },
  { id: 'classic', type: 'classic', size: 'small', visible: true },
];

function SortableWidget({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function WidgetDashboard() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [whatsNew, setWhatsNew] = useState(null);
  const [whatsNewVisible, setWhatsNewVisible] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    axios.get('/api/preferences').then(r => {
      if (r.data.dashboardLayout && Array.isArray(r.data.dashboardLayout)) {
        // Merge saved layout with defaults (in case new widgets were added)
        const saved = r.data.dashboardLayout;
        const savedIds = new Set(saved.map(w => w.id));
        const merged = [
          ...saved,
          ...DEFAULT_LAYOUT.filter(w => !savedIds.has(w.id)).map(w => ({ ...w, visible: false }))
        ];
        setLayout(merged);
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  // GitHub "What's New" banner (cached by backend).
  useEffect(() => {
    const seenKey = 'rs_whatsnew_seen_tag';
    axios.get('/api/whats-new').then(r => {
      const data = r.data || null;
      if (!data || !data.tag) return;
      const seen = localStorage.getItem(seenKey);
      setWhatsNew(data);
      setWhatsNewVisible(seen !== data.tag);
    }).catch(() => {});
  }, []);

  const saveLayout = useCallback(async (newLayout) => {
    setLayout(newLayout);
    try {
      await axios.put('/api/preferences', { dashboardLayout: newLayout });
    } catch (_) {}
  }, []);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = layout.findIndex(w => w.id === active.id);
      const newIndex = layout.findIndex(w => w.id === over.id);
      const newLayout = arrayMove(layout, oldIndex, newIndex);
      saveLayout(newLayout);
    }
  };

  const toggleVisible = (id) => {
    const newLayout = layout.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
    saveLayout(newLayout);
  };

  const changeSize = (id, size) => {
    const newLayout = layout.map(w => w.id === id ? { ...w, size } : w);
    saveLayout(newLayout);
  };

  const visibleWidgets = layout.filter(w => w.visible);

  // Generate modal trigger (passed to GeneratePackageWidget; also available via header)
  const openGenerate = () => {
    // Dispatch a custom event that App.jsx listens for
    window.dispatchEvent(new CustomEvent('open-generate-modal'));
  };

  if (!loaded) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading dashboard...</div>;

  return (
    <div className="wd-container">
      {whatsNewVisible && whatsNew?.tag && (
        <div className="wd-whatsnew">
          <div className="wd-whatsnew-main">
            <div className="wd-whatsnew-title">
              What's New: {whatsNew.name || whatsNew.tag}
            </div>
            {whatsNew.body && (
              <div className="wd-whatsnew-body">
                {String(whatsNew.body).split('\n').filter(Boolean).slice(0, 2).join(' ')}
              </div>
            )}
          </div>
          <button
            className="wd-whatsnew-btn"
            type="button"
            onClick={() => {
              localStorage.setItem('rs_whatsnew_seen_tag', whatsNew.tag);
              setWhatsNewVisible(false);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="wd-header">
        <h2>Dashboard</h2>
        <button className={`wd-customize-btn ${editing ? 'active' : ''}`} onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Customize'}
        </button>
      </div>

      {editing && (
        <div className="wd-edit-panel">
          <p className="wd-edit-hint">Drag to reorder. Toggle visibility and resize below.</p>
          <div className="wd-edit-list">
            {layout.map(w => (
              <div key={w.id} className="wd-edit-row">
                <label className="wd-edit-check">
                  <input type="checkbox" checked={w.visible} onChange={() => toggleVisible(w.id)} />
                  <span>{WIDGET_TYPES[w.type]?.label || w.type}</span>
                </label>
                <select value={w.size} onChange={e => changeSize(w.id, e.target.value)} className="wd-edit-size">
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
          <div className="wd-grid">
            {visibleWidgets.map(w => {
              const widgetDef = WIDGET_TYPES[w.type];
              const WidgetComp = widgetDef?.component;
              if (!WidgetComp) return null;
              const props = { size: w.size, linkTo: widgetDef.linkTo };
              if (w.type === 'generate') props.onGenerate = openGenerate;
              return editing ? (
                <SortableWidget key={w.id} id={w.id}>
                  <WidgetComp {...props} />
                </SortableWidget>
              ) : (
                <div key={w.id}>
                  <WidgetComp {...props} />
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export default WidgetDashboard;
