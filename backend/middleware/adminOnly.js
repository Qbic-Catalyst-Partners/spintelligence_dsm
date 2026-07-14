const jwt = require('jsonwebtoken');

function adminOnly(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Admin authentication required' });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin_jwt_secret'
    );

    if (decoded.auth_type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    req.admin = {
      id: decoded.sub,
      username: decoded.username,
      role: decoded.role
    };

    return next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Admin token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Admin JWT verification failed:', err.message);
    return res.status(401).json({ message: 'Invalid or expired admin token' });
  }
}

module.exports = adminOnly;
