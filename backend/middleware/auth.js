const jwt = require('jsonwebtoken');

const PUBLIC_DEPARTMENT_PATHS = [
  /^\/ocr-machine(?:\/.*)?$/i,
  /^\/api\/ocr-machine(?:\/.*)?$/i,
  /^\/drawframe\/(?:wrapping\/)?(?:drawframe\/)?a-percent(?:-inspection)?(?:\/.*)?$/i,
  /^\/drawframe\/(?:wrapping\/)?(?:drawframe\/)?stretch-percent(?:-inspection)?(?:\/.*)?$/i,
  /^\/drawframe\/(?:wrapping\/)?(?:drawframe\/)?stretch-percentage(?:\/.*)?$/i,
  /^\/drawframe\/(?:wrapping\/)?(?:drawframe\/)?comber-noil-percent(?:-inspection)?(?:\/.*)?$/i,
  /^\/drawframe\/(?:wrapping\/)?(?:drawframe\/)?noil-percent(?:\/.*)?$/i,
  /^\/drawframe\/(?:wrapping\/)?(?:drawframe\/)?noils-percent(?:\/.*)?$/i,
  /^\/drawframe\/(?:wrapping\/)?drawframe-notebook(?:\/.*)?$/i,
  /^\/drawframe\/wrapping-drawframe-notebook(?:\/.*)?$/i,
  /^\/drawframe\/drawframe-notebook\/wrapping(?:\/.*)?$/i,
  /^\/drawframe\/(?:yarn-cv|yarn-cv-percent|one-yard-half-yard-cv|one-yard-half-yard-cv-entry|1-yard-half-yard-cv)(?:\/.*)?$/i,
  /^\/drawframe\/yarn-cv\/(?:machine-numbers|master\/.*)(?:\/.*)?$/i,
  /^\/autoconer\/(?:master-data|master\/.*|count-master|employee-master)$/i,
  /^\/autoconer\/[^/]+\/master-data$/i,
  /^\/autoconer\/[^/]+\/master\/.*$/i
];

const isPublicDepartmentPath = (path) =>
  PUBLIC_DEPARTMENT_PATHS.some((pattern) => pattern.test(path || ''));

/**
 * Verifies Bearer JWT from Authorization header and attaches decoded payload
 * to req.user. Rejects when token is missing or invalid.
 */
function auth(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (isPublicDepartmentPath(req.path)) {
    req.user = req.user || {
      role: 'Public',
      employee_id: 'PUBLIC'
    };
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Authorization token missing' });
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

module.exports = auth;
