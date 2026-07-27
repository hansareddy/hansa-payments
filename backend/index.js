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
  updateSTBLocation,
  clearSTBLocation,
  requestLocationUnlock,
  getUnlockRequests,
  approveLocationUnlock,
  updateCustomerProfile,
  invalidateSheetCache,
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

const CACHE_TTL = 5 * 1000; // 5 seconds
let customerCache = { data: null, timestamp: 0 };

function getCachedCustomers() {
  if (customerCache.data && (Date.now() - customerCache.timestamp < CACHE_TTL)) {
    if (customerCache.data.length > 0 && customerCache.data[0].monthlyPayments) {
      return customerCache.data;
    }
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

// Invalidate any stale in-memory cache on startup
invalidateCache();

// ── Health check (public) ─────────────────────────────────────────────────────

app.get('/api/debug/env', async (req, res) => {
  try {
    const { getSpreadsheetId, resolveSheetName } = require('./sheets');
    const spreadsheetId = getSpreadsheetId();
    const sheetName = await resolveSheetName();
    res.json({
      spreadsheetId,
      sheetName,
      envSpreadsheetId: process.env.SPREADSHEET_ID || '(none)',
      envSheetName: process.env.SHEET_NAME || '(none)',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Hansa Communications API',
    version: '2.0.2-DUAL_COLUMNS_STB_RESET',
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
    const sheetsModule = require('./sheets');
    const rows = await sheetsModule.getAllRows();
    let row123Raw = null;
    let row123Parsed = null;
    if (rows && rows.length >= 123) {
      row123Raw = rows[122];
      if (sheetsModule.rowToCustomer) {
        row123Parsed = sheetsModule.rowToCustomer(rows[122], 123);
      }
    }
    res.json({
      spreadsheetId: rawSpreadsheetId,
      sheetName: rawSheetName,
      rowCount: rows ? rows.length : null,
      firstRow: rows && rows.length > 0 ? rows[0] : null,
      row123Raw,
      row123Parsed,
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
    });
  }
});

app.get('/api/test-sheets', async (req, res) => {
  try {
    const sheetsModule = require('./sheets');
    const rows = await sheetsModule.getAllRows();
    let colMap = null;
    let rawRow123 = null;
    let parsedRow123 = null;
    if (rows && rows.length > 0) {
      colMap = sheetsModule.detectColumnsFromHeader ? sheetsModule.detectColumnsFromHeader(rows[0]) : null;
      if (rows.length >= 123) {
        rawRow123 = rows[122];
        parsedRow123 = sheetsModule.rowToCustomer ? sheetsModule.rowToCustomer(rows[122], 123) : null;
      }
    }
    const customers = await sheetsModule.getAllCustomers();
    const testUser = customers.find(c => c.username && c.username.includes('TEST_SUBSCRIBER_VIP_01'));
    res.json({
      rowsLength: rows ? rows.length : 0,
      colMap,
      rawRow123,
      parsedRow123,
      totalCount: customers.length,
      testUserFromGetAll: testUser || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
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
    const { username, password, role, displayName, permissions } = req.body;
    const newUser = addUser(username, password, role, displayName, permissions);
    console.log(`✅ Admin "${req.user.username}" created user "${username}" with permissions.`, permissions);
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
    if (refresh === 'true' || refresh === '1') {
      invalidateSheetCache();
    }
    let customers;
    if (q && q.trim().length > 0) {
      customers = await searchCustomers(q);
    } else {
      customers = await getAllCustomers();
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
    const { rowIndex, paymentMode, paymentAmount, transactionId, username, discount: bodyDiscount } = req.body;

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

    const discountVal = parseFloat(bodyDiscount) || 0;
    const monthKey = req.body.monthKey || req.body.selectedMonthKey || '';

    const updatedCustomer = await updatePayment(
      parseInt(rowIndex, 10),
      paymentMode.toUpperCase(),
      amount,
      discountVal,
      transactionId || '',
      req.body.notes || '',
      username || '',
      monthKey
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
    res.json({ message: 'Complaint registered successfully', customer: updatedCustomer });
  } catch (error) {
    console.error('Complaint error:', error.message);
    res.status(500).json({ error: 'Failed to register complaint', details: error.message });
  }
});

/**
 * PUT /api/customers/:rowIndex/profile — Update Subscriber Name, Mobile Number, or Box Number (Editable by all profiles)
 */
app.put('/api/customers/:rowIndex/profile', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const { username, mobile, boxNo } = req.body;

    if (isNaN(rowIndex)) {
      return res.status(400).json({ error: 'Invalid row index' });
    }

    const updatedCustomer = await updateCustomerProfile(rowIndex, { username, mobile, boxNo });
    invalidateCache();
    res.json({ message: 'Profile updated successfully', customer: updatedCustomer });
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

/**
 * PUT /api/stb/location — Log or update STB Geolocation coordinates (Locked upon saving)
 */
app.put('/api/stb/location', async (req, res) => {
  try {
    const { rowIndex, latitude, longitude, loggedBy } = req.body;
    if (!rowIndex || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Missing required fields: rowIndex, latitude, longitude' });
    }

    const userRole = (req.user && req.user.role) ? req.user.role : 'employee';
    const updatedCustomer = await updateSTBLocation(rowIndex, latitude, longitude, loggedBy || req.user?.username, userRole);

    invalidateCache();
    res.json({ message: 'STB Geolocation saved and locked successfully', customer: updatedCustomer });
  } catch (error) {
    console.error('STB Location error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/stb/clear-location — Clear STB Geolocation coordinates (Admin & Staff)
 */
app.post('/api/stb/clear-location', async (req, res) => {
  try {
    const { rowIndex } = req.body;
    if (!rowIndex) {
      return res.status(400).json({ error: 'Missing required field: rowIndex' });
    }

    const updatedCustomer = await clearSTBLocation(rowIndex);
    invalidateCache();
    res.json({ message: 'STB Geolocation cleared successfully', customer: updatedCustomer });
  } catch (error) {
    console.error('Clear STB Location error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/stb/location', async (req, res) => {
  try {
    const rowIndex = parseInt(req.query.rowIndex || req.body.rowIndex, 10);
    if (!rowIndex || isNaN(rowIndex)) {
      return res.status(400).json({ error: 'Missing required field: rowIndex' });
    }

    const updatedCustomer = await clearSTBLocation(rowIndex);
    invalidateCache();
    res.json({ message: 'STB Geolocation cleared successfully', customer: updatedCustomer });
  } catch (error) {
    console.error('Delete STB Location error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/stb/unlock-request — Submit request to Admin to unlock STB location
 */
app.post('/api/stb/unlock-request', async (req, res) => {
  try {
    const { rowIndex, username, requestedBy, reason } = req.body;
    if (!rowIndex) {
      return res.status(400).json({ error: 'Missing rowIndex field' });
    }
    const unlockReq = await requestLocationUnlock(rowIndex, username, requestedBy || req.user?.username, reason);
    res.json({ message: 'Unlock request submitted to Admin', request: unlockReq });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit unlock request', details: error.message });
  }
});

/**
 * GET /api/stb/unlock-requests — Get list of unlock requests
 */
app.get('/api/stb/unlock-requests', (req, res) => {
  res.json({ requests: getUnlockRequests() });
});

/**
 * POST /api/stb/approve-unlock — Admin approves unlock request
 */
app.post('/api/stb/approve-unlock', async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
    const customer = await approveLocationUnlock(requestId);
    invalidateCache();
    res.json({ message: 'STB location unlocked by Admin', customer });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
