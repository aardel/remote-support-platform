const messagesEl = document.getElementById('messages');
const emptyMsg = document.getElementById('emptyMsg');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

function addMessage(msg) {
  if (emptyMsg) emptyMsg.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (msg.role === 'technician' ? 'from-technician' : 'from-user');
  const text = document.createElement('div');
  text.textContent = msg.message;
  div.appendChild(text);
  const time = document.createElement('div');
  time.className = 'chat-msg-time';
  time.textContent = new Date(msg.timestamp || Date.now()).toLocaleTimeString();
  div.appendChild(time);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Receive messages from main process
window.chatApi.onMessage((data) => {
  addMessage(data);
});

// Load history when window opens
window.chatApi.onHistory((messages) => {
  messages.forEach(addMessage);
});
window.chatApi.requestHistory();

function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  window.chatApi.sendMessage(msg);
  chatInput.value = '';
  chatInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

chatInput.focus();
