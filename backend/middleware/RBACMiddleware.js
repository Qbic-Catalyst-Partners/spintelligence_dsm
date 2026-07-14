const roles = require('../config/roles.json');

function authorize(permission) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Unauthorized: No role found' });
    }

    const rolePermissions = roles[req.user.role];

    if (!rolePermissions || !rolePermissions[permission]) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
}

module.exports = authorize;
