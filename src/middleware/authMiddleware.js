import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Sign a JWT token for any user (admin or employee)
 * @param {Object} user - User object with _id and username
 * @param {string} role - 'admin' or 'employee'
 * @returns {string} JWT token
 */
export function signToken(user, role) {
  const payload = {
    id: user._id.toString(),
    username: user.username,
    role: role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Middleware to require any authenticated user (admin or employee)
 */
export function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized', detail: 'Invalid or expired token' });
  }
}

/**
 * Middleware to require admin role only
 */
export function requireAdmin(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', detail: 'Admin access required' });
    }
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
    // Also set req.admin for backward compatibility
    req.admin = {
      id: payload.id,
      username: payload.username,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized', detail: 'Invalid or expired token' });
  }
}

/**
 * Middleware to require employee role only
 */
export function requireEmployee(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', detail: 'Missing Authorization token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'employee') {
      return res.status(403).json({ error: 'Forbidden', detail: 'Employee access required' });
    }
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized', detail: 'Invalid or expired token' });
  }
}
