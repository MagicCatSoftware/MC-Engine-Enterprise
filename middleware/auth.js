const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

function isAdmin(user) {
  return !!(user && ADMIN_EMAILS.has((user.email || '').toLowerCase()));
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

function requireSubscription(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  if (isAdmin(req.user)) return next();
  if (req.user.subscriptionStatus !== 'active') {
    return res.status(403).json({ error: 'Active subscription required', code: 'NO_SUBSCRIPTION' });
  }
  next();
}

module.exports = { requireLogin, requireSubscription, isAdmin };
