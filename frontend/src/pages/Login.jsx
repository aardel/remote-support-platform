import React from 'react';

const BASE = '/remote';

export default function Login() {
    const handleLogin = () => {
        window.location.href = `${BASE}/api/auth/login`;
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h1>Remote Support</h1>
                <h2>Technician Login</h2>
                <p style={{ marginBottom: '20px', color: '#666' }}>
                    Sign in with your Nextcloud account to access the technician dashboard.
                </p>
                <button type="button" onClick={handleLogin} className="login-btn">
                    Continue with Nextcloud
                </button>
                <p className="register-link">Accounts are managed in Nextcloud.</p>
            </div>
        </div>
    );
}
