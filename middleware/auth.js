function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

function requireSubscription(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  if (req.user.subscriptionStatus !== 'active') {
    return res.status(403).json({ error: 'Active subscription required', code: 'NO_SUBSCRIPTION' });
  }
  next();
}

module.exports = { requireLogin, requireSubscription };
