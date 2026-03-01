function getLoginPath() {
    // When behind a path proxy (e.g. /remote), use same path for login
    const serverUrl = process.env.SERVER_URL || process.env.SUPPORT_URL || '';
    const match = serverUrl.match(/^(https?:\/\/[^/]+)(\/[^/]+)/);
    if (match) return match[2] + '/api/auth/login';
    return '/api/auth/login';
}

/** When behind workspace proxy: trust X-User-Id and X-Display-Name (set by nginx auth_request) */
function trustedProxyUser(req) {
    const id = req.headers['x-user-id'];
    if (!id) return null;
    return {
        id,
        displayName: req.headers['x-display-name'] || id,
        email: null
    };
}

const requireAuth = (req, res, next) => {
    const proxyUser = trustedProxyUser(req);
    if (proxyUser) {
        req.session.user = proxyUser;
        req.user = proxyUser;
        return next();
    }
    const user = req.session?.user;

    if (!user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required. Please log in.',
            loginUrl: getLoginPath()
        });
    }

    req.user = user;
    next();
};

const attachUser = (req, _res, next) => {
    const proxyUser = trustedProxyUser(req);
    if (proxyUser) {
        req.session.user = proxyUser;
        req.user = proxyUser;
        return next();
    }
    if (req.session?.user) {
        req.user = req.session.user;
    }
    next();
};

module.exports = { requireAuth, attachUser };
