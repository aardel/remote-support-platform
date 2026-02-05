import React from 'react';
import './Login.css';

function Register() {
  const goToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🔧 Remote Support</h1>
        <h2>Accounts Managed in Nextcloud</h2>

        <p style={{ marginBottom: '20px', color: '#666' }}>
          Technician accounts are managed through Nextcloud. If you need access,
          ask your administrator to add you there.
        </p>

        <button type="button" onClick={goToLogin} className="login-btn">
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default Register;
