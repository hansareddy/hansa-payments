/**
 * Google Sheets Service Layer
 * Handles all communication with the Google Sheets API.
 * Includes graceful fallback to local ledger data if Google credentials are not yet configured.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Column index mapping (0-based default fallback)
let COL = {
  USERNAME: 0,
  MOBILE: 1,
  IP_ADDRESS: 2,
  RENEW: 3,
  DUE: 4,
  DISCOUNT: 5,
  CHARGES: 6,
  BANK: 7,
  CASH: 8,
  BALANCE: 9,
  DATE1: 10,
  DATE2: 11,
  FOR: 12,
  TRANSACTION_ID: 13,
};

/**
 * Dynamically detect column indices from header row (Row 1)
 */
function detectColumnsFromHeader(headerRow) {
  if (!headerRow || headerRow.length === 0) return COL;
  const norm = headerRow.map(h => String(h || '').toLowerCase().trim());
  const exact = (term) => norm.indexOf(term.toLowerCase());
  const find = (keywords, defaultIdx) => {
    const idx = norm.findIndex(h => keywords.some(k => h.includes(k)));
    return idx !== -1 ? idx : defaultIdx;
  };

  return {
    USERNAME: exact('name') !== -1 ? exact('name') : find(['username', 'subscriber'], 0),
    MOBILE: exact('mobile') !== -1 ? exact('mobile') : find(['phone', 'contact'], 1),
    LOCATION: exact('location') !== -1 ? exact('location') : -1,
    CUSTOMER_NO: exact('customer #') !== -1 ? exact('customer #') : find(['customer', 'ipaddress'], 3),
    SERIAL_NO: exact('serial number') !== -1 ? exact('serial number') : find(['stb', 'serial'], 4),
    STATUS: exact('status') !== -1 ? exact('status') : -1,
    BASE_PACK: exact('base pack') !== -1 ? exact('base pack') : -1,
    EXPIRY_DATE: exact('expiry date') !== -1 ? exact('expiry date') : -1,
    // Legacy / Billing fields (exact matches to prevent Serial Number from matching charges or due)
    IP_ADDRESS: find(['ipaddress', 'ip_address', 'ip'], exact('location') !== -1 ? exact('location') : 2),
    RENEW: exact('renew') !== -1 ? exact('renew') : (exact('base pack') !== -1 ? exact('base pack') : 3),
    DUE: exact('due') !== -1 ? exact('due') : -1,
    DISCOUNT: exact('discount') !== -1 ? exact('discount') : -1,
    CHARGES: exact('charges') !== -1 ? exact('charges') : -1,
    BANK: exact('bank') !== -1 ? exact('bank') : -1,
    CASH: exact('cash') !== -1 ? exact('cash') : -1,
    BALANCE: exact('balance') !== -1 ? exact('balance') : -1,
    DATE1: exact('date1') !== -1 ? exact('date1') : (exact('expiry date') !== -1 ? exact('expiry date') : 10),
    DATE2: exact('date2') !== -1 ? exact('date2') : 11,
    FOR: exact('for') !== -1 ? exact('for') : (exact('status') !== -1 ? exact('status') : 12),
    TRANSACTION_ID: exact('transaction_id') !== -1 ? exact('transaction_id') : -1,
  };
}

// Cached resolved sheet tab name (detected once, reused for all reads+writes)
let _resolvedSheetName = null;

// In-memory fallback ledger (populated dynamically if Google Sheet API is unreachable)
let localLedger = [];

let sheetsClient = null;

function isGoogleConfigured() {
  // Cloud deployment: credentials provided as base64 or JSON string in env var
  if ((process.env.GOOGLE_CREDENTIALS_BASE64 || process.env.GOOGLE_CREDENTIALS_JSON) && process.env.SPREADSHEET_ID) {
    return true;
  }
  // Local development: credentials from file
  const credentialsPath = path.resolve(
    __dirname,
    process.env.GOOGLE_APPLICATION_CREDENTIALS || 'credentials.json'
  );
  return fs.existsSync(credentialsPath) && process.env.SPREADSHEET_ID && process.env.SPREADSHEET_ID !== 'your_spreadsheet_id_here';
}

function fixPrivateKey(rawKey) {
  if (!rawKey) return rawKey;
  let str = String(rawKey).trim().replace(/^["']|["']$/g, '');
  str = str.replace(/\\n/g, '\n').replace(/\r/g, '');

  const beginHeader = '-----BEGIN PRIVATE KEY-----';
  const endHeader = '-----END PRIVATE KEY-----';

  if (str.includes(beginHeader) && str.includes(endHeader)) {
    const body = str
      .replace(beginHeader, '')
      .replace(endHeader, '')
      .replace(/\s+/g, '');

    const chunks = body.match(/.{1,64}/g);
    if (chunks) {
      return `${beginHeader}\n${chunks.join('\n')}\n${endHeader}\n`;
    }
  }
  return str;
}

function parseCredentials(envVal) {
  if (!envVal || typeof envVal !== 'string') return null;
  const str = envVal.trim().replace(/^["']|["']$/g, '');
  if (!str) return null;

  // Case A: Raw JSON string (starts with '{')
  if (str.startsWith('{')) {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.error('Failed to parse raw JSON credentials:', e.message);
    }
  }

  // Case B: Base64 encoded string
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) {
      return JSON.parse(decoded);
    }
  } catch (e) {
    // continue
  }

  // Case C: Fallback JSON parse
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

async function getClient() {
  if (sheetsClient) return sheetsClient;

  let auth;

  // Cloud deployment: Try GOOGLE_CREDENTIALS_BASE64 or GOOGLE_CREDENTIALS_JSON
  const rawEnv = process.env.GOOGLE_CREDENTIALS_BASE64 || process.env.GOOGLE_CREDENTIALS_JSON;
  if (rawEnv) {
    const credentials = parseCredentials(rawEnv);
    if (credentials && credentials.private_key) {
      credentials.private_key = fixPrivateKey(credentials.private_key);
      console.log(`✅ Google credentials loaded successfully for: "${credentials.client_email || 'Service Account'}"`);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
  }

  // Priority 3: Local credentials file (development fallback)
  if (!auth) {
    const credentialsPath = path.resolve(
      __dirname,
      process.env.GOOGLE_APPLICATION_CREDENTIALS || 'credentials.json'
    );
    if (fs.existsSync(credentialsPath)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        if (fileData && fileData.private_key) {
          fileData.private_key = fixPrivateKey(fileData.private_key);
        }
        console.log('✅ Google credentials loaded from local JSON file.');
        auth = new google.auth.GoogleAuth({
          credentials: fileData,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      } catch (e) {
        console.error('Failed to read local credentials file:', e.message);
      }
    }
  }

  if (!auth) {
    throw new Error('Google credentials not found or unparseable in environment variables or file.');
  }

  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return sheetsClient;
}

function parseCurrency(val) {
  if (!val || val === '') return 0;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

// In-memory transaction history store per customer
let paymentTransactionLogs = {};

function rowToCustomer(row, rowIndex) {
  const username = COL.USERNAME !== -1 ? (row[COL.USERNAME] || '').trim() : '';
  const mobile = COL.MOBILE !== -1 ? (row[COL.MOBILE] || '').trim() : '';
  const location = COL.LOCATION !== -1 ? (row[COL.LOCATION] || '').trim() : '';
  const customerNo = COL.CUSTOMER_NO !== -1 ? (row[COL.CUSTOMER_NO] || '').trim() : '';
  const serialNumber = COL.SERIAL_NO !== -1 ? (row[COL.SERIAL_NO] || '').trim() : '';
  const status = COL.STATUS !== -1 ? (row[COL.STATUS] || '').trim() : '';
  const basePack = COL.BASE_PACK !== -1 ? (row[COL.BASE_PACK] || '').trim() : '';
  const expiryDate = COL.EXPIRY_DATE !== -1 ? (row[COL.EXPIRY_DATE] || '').trim() : '';

  const bank = COL.BANK !== -1 ? parseCurrency(row[COL.BANK]) : 0;
  const cash = COL.CASH !== -1 ? parseCurrency(row[COL.CASH]) : 0;
  const discount = COL.DISCOUNT !== -1 ? parseCurrency(row[COL.DISCOUNT]) : 0;
  const charges = COL.CHARGES !== -1 ? parseCurrency(row[COL.CHARGES]) : 0;
  const due = COL.DUE !== -1 ? parseCurrency(row[COL.DUE]) : 0;
  const balance = COL.BALANCE !== -1 ? parseCurrency(row[COL.BALANCE]) : 0;
  const renew = COL.RENEW !== -1 ? parseCurrency(row[COL.RENEW]) : 0;
  
  const date1 = COL.DATE1 !== -1 ? (row[COL.DATE1] || '').trim() : expiryDate;
  const date2 = COL.DATE2 !== -1 ? (row[COL.DATE2] || '').trim() : '';
  const forField = COL.FOR !== -1 ? (row[COL.FOR] || '').trim() : status;
  const transactionId = COL.TRANSACTION_ID !== -1 ? (row[COL.TRANSACTION_ID] || '').trim() : serialNumber;

  let history = paymentTransactionLogs[username] ? [...paymentTransactionLogs[username]] : [];
  if (history.length === 0 && (bank > 0 || cash > 0 || transactionId)) {
    if (bank > 0) {
      history.push({
        id: `tx_init_bank_${rowIndex}`,
        date: date1 || 'Recent',
        mode: 'BANK',
        amount: bank,
        discount: discount,
        transactionId: transactionId || 'SHEET_REC',
        notes: 'Bank / UPI Collection'
      });
    }
    if (cash > 0) {
      history.push({
        id: `tx_init_cash_${rowIndex}`,
        date: date1 || 'Recent',
        mode: 'CASH',
        amount: cash,
        discount: 0,
        transactionId: 'CASH_PAYMENT',
        notes: 'Cash Collection'
      });
    }
  }

  return {
    rowIndex,
    username,
    mobile,
    ipAddress: customerNo || location || (COL.IP_ADDRESS !== -1 ? (row[COL.IP_ADDRESS] || '').trim() : ''),
    customerNo,
    serialNumber,
    status,
    location,
    basePack,
    expiryDate,
    renew,
    due,
    discount,
    charges,
    bank,
    cash,
    balance,
    date1,
    date2,
    forField,
    transactionId,
    paymentHistory: history,
  };
}

/**
 * Resolve the actual sheet tab name once, then cache it for all future reads+writes.
 * This fixes the bug where reads succeed (via auto-detect) but writes fail (hardcoded name).
 */
function getSpreadsheetId() {
  return (process.env.SPREADSHEET_ID || '').trim().replace(/^["']|["']$/g, '');
}

/**
 * Resolve the actual sheet tab name once, then cache it for all future reads+writes.
 * This fixes the bug where reads succeed (via auto-detect) but writes fail (hardcoded name).
 */
async function resolveSheetName() {
  if (_resolvedSheetName) return _resolvedSheetName;

  const client = await getClient();
  const spreadsheetId = getSpreadsheetId();
  const rawConfigured = (process.env.SHEET_NAME || '').trim().replace(/^["']|["']$/g, '');

  // Try the configured name first
  if (rawConfigured) {
    for (const name of [rawConfigured, rawConfigured.trim()]) {
      try {
        const response = await client.spreadsheets.values.get({
          spreadsheetId,
          range: `'${name}'!A1:A1`,
        });
        _resolvedSheetName = name;
        console.log(`✅ Sheet tab resolved to configured name: "${name}"`);
        return _resolvedSheetName;
      } catch (e) {
        // continue
      }
    }
  }

  // Fallback: auto-detect first tab from spreadsheet metadata
  try {
    const meta = await client.spreadsheets.get({ spreadsheetId });
    if (meta.data.sheets && meta.data.sheets.length > 0) {
      _resolvedSheetName = meta.data.sheets[0].properties.title;
      console.log(`✅ Sheet tab auto-detected: "${_resolvedSheetName}"`);
      return _resolvedSheetName;
    }
  } catch (err) {
    console.error('Failed to auto-detect sheet tab:', err.message);
  }

  // Last resort fallback
  _resolvedSheetName = 'Sheet1';
  console.warn('⚠️ Using fallback sheet name: "Sheet1"');
  return _resolvedSheetName;
}

async function getAllRows() {
  if (!isGoogleConfigured()) return null;
  const client = await getClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = await resolveSheetName();

  const response = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:Z`,
  });
  return response.data.values || [];
}

/**
 * Get all customers from the sheet or local ledger.
 */
async function getAllCustomers() {
  try {
    const rows = await getAllRows();
    if (rows && rows.length > 1) {
      // Dynamically detect column mapping from header row
      COL = detectColumnsFromHeader(rows[0]);
      const customers = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row && row.length > 0 && (row[COL.USERNAME] || row[COL.MOBILE])) {
          // Skip header row if present so rowIndex matches exact physical sheet row
          if (row[COL.USERNAME] && row[COL.USERNAME].toLowerCase().trim() === 'username') continue;
          customers.push(rowToCustomer(row, i + 1));
        }
      }
      return customers;
    }
  } catch (err) {
    console.error('❌ Google Sheets fetch error in getAllCustomers:', err);
    throw err;
  }

  return localLedger;
}

/**
 * Search customers by query string or return all if query is empty.
 */
async function searchCustomers(query) {
  const all = await getAllCustomers();
  if (!query || query.trim() === '') return all;

  const searchTerm = query.toLowerCase().trim();
  return all.filter(item => 
    (item.username && item.username.toLowerCase().includes(searchTerm)) ||
    (item.mobile && item.mobile.toLowerCase().includes(searchTerm)) ||
    (item.ipAddress && item.ipAddress.toLowerCase().includes(searchTerm)) ||
    (item.customerNo && item.customerNo.toLowerCase().includes(searchTerm)) ||
    (item.serialNumber && item.serialNumber.toLowerCase().includes(searchTerm)) ||
    (item.status && item.status.toLowerCase().includes(searchTerm)) ||
    (item.location && item.location.toLowerCase().includes(searchTerm))
  );
}

/**
 * Get a single customer by row index or username (with fail-safe fallback).
 */
async function getCustomerByRow(rowIndex, username = null) {
  const all = await getAllCustomers();
  const idx = parseInt(rowIndex, 10);

  if (username && String(username).trim()) {
    const cleanUser = String(username).toLowerCase().trim();
    const matchUser = all.find(c => c.username && c.username.toLowerCase().trim() === cleanUser);
    if (matchUser) return matchUser;
  }

  return all.find(c => c.rowIndex === idx) || null;
}

/**
 * Record a payment and update row.
 * Date is always set to today's date (column K).
 * Transaction ID is written to column N.
 */
async function updatePayment(rowIndex, paymentMode, paymentAmount, discountAmount = 0, transactionId = '', notes = '', targetUsername = '') {
  const discountVal = parseFloat(discountAmount) || 0;

  // Always use today's date
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // If Google API is configured, write back to Google Sheet
  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = await resolveSheetName();
      const spreadsheetId = process.env.SPREADSHEET_ID;

      const current = await getCustomerByRow(rowIndex, targetUsername);
      if (!current) throw new Error(`Customer not found for row ${rowIndex} / ${targetUsername}`);
      const index = current.rowIndex; // Use exact matched customer row index

      let newBank = current.bank;
      let newCash = current.cash;
      const newDiscount = current.discount + discountVal;

      if (paymentMode === 'BANK') {
        newBank = current.bank + paymentAmount;
      } else if (paymentMode === 'CASH') {
        newCash = current.cash + paymentAmount;
      }

      const totalPaid = newBank + newCash;
      const newBalance = current.due - totalPaid + current.charges - newDiscount;

      // Update F-N: DISCOUNT, CHARGES, BANK, CASH, BALANCE, DATE1, DATE2, FOR, TRANSACTION_ID
      const updateRange = `'${sheetName}'!F${index}:N${index}`;
      const values = [[
        newDiscount || 0,
        current.charges || 0,
        newBank || 0,
        newCash || 0,
        newBalance,
        todayStr,
        current.date2,
        current.forField || '',
        transactionId || current.transactionId || ''
      ]];

      console.log(`📝 Writing payment to sheet "${sheetName}" row ${index}: mode=${paymentMode}, amount=${paymentAmount}, txnId=${transactionId}`);

      await client.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      console.log(`✅ Payment written to Google Sheet row ${index}`);

      // Log transaction in history
      if (!paymentTransactionLogs[current.username]) {
        paymentTransactionLogs[current.username] = [];
      }
      paymentTransactionLogs[current.username].unshift({
        id: `tx_${Date.now()}`,
        date: todayStr,
        mode: paymentMode,
        amount: paymentAmount,
        discount: discountVal,
        transactionId: transactionId || 'N/A',
        notes: notes || `${paymentMode} collection`
      });

      return await getCustomerByRow(index);
    } catch (err) {
      console.error('❌ Google Sheet update error:', err.message);
      // Re-throw so the API returns an error instead of silently using local fallback
      throw err;
    }
  }

  // Update local memory copy
  const customer = localLedger.find(c => c.rowIndex === index);
  if (!customer) throw new Error(`Customer not found at row ${index}`);

  if (paymentMode === 'BANK') {
    customer.bank += paymentAmount;
  } else if (paymentMode === 'CASH') {
    customer.cash += paymentAmount;
  }

  customer.discount += discountVal;
  const totalPaid = customer.bank + customer.cash;
  customer.balance = customer.due - totalPaid + customer.charges - customer.discount;
  customer.date1 = todayStr;
  if (transactionId) customer.transactionId = transactionId;

  return customer;
}

/**
 * Add a new customer account to Google Sheet or memory ledger.
 */
async function addCustomer(customerData) {
  const { username, mobile, ipAddress, renew, due, date1 } = customerData;
  const planRate = parseFloat(renew) || 0;
  const initialDue = parseFloat(due) || 0;
  const renewDate = date1 || '';

  // Calculate balance: balance = due
  const balance = initialDue;

  // Check for duplicate username
  const all = await getAllCustomers();
  const exists = all.some(c => c.username && c.username.toLowerCase().trim() === username.toLowerCase().trim());
  if (exists) {
    throw new Error(`Account username "${username}" already exists.`);
  }

  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = await resolveSheetName();
      const spreadsheetId = process.env.SPREADSHEET_ID;

      // Values array mapping columns A to N
      const rowValues = [
        username || '',
        mobile || '',
        ipAddress || '',
        planRate,
        initialDue,
        0, // DISCOUNT
        0, // CHARGES
        0, // BANK
        0, // CASH
        balance, // BALANCE
        renewDate, // DATE1
        '', // DATE2
        'New account created', // FOR ?
        '' // TRANSACTION_ID
      ];

      await client.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:N`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowValues],
        },
      });

      // Reload all to get updated indices
      const updatedList = await getAllCustomers();
      return updatedList.find(c => c.username === username) || null;
    } catch (err) {
      console.warn('Google Sheet append error, adding to local copy:', err.message);
    }
  }

  // Fallback to local copy
  const nextRowIndex = localLedger.length > 0 
    ? Math.max(...localLedger.map(c => c.rowIndex)) + 1 
    : 2;

  const newCustomer = {
    rowIndex: nextRowIndex,
    username: username || '',
    mobile: mobile || '',
    ipAddress: ipAddress || '',
    renew: planRate,
    due: initialDue,
    discount: 0,
    charges: 0,
    bank: 0,
    cash: 0,
    balance: balance,
    date1: renewDate,
    date2: '',
    forField: 'New account created',
  };

  localLedger.push(newCustomer);
  return newCustomer;
}

/**
 * Register a complaint or priority flag on a customer account.
 * Updates Column M (FOR ?).
 */
async function updateComplaint(rowIndex, urgent, complaint) {
  const index = parseInt(rowIndex, 10);
  
  // Format the note field
  let noteText = '';
  if (urgent) {
    noteText = `[URGENT] ${complaint.trim()}`;
  } else {
    noteText = complaint.trim();
  }

  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = await resolveSheetName();
      const spreadsheetId = process.env.SPREADSHEET_ID;

      // Update Column M (FOR ?) - index 13 corresponding to column M
      const updateRange = `'${sheetName}'!M${index}`;
      const values = [[noteText]];

      await client.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      return await getCustomerByRow(index);
    } catch (err) {
      console.warn('Google Sheet update complaint error, updating local copy:', err.message);
    }
  }

  // Fallback to local copy
  const customer = localLedger.find(c => c.rowIndex === index);
  if (!customer) throw new Error(`Customer not found at row ${index}`);

  customer.forField = noteText;
  return customer;
}

module.exports = {
  getAllCustomers,
  searchCustomers,
  getCustomerByRow,
  updatePayment,
  addCustomer,
  updateComplaint,
  getAllRows,
};
