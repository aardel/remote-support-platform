/**
 * Session control panel – communicates with SessionView (parent/tab) via BroadcastChannel.
 * Commands: switch-monitor, set-quality, toggle-split, exit-fullscreen, disconnect.
 * Listens for state-update from SessionView.
 */

(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  if (!sessionId) {
    document.body.innerHTML = '<p style="padding:16px;color:#ef4444">Missing sessionId in URL.</p>';
    return;
  }

  const CHANNEL_NAME = 'session-control-' + sessionId;
  const channel = new BroadcastChannel(CHANNEL_NAME);

  const SIZES = {
    controls: { w: 280, h: 340 },
    chat: { w: 280, h: 580 },
    files: { w: 420, h: 620 },
    both: { w: 420, h: 750 },
    minimized: { w: 60, h: 40 }
  };

  const sessionLabel = document.getElementById('sessionLabel');
  const monitorSelect = document.getElementById('monitorSelect');
  const qualitySelect = document.getElementById('qualitySelect');
  const splitViewToggle = document.getElementById('splitViewToggle');
  const chatToggleBtn = document.getElementById('chatToggleBtn');
  const filesToggleBtn = document.getElementById('filesToggleBtn');
  const chatSection = document.getElementById('chatSection');
  const filesSection = document.getElementById('filesSection');
  const chatBadge = document.getElementById('chatBadge');
  const chatMessages = document.getElementById('chatMessages');
  const chatEmpty = document.getElementById('chatEmpty');
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const filesPath = document.getElementById('filesPath');
  const filesList = document.getElementById('filesList');
  const filesUpBtn = document.getElementById('filesUpBtn');
  const filesRefreshBtn = document.getElementById('filesRefreshBtn');
  const filesAddBtn = document.getElementById('filesAddBtn');
  const filesSendBtn = document.getElementById('filesSendBtn');
  const filesReceiveBtn = document.getElementById('filesReceiveBtn');
  const minimizeBtn = document.getElementById('minimizeBtn');
  const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const normalView = document.getElementById('normalView');
  const minimizedView = document.getElementById('minimizedView');
  const expandBtn = document.getElementById('expandBtn');

  sessionLabel.textContent = sessionId;
  document.title = 'Controls — ' + sessionId;

  let chatOpen = false;
  let filesOpen = false;
  let minimized = false;
  let socket = null;

  function resizePanel() {
    if (!window.opener) return;
    let w, h;
    if (minimized) {
      w = SIZES.minimized.w;
      h = SIZES.minimized.h;
    } else if (chatOpen && filesOpen) {
      w = SIZES.both.w;
      h = SIZES.both.h;
    } else if (filesOpen) {
      w = SIZES.files.w;
      h = SIZES.files.h;
    } else if (chatOpen) {
      w = SIZES.chat.w;
      h = SIZES.chat.h;
    } else {
      w = SIZES.controls.w;
      h = SIZES.controls.h;
    }
    window.resizeTo(w, h);
  }

  function setChatOpen(open) {
    chatOpen = open;
    chatSection.style.display = open ? 'flex' : 'none';
    chatToggleBtn.classList.toggle('open', open);
    resizePanel();
  }

  function setFilesOpen(open) {
    filesOpen = open;
    filesSection.style.display = open ? 'flex' : 'none';
    filesToggleBtn.classList.toggle('open', open);
    if (open) refreshFilesList();
    resizePanel();
  }

  function setMinimized(min) {
    minimized = min;
    normalView.style.display = min ? 'none' : 'flex';
    minimizedView.style.display = min ? 'flex' : 'none';
    resizePanel();
  }

  chatToggleBtn.addEventListener('click', () => setChatOpen(!chatOpen));
  filesToggleBtn.addEventListener('click', () => setFilesOpen(!filesOpen));
  minimizeBtn.addEventListener('click', () => setMinimized(true));
  expandBtn.addEventListener('click', () => setMinimized(false));

  monitorSelect.addEventListener('change', () => {
    const index = parseInt(monitorSelect.value, 10);
    channel.postMessage({ type: 'switch-monitor', index });
  });

  qualitySelect.addEventListener('change', () => {
    const quality = qualitySelect.value;
    channel.postMessage({ type: 'set-quality', quality });
    if (socket) socket.emit('set-stream-quality', { sessionId, quality });
  });

  splitViewToggle.addEventListener('change', () => {
    channel.postMessage({ type: 'toggle-split', enabled: splitViewToggle.checked });
  });

  exitFullscreenBtn.addEventListener('click', () => {
    channel.postMessage({ type: 'exit-fullscreen' });
  });

  disconnectBtn.addEventListener('click', () => {
    channel.postMessage({ type: 'disconnect' });
  });

  window.addEventListener('beforeunload', () => {
    channel.postMessage({ type: 'exit-fullscreen' });
  });

  function applyDisplayCount(displayCount) {
    const opts = monitorSelect.options;
    for (let i = 0; i < opts.length; i++) {
      const value = parseInt(opts[i].value, 10);
      const active = displayCount == null || value < displayCount;
      opts[i].disabled = !active;
      opts[i].textContent = 'Monitor ' + (value + 1) + (active ? '' : ' (not available)');
    }
    const cur = parseInt(monitorSelect.value, 10);
    if (typeof displayCount === 'number' && displayCount > 0 && cur >= displayCount) {
      monitorSelect.value = String(Math.max(0, displayCount - 1));
    }
  }

  channel.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'state-update') {
      if (msg.displayCount !== undefined) applyDisplayCount(msg.displayCount);
      if (msg.monitorIndex !== undefined) monitorSelect.value = String(msg.monitorIndex);
      if (msg.streamQuality !== undefined) qualitySelect.value = msg.streamQuality;
      if (msg.splitView !== undefined) splitViewToggle.checked = msg.splitView;
      if (msg.chatUnread !== undefined) {
        if (msg.chatUnread > 0) {
          chatBadge.textContent = msg.chatUnread;
          chatBadge.style.display = 'inline-block';
        } else {
          chatBadge.style.display = 'none';
        }
      }
    }
    if (msg.type === 'files-remote-list') {
      renderFilesList(msg.list || [], msg.path);
    }
  };

  // Socket for quality + chat
  socket = io(window.location.origin);
  socket.on('connect', () => {
    // Control panel is not the actual viewer. Track as technician presence only.
    const technicianId = params.get('technicianId') || undefined;
    const technicianName = params.get('technicianName') || undefined;
    socket.emit('join-session', { sessionId, role: 'technician-panel', technicianId, technicianName });
  });

  function addChatMessage(msg) {
    if (chatEmpty) chatEmpty.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'cp-chat-msg ' + (msg.role === 'technician' ? 'from-tech' : 'from-user');
    const text = document.createElement('div');
    text.textContent = msg.message;
    div.appendChild(text);
    const time = document.createElement('div');
    time.className = 'cp-chat-msg-time';
    time.textContent = new Date(msg.timestamp || Date.now()).toLocaleTimeString();
    div.appendChild(time);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  socket.on('chat-message', (data) => {
    addChatMessage(data);
  });

  function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (!msg || !sessionId) return;
    const data = { sessionId, message: msg, role: 'technician', timestamp: Date.now() };
    socket.emit('chat-message', data);
    addChatMessage(data);
    chatInput.value = '';
    chatInput.focus();
  }

  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // Files: request list from parent via channel (parent will use existing API/socket)
  function refreshFilesList() {
    channel.postMessage({ type: 'files-list-remote', path: filesPath.textContent || 'Home' });
  }

  function renderFilesList(list, path) {
    filesPath.textContent = path || 'Home';
    filesUpBtn.disabled = !path || path === 'Home';
    filesList.innerHTML = '';
    (list || []).forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'cp-files-item';
      const icon = entry.isDirectory ? '📁' : '📄';
      div.innerHTML = '<span class="icon">' + icon + '</span><span>' + escapeHtml(entry.name) + '</span>';
      if (entry.isDirectory) {
        div.addEventListener('click', () => {
          const nextPath = path ? path + '/' + entry.name : entry.name;
          channel.postMessage({ type: 'files-list-remote', path: nextPath });
        });
      }
      filesList.appendChild(div);
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  filesRefreshBtn.addEventListener('click', () => refreshFilesList());
  filesUpBtn.addEventListener('click', () => {
    const path = filesPath.textContent;
    if (path === 'Home') return;
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.length ? parts.join('/') : '';
    channel.postMessage({ type: 'files-list-remote', path: parentPath });
  });

  filesAddBtn.addEventListener('click', () => channel.postMessage({ type: 'open-file-picker' }));

  filesSendBtn.addEventListener('click', () => channel.postMessage({ type: 'files-send' }));
  filesReceiveBtn.addEventListener('click', () => channel.postMessage({ type: 'files-receive' }));

  // Initial size
  resizePanel();
})();
