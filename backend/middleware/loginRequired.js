const jwt = require('jsonwebtoken');

/**
 * Ensures requests come from an authenticated user.
 * Looks for a Bearer token, verifies it, and attaches the decoded payload
 * to `req.user`. Rejects missing or invalid tokens with 401.
 */
function loginRequired(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'jwt_secret';
    const decoded = jwt.verify(token, jwtSecret);

    req.user = {
      id: decoded.sub,
      role_id: decoded.role_id,
      role: decoded.role,
      departments: decoded.departments,
      employee_id: decoded.employee_id,
      level: decoded.level
    };

    return next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('JWT verification failed:', err.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = loginRequired;
