/**
 * Axios instance with global 401 handling: shows a re-login modal and redirects to login.
 */
import axios from 'axios';

let sessionExpiredShown = false;

function getLoginUrl() {
  const pathname = window.location.pathname || '';
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  const pathPrefix = firstSegment ? `/${firstSegment}/` : '/';
  return pathPrefix === '/' ? '/api/auth/login' : `${pathPrefix}api/auth/login`;
}

function showSessionExpiredModal(loginUrlFromServer) {
  if (sessionExpiredShown) return;
  sessionExpiredShown = true;

  const loginUrl = loginUrlFromServer && loginUrlFromServer.startsWith('/')
    ? window.location.origin + loginUrlFromServer
    : getLoginUrl();

  const overlay = document.createElement('div');
  overlay.id = 'session-expired-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    padding: 20px;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background: #fff;
    border-radius: 12px;
    padding: 28px 32px;
    max-width: 400px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    text-align: center;
  `;

  box.innerHTML = `
    <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #1e293b;">Session expired</p>
    <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">Your session has timed out. Please log in again to continue.</p>
    <button type="button" id="session-expired-login-btn" style="
      padding: 10px 24px;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    ">Log in again</button>
  `;

  const goToLogin = () => {
    const base = window.location.origin;
    const path = (typeof loginUrl === 'string' && loginUrl.startsWith('/')) ? loginUrl : getLoginUrl();
    window.location.href = path.startsWith('http') ? path : base + path;
  };

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector('#session-expired-login-btn').addEventListener('click', goToLogin);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) goToLogin();
  });
}

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const data = error.response.data || {};
      const loginUrl = data.loginUrl || getLoginUrl();
      showSessionExpiredModal(loginUrl);
    }
    return Promise.reject(error);
  }
);

export default axios;
