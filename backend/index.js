/**
 * Hansa Communications Network - Backend API Server (PRODUCTION)
 *
 * Security:  helmet, CORS whitelist, rate limiting, input sanitization
 * Perf:      in-memory response cache (2-min TTL, auto-invalidate on writes)
 * Auth:      access + refresh token endpoints
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const {
  authenticate,
  refreshAccessToken,
  revokeRefreshToken,
  authMiddleware,
  adminOnly,
  getAllUsers,
  addUser,
  deleteUser,
} = require('./auth');
const {
  getAllCustomers,
  searchCustomers,
  getCustomerByRow,
  updatePayment,
  addCustomer,
  updateComplaint,
} = require('./sheets');

const app = express();
app.set('trust proxy', 1); // Trust Render reverse proxy for rate-limiting and X-Forwarded-For
const PORT = process.env.PORT || 5000;

// ── Security middleware ───────────────────────────────────────────────────────

// Helmet — sets secure HTTP headers (XSS protection, CSP, HSTS, etc.)
app.use(helmet());

// CORS — restrict origins in production, open in development
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : null;
app.use(
  cors(
    allowedOrigins
      ? { origin: allowedOrigins, credentials: true }
      : { origin: true } // allow all in dev
  )
);

app.use(express.json({ limit: '1mb' })); // cap request body size

// ── Rate limiting ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 login attempts per window
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,                 // 120 requests per minute
  message: { error: 'Rate limit exceeded. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ── Request logger ────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? '⚠' : '→';
    console.log(
      `${level} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });
  next();
});

// ── In-memory response cache ──────────────────────────────────────────────────

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
let customerCache = { data: null, timestamp: 0 };

function getCachedCustomers() {
  if (customerCache.data && Date.now() - customerCache.timestamp < CACHE_TTL) {
    return customerCache.data;
  }
  return null;
}

function setCachedCustomers(data) {
  customerCache.data = data;
  customerCache.timestamp = Date.now();
}

function invalidateCache() {
  customerCache.data = null;
  customerCache.timestamp = 0;
}

// ── Health check (public) ─────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Hansa Communications API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/debug-sheet', async (req, res) => {
  try {
    const rawSpreadsheetId = process.env.SPREADSHEET_ID;
    const rawSheetName = process.env.SHEET_NAME;
    let b64Len = process.env.GOOGLE_CREDENTIALS_BASE64 ? process.env.GOOGLE_CREDENTIALS_BASE64.length : 0;
    let decodedSample = '';
    let parsedKeySample = '';
    if (process.env.GOOGLE_CREDENTIALS_BASE64) {
      try {
        const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64.trim(), 'base64').toString('utf8');
        decodedSample = decoded.slice(0, 100);
        const parsed = JSON.parse(decoded);
        parsedKeySample = parsed.private_key ? parsed.private_key.slice(0, 60) : 'NO_KEY';
      } catch(e) {
        decodedSample = 'DECODE_ERR: ' + e.message;
      }
    }
    const rows = await require('./sheets').getAllRows();
    res.json({
      spreadsheetId: rawSpreadsheetId,
      sheetName: rawSheetName,
      b64Len,
      decodedSample,
      parsedKeySample,
      rowCount: rows ? rows.length : null,
      firstRow: rows && rows.length > 0 ? rows[0] : null,
      secondRow: rows && rows.length > 1 ? rows[1] : null,
    });
  } catch (err) {
    let parsedKeySample = 'N/A';
    try {
      const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64.trim(), 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      parsedKeySample = parsed.private_key ? JSON.stringify(parsed.private_key.slice(0, 80)) : 'NO_KEY';
    } catch(e) {
      parsedKeySample = 'ERR: ' + e.message;
    }

    res.status(500).json({
      error: err.message,
      stack: err.stack,
      parsedKeySample,
      spreadsheetId: process.env.SPREADSHEET_ID,
      sheetName: process.env.SHEET_NAME,
    });
  }
});

// ── Authentication (public, rate-limited) ─────────────────────────────────────

/**
 * POST /api/login
 */
app.post('/api/login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const result = authenticate(username.trim(), password);
    if (!result) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    console.log(`✅ User "${username}" logged in.`);
    res.json(result);
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Login failed.' });
  }
});

/**
 * POST /api/refresh
 * Exchange a valid refresh token for a new access token (+ rotated refresh token).
 */
app.post('/api/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    const result = refreshAccessToken(refreshToken);
    if (!result) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    res.json(result);
  } catch (error) {
    console.error('Refresh error:', error.message);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

/**
 * POST /api/logout
 * Revoke the refresh token.
 */
app.post('/api/logout', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) revokeRefreshToken(refreshToken);
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

// ── All routes below require authentication ───────────────────────────────────
app.use('/api/customers', authMiddleware);
app.use('/api/payments', authMiddleware);
app.use('/api/users', authMiddleware);

// ── User Management (admin only) ─────────────────────────────────────────────

app.get('/api/users', adminOnly, (req, res) => {
  try {
    const users = getAllUsers();
    res.json({ count: users.length, users });
  } catch (error) {
    console.error('Get users error:', error.message);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

app.post('/api/users', adminOnly, (req, res) => {
  try {
    const { username, password, role, displayName } = req.body;
    const newUser = addUser(username, password, role, displayName);
    console.log(`✅ Admin "${req.user.username}" created user "${username}".`);
    res.json({ message: 'User created successfully.', user: newUser });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/users/:id', adminOnly, (req, res) => {
  try {
    const result = deleteUser(req.params.id);
    console.log(`✅ Admin "${req.user.username}" deleted user id=${req.params.id}.`);
    res.json({ message: 'User deleted successfully.', deleted: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Customer Routes (authenticated + cached) ─────────────────────────────────

app.post('/api/customers', async (req, res) => {
  try {
    const { username, mobile, ipAddress, renew, due, date1 } = req.body;
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }
    const customer = await addCustomer({ username, mobile, ipAddress, renew, due, date1 });
    invalidateCache();
    res.json({ message: 'Customer created successfully', customer });
  } catch (error) {
    console.error('Add customer error:', error.message);
    res.status(500).json({ error: 'Failed to add customer', details: error.message });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    const { q, refresh } = req.query;

    // Serve from cache when no search query and refresh is not requested
    if (!refresh && (!q || q.trim().length === 0)) {
      const cached = getCachedCustomers();
      if (cached && cached.length > 0) {
        return res.json({ count: cached.length, customers: cached, cached: true });
      }
    }

    let customers;
    if (q && q.trim().length > 0) {
      customers = await searchCustomers(q);
    } else {
      customers = await getAllCustomers();
      if (customers && customers.length > 0) {
        setCachedCustomers(customers); // cache ONLY non-empty valid customer lists
      }
    }

    res.json({ count: customers.length, customers });
  } catch (error) {
    console.error('Fetch customers error:', error.message);
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
});

app.get('/api/customers/search', async (req, res) => {
  try {
    const { q } = req.query;
    const customers = await searchCustomers(q || '');
    res.json({ query: q || '', count: customers.length, customers });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: 'Failed to search customers', details: error.message });
  }
});

app.get('/api/customers/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    if (isNaN(rowIndex)) {
      return res.status(400).json({ error: 'Invalid row index' });
    }
    const customer = await getCustomerByRow(rowIndex);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ customer });
  } catch (error) {
    console.error('Get customer error:', error.message);
    res.status(500).json({ error: 'Failed to fetch customer', details: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const { rowIndex, paymentMode, paymentAmount, transactionId, username } = req.body;

    if (!rowIndex || !paymentMode || paymentAmount === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: rowIndex, paymentMode, paymentAmount',
      });
    }

    if (!['CASH', 'BANK'].includes(paymentMode.toUpperCase())) {
      return res.status(400).json({ error: 'paymentMode must be "CASH" or "BANK"' });
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payment amount' });
    }

    const discount = parseFloat(req.body.discount) || 0;

    const updatedCustomer = await updatePayment(
      parseInt(rowIndex, 10),
      paymentMode.toUpperCase(),
      amount,
      discount,
      transactionId || '',
      req.body.notes || '',
      username || ''
    );

    invalidateCache(); // bust cache after write
    res.json({ message: 'Payment recorded successfully', customer: updatedCustomer });
  } catch (error) {
    console.error('Payment error:', error.message);
    res.status(500).json({ error: 'Failed to record payment', details: error.message });
  }
});

app.post('/api/customers/:rowIndex/complaint', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const { urgent, complaint } = req.body;

    if (isNaN(rowIndex)) {
      return res.status(400).json({ error: 'Invalid row index' });
    }

    const updatedCustomer = await updateComplaint(rowIndex, !!urgent, complaint || '');
    invalidateCache();
    res.json({ message: 'Complaint recorded successfully', customer: updatedCustomer });
  } catch (error) {
    console.error('Complaint error:', error.message);
    res.status(500).json({ error: 'Failed to record complaint', details: error.message });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Hansa Communications API Server — PRODUCTION`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Security: helmet ✓  rate-limit ✓  CORS ✓`);
  console.log(`   Cache: 2-min TTL, auto-invalidate on writes`);
  console.log(`   Auth: access (15m) + refresh (30d) tokens`);
  console.log(`\n📋 Admin: admin / hansa@2024\n`);
});
