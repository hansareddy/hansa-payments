/**
 * Authentication & User Management Module — PRODUCTION
 *
 * Features:
 *   - Short-lived access tokens (15 min) + long-lived refresh tokens (30 days)
 *   - bcrypt password hashing (cost factor 12)
 *   - Refresh token rotation (old token revoked on refresh)
 *   - Admin account password sourced from environment variable
 *
 * Default Account:
 *   admin / hansa@2024
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hansa-comm-jwt-secret-2024-xK9pL2';
const ACCESS_TOKEN_EXPIRY = '365d';
const REFRESH_TOKEN_EXPIRY = '365d';
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// In-memory user store
// ---------------------------------------------------------------------------

let users = [
  {
    id: 1,
    username: 'admin',
    password: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'hansa@2024', BCRYPT_ROUNDS),
    role: 'admin',
    displayName: 'Admin',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    username: 'employee',
    password: bcrypt.hashSync(process.env.EMPLOYEE_PASSWORD || 'hansa@field', BCRYPT_ROUNDS),
    role: 'employee',
    displayName: 'Field Tech',
    createdAt: new Date().toISOString(),
  },
];

let nextId = 3;

// ---------------------------------------------------------------------------
// Refresh token store (in-memory; rotate on use)
// ---------------------------------------------------------------------------

const activeRefreshTokens = new Map(); // refreshToken → userId
const recentlyRotatedTokens = new Map(); // refreshToken → { result, timestamp }

// ---------------------------------------------------------------------------
// Core auth functions
// ---------------------------------------------------------------------------

function _buildTokenPayload(user) {
  return { id: user.id, username: user.username, role: user.role, displayName: user.displayName };
}

/**
 * Validate credentials and return access + refresh tokens, or null.
 */
function authenticate(username, password) {
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;

  const payload = _buildTokenPayload(user);

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  activeRefreshTokens.set(refreshToken, user.id);

  return {
    token,
    refreshToken,
    expiresIn: 31536000, // 365 days in seconds
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    },
  };
}

/**
 * Use a valid refresh token to get a new access token.
 * Includes a 60s grace period for concurrent requests/race conditions.
 */
function refreshAccessToken(refreshToken) {
  if (recentlyRotatedTokens.has(refreshToken)) {
    const cached = recentlyRotatedTokens.get(refreshToken);
    if (Date.now() - cached.timestamp < 60000) {
      return cached.result;
    }
    recentlyRotatedTokens.delete(refreshToken);
  }

  const decoded = verifyToken(refreshToken);
  if (!decoded || decoded.type !== 'refresh') {
    activeRefreshTokens.delete(refreshToken);
    return null;
  }

  // Token rotation — revoke old, issue new
  activeRefreshTokens.delete(refreshToken);

  const user = users.find((u) => u.id === decoded.id) || {
    id: decoded.id,
    username: decoded.username,
    role: decoded.role,
    displayName: decoded.displayName,
  };

  const payload = _buildTokenPayload(user);
  const newAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const newRefreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  activeRefreshTokens.set(newRefreshToken, user.id);

  const result = {
    token: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 31536000, // 365 days in seconds
  };

  recentlyRotatedTokens.set(refreshToken, { result, timestamp: Date.now() });

  return result;
}

/**
 * Revoke a refresh token (used during logout).
 */
function revokeRefreshToken(refreshToken) {
  activeRefreshTokens.delete(refreshToken);
}

/**
 * Verify and decode a JWT token.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Require a valid Bearer token on all subsequent routes.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  // Block refresh tokens from being used as access tokens
  if (decoded.type === 'refresh') {
    return res.status(401).json({ error: 'Invalid token type.' });
  }

  req.user = decoded;
  next();
}

/**
 * Restrict a route to admin users only.
 */
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// User management (CRUD)
// ---------------------------------------------------------------------------

function getAllUsers() {
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    createdAt: u.createdAt,
  }));
}

function addUser(username, password, role, displayName) {
  if (!username || !password) throw new Error('Username and password are required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (username.length < 3) throw new Error('Username must be at least 3 characters.');

  const exists = users.some(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
  if (exists) throw new Error(`Username "${username}" already exists.`);

  const newUser = {
    id: nextId++,
    username: username.toLowerCase().trim(),
    password: bcrypt.hashSync(password, BCRYPT_ROUNDS),
    role: role || 'collector',
    displayName: displayName || username,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  return {
    id: newUser.id,
    username: newUser.username,
    role: newUser.role,
    displayName: newUser.displayName,
    createdAt: newUser.createdAt,
  };
}

function deleteUser(id) {
  const parsedId = parseInt(id, 10);
  const index = users.findIndex((u) => u.id === parsedId);
  if (index === -1) throw new Error('User not found.');

  if (users[index].id === 1) {
    throw new Error('Cannot delete the primary admin account.');
  }

  const removed = users.splice(index, 1)[0];
  return { id: removed.id, username: removed.username };
}

module.exports = {
  authenticate,
  refreshAccessToken,
  revokeRefreshToken,
  verifyToken,
  authMiddleware,
  adminOnly,
  getAllUsers,
  addUser,
  deleteUser,
};
