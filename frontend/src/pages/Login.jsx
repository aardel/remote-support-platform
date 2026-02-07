import React from 'react';
import './Login.css';

function Login() {
  const startLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-logo">
          <img src="/logo.png" alt="Logo" className="login-logo-img" />
        </div>
        <h1>Remote Support</h1>
        <h2>Technician Login</h2>

        <p style={{ marginBottom: '20px', color: '#666' }}>
          Sign in with your Nextcloud account to access the technician dashboard.
        </p>

        <button type="button" onClick={startLogin} className="login-btn">
          Continue with Nextcloud
        </button>

        <p className="register-link">
          Accounts are managed in Nextcloud.
        </p>
      </div>
    </div>
  );
}

export default Login;
