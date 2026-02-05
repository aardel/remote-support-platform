const requireAuth = (req, res, next) => {
    const user = req.session?.user;

    if (!user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required.',
            loginUrl: '/api/auth/login'
        });
    }

    req.user = user;
    next();
};

const attachUser = (req, _res, next) => {
    if (req.session?.user) {
        req.user = req.session.user;
    }
    next();
};

module.exports = { requireAuth, attachUser };
