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

// In-memory & persistent file store for STB GPS Locations & Admin Unlock Requests
const locationPath = path.resolve(__dirname, 'stb_locations.json');
const stbLocationStore = new Map(); // key -> { lat, lng, isLocked, loggedBy, loggedAt, username, rowIndex }

function loadSTBLocations() {
  try {
    if (fs.existsSync(locationPath)) {
      const data = JSON.parse(fs.readFileSync(locationPath, 'utf8'));
      Object.keys(data).forEach(k => {
        stbLocationStore.set(k, data[k]);
      });
      console.log(`📍 Loaded ${stbLocationStore.size} persistent STB locations.`);
    }
  } catch (err) {
    console.warn('Could not load persistent STB locations:', err.message);
  }
}

function saveSTBLocations() {
  try {
    const obj = {};
    stbLocationStore.forEach((v, k) => {
      obj[k] = v;
    });
    fs.writeFileSync(locationPath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save persistent STB locations:', err.message);
  }
}

loadSTBLocations();

const unlockRequestsStore = []; // list of { id, rowIndex, username, requestedBy, reason, timestamp, status }

/**
 * Dynamically detect column indices from header row (Row 1)
 */
const MONTH_LIST = [
  { key: 'Jan-26', name: 'January 2026', short: 'Jan' },
  { key: 'Feb-26', name: 'February 2026', short: 'Feb' },
  { key: 'Mar-26', name: 'March 2026', short: 'Mar' },
  { key: 'Apr-26', name: 'April 2026', short: 'Apr' },
  { key: 'May-26', name: 'May 2026', short: 'May' },
  { key: 'Jun-26', name: 'June 2026', short: 'Jun' },
  { key: 'Jul-26', name: 'July 2026', short: 'Jul' },
  { key: 'Aug-26', name: 'August 2026', short: 'Aug' },
  { key: 'Sep-26', name: 'September 2026', short: 'Sep' },
  { key: 'Oct-26', name: 'October 2026', short: 'Oct' },
  { key: 'Nov-26', name: 'November 2026', short: 'Nov' },
  { key: 'Dec-26', name: 'December 2026', short: 'Dec' },
];

function getMonthlyRate(basePack) {
  if (!basePack) return 300;
  const str = String(basePack).trim();
  if (str.includes('400')) return 400;
  if (str.includes('300')) return 300;
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) return num;
  return 300;
}

function detectColumnsFromHeader(headerRow) {
  if (!headerRow || !Array.isArray(headerRow)) return COL;
  const norm = headerRow.map(h => String(h || '').trim().toLowerCase());
  const exact = (term) => norm.indexOf(term.toLowerCase());
  const find = (keywords, defaultIdx) => {
    const idx = norm.findIndex(h => keywords.some(k => h.includes(k)));
    return idx !== -1 ? idx : defaultIdx;
  };

  const monthCols = {};
  MONTH_LIST.forEach(m => {
    const idx = exact(m.key.toLowerCase());
    monthCols[m.key] = idx !== -1 ? idx : exact(m.short.toLowerCase());
  });

  return {
    USERNAME: exact('name') !== -1 ? exact('name') : find(['username', 'subscriber'], 0),
    MOBILE: exact('mobile') !== -1 ? exact('mobile') : find(['phone', 'contact'], 1),
    LOCATION: exact('location') !== -1 ? exact('location') : -1,
    CUSTOMER_NO: exact('customer #') !== -1 ? exact('customer #') : find(['customer', 'ipaddress'], 3),
    SERIAL_NO: exact('serial number') !== -1 ? exact('serial number') : find(['stb', 'serial'], 4),
    STATUS: exact('status') !== -1 ? exact('status') : -1,
    BASE_PACK: exact('base pack') !== -1 ? exact('base pack') : -1,
    EXPIRY_DATE: exact('expiry date') !== -1 ? exact('expiry date') : -1,
    BOX_NO: exact('box no') !== -1 ? exact('box no') : (exact('box #') !== -1 ? exact('box #') : (exact('stb no') !== -1 ? exact('stb no') : find(['box', 'box_no', 'stb_no'], -1))),
    // Legacy / Billing fields
    IP_ADDRESS: find(['ipaddress', 'ip_address', 'ip'], exact('location') !== -1 ? exact('location') : 2),
    RENEW: exact('renew') !== -1 ? exact('renew') : (exact('base pack') !== -1 ? exact('base pack') : 3),
    DUE: exact('total due') !== -1 ? exact('total due') : (exact('due') !== -1 ? exact('due') : -1),
    DISCOUNT: exact('discount') !== -1 ? exact('discount') : -1,
    CHARGES: exact('charges') !== -1 ? exact('charges') : -1,
    BANK: exact('bank') !== -1 ? exact('bank') : -1,
    CASH: exact('cash') !== -1 ? exact('cash') : -1,
    BALANCE: exact('balance') !== -1 ? exact('balance') : -1,
    DATE1: exact('date1') !== -1 ? exact('date1') : (exact('expiry date') !== -1 ? exact('expiry date') : 10),
    DATE2: exact('date2') !== -1 ? exact('date2') : 11,
    FOR: exact('for') !== -1 ? exact('for') : (exact('notes') !== -1 ? exact('notes') : (exact('complaint') !== -1 ? exact('complaint') : -1)),
    TRANSACTION_ID: exact('transaction_id') !== -1 ? exact('transaction_id') : -1,
    MONTH_COLS: monthCols,
  };
}

// In-memory store for STB Box Numbers (2-3 digit identification codes)
const stbBoxNoStore = new Map(); // rowIndex -> boxNo

// Cached resolved sheet tab name (detected once, reused for all reads+writes)
let _resolvedSheetName = null;

// In-memory fallback ledger (populated dynamically if Google Sheet API is unreachable)
let localLedger = [];

let sheetsClient = null;

const DEFAULT_EMBEDDED_CREDENTIALS = {
  type: "service_account",
  project_id: "smart-firmament-496107-b0",
  private_key_id: "f31ca0d4791d73d96584b6787fd0183485b12a1b",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCz6ryUWfNv5tx0\nIktCLLUAYr0ScGJ1RZ2QAI4VX3Y0VWhYUN/FSU5kauAoICVXFdS+9NUZ+v9/xcu/\nQ9w3Mw+Kf4j1ZF/7VDIS7GfXDJObAq5VGv9/RprfGxcqsWVDT8GOTOYMjOXPm0A3\n0N/AS5p+DHYZ4BW6TPN96RHj6dgRwt6e9ssBf9KwZYyBpxyui7x8/4bEmosT4ER3\n9xFlANYqkz4F32pZEr59lkd5kNUGnnUikz8mLTGXY8R3ndytmS5Nx+nvAD0XxMh3\n9ap3uO7hYawGa4ds6qYmmJ9sg4EhcEO+Uf7GV9364u1HcNQL5dXm95ROugHqnxX2\nXe6pg9ptAgMBAAECggEAGyJf5o/aYxoSTYGOkCBl+/ToRwukDcO+C6XJx/dpwGLR\nJeCsnvh7VjG4NNUETKoCN/p82To9pmuSWvpFEB4nTeAGK9xDjYgZNTlqP8ipyksR\nN8ymk+92FAfl6o5uk0RIEMoQN/xX/IORn9lkpX/BgRkoBqcBH+PTJT4tcI4oBCV6\n29KtTRwEbBLoq3yu0oB80mSyp66MDslpgpLRP+H81DMEGenVebMKRiQwM8Fbb53F\njrjntXenp72VbdPNLNqG5gmN9vpgOf5dEMfMYN91DNb4lgCiV530E/gznmAy6XcJ\nZ0BhIKIqnXp4UAyeKUNwGXAY9f2GanaIwaQL1zuyEQKBgQDfjceTd9m6oetnDhGq\n0byZNdxbLiMiYJquC1j+ReZ7gQNpX+h4AgreRmWm0SvcASnUboFZndFACsuoV4VD\nTl9fdIkjl7zF8UOvP8VFS2i5z3H7Iwi9YDoFKA23AiY/ltRfL9+cVhBOZ/VFB4gE\nZ9PfUQtqsrsPhPYBLzvqgiWwUwKBgQDOB50Bdo1LIT8S8sWPTnpouFWzZl00WMoW\nKmhPWQk9ze4ZugNlCgqR9zQxZBSZRJ8S9p9ABOesW96HXlQyKuolB9qyBWjIXVid\nVXxorZzSpAOmMSjDaZzz02/g46/LFN3qnBN5uQa5v8KDMtTcv+XLJ1/S1zEUYPlK\nBk8l8lXyPwKBgQDQS8KRXTK5+vTj6O/9Qb+A4faX3r1N4sU9NcWN5oOCwAr1vC9W\n4lBOGznL3UoIi+z1yqErZyj5ixWHnUTGGdgzkNnXGCMELHDscXbVwhWqS+fgIByc\nl3R4KYHd61rIFTl8F5c6i9ZVt/eIgiPyNuvrQBBrMm2pYDH3mJMzRmDnkQKBgEVU\nEIQehXsji9rvcIVBjjVQ2h3NM03bFt2QlZslxdNTSWzEyEGmuFnXymtYVwogKjsy\nW/Ip9F9uZpo8pq5e/H1LgE7pPRI3Pwtqabu7uAq1gDjbT/E5x8PQgVQ2qb/3nJlG\nvdL27QlyOpz1bOV/eW78J+WF3hESdLBxIQ8O1db3AoGAGC7woPvl36PmjCD1cpjC\nZCHYaC3jIR+AECI6IZE1WkfB0X+j9oju/yVZ1SgvWfwn14ffXvNKsh4HTKcNXXOt\nwvPVLk/ElZrYTx/EBnfhRBKsVjNC1hbyJYTl5rXwU4Z64Syy3ypz2kxKhn92Xnsw\nEoCouOkbjXilGOA1Lrw3H10=\n-----END PRIVATE KEY-----\n",
  client_email: "hansa-sheets@smart-firmament-496107-b0.iam.gserviceaccount.com",
  client_id: "112914872692763354645",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/hansa-sheets%40smart-firmament-496107-b0.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

function isGoogleConfigured() {
  return true; // Always enabled with embedded credentials
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
    console.log('✅ Google credentials loaded from default embedded service account.');
    auth = new google.auth.GoogleAuth({
      credentials: DEFAULT_EMBEDDED_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
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
  const boxNoFromSheet = COL.BOX_NO !== undefined && COL.BOX_NO !== -1 ? (row[COL.BOX_NO] || '').trim() : '';
  const boxNo = boxNoFromSheet || stbBoxNoStore.get(rowIndex) || '';
  const location = COL.LOCATION !== -1 ? (row[COL.LOCATION] || '').trim() : '';
  const customerNo = COL.CUSTOMER_NO !== -1 ? (row[COL.CUSTOMER_NO] || '').trim() : '';
  const serialNumber = COL.SERIAL_NO !== -1 ? (row[COL.SERIAL_NO] || '').trim() : '';
  const status = COL.STATUS !== -1 ? (row[COL.STATUS] || '').trim() : '';
  const basePack = COL.BASE_PACK !== -1 ? (row[COL.BASE_PACK] || '').trim() : '';
  const expiryDate = COL.EXPIRY_DATE !== -1 ? (row[COL.EXPIRY_DATE] || '').trim() : '';
  const date1 = COL.DATE1 !== -1 ? (row[COL.DATE1] || '').trim() : '';
  const date2 = COL.DATE2 !== -1 ? (row[COL.DATE2] || '').trim() : '';
  const forField = COL.FOR !== -1 ? (row[COL.FOR] || '').trim() : '';
  const transactionId = COL.TRANSACTION_ID !== -1 ? (row[COL.TRANSACTION_ID] || '').trim() : '';

  const bank = COL.BANK !== -1 ? parseCurrency(row[COL.BANK]) : 0;
  const cash = COL.CASH !== -1 ? parseCurrency(row[COL.CASH]) : 0;
  const discount = COL.DISCOUNT !== -1 ? parseCurrency(row[COL.DISCOUNT]) : 0;
  const charges = COL.CHARGES !== -1 ? parseCurrency(row[COL.CHARGES]) : 0;
  const monthlyFee = getMonthlyRate(basePack);
  const monthlyPayments = [];
  const unpaidMonthNames = [];
  let totalDueFromMonths = 0;

  MONTH_LIST.forEach((m, idx) => {
    let colIdx = (COL.MONTH_COLS && COL.MONTH_COLS[m.key] !== undefined && COL.MONTH_COLS[m.key] !== -1)
      ? COL.MONTH_COLS[m.key]
      : (8 + idx);

    const rawVal = (row[colIdx] !== undefined) ? String(row[colIdx]).trim() : '';
    let cellNum = 0;
    const matchNum = rawVal.match(/^(\d+(\.\d+)?)/) || rawVal.match(/(\d+(\.\d+)?)/);
    if (matchNum) {
      cellNum = parseFloat(matchNum[1]) || 0;
    }

    const lower = rawVal.toLowerCase();
    const hasPaymentKeyword = lower.includes('cash') || 
                              lower.includes('gpay') || 
                              lower.includes('phonepe') || 
                              lower.includes('paytm') || 
                              lower.includes('upi') || 
                              lower.includes('bank') || 
                              lower.includes('paid') ||
                              lower.includes('(');

    let status = 'None';
    let monthAmount = 0;
    let paidAmount = 0;

    if (rawVal === '' || rawVal === '0' || rawVal === '0.00' || rawVal === '-' || (cellNum === 0 && !hasPaymentKeyword)) {
      status = 'None';
      monthAmount = 0;
      paidAmount = 0;
    } else if (hasPaymentKeyword) {
      status = 'Paid';
      monthAmount = cellNum > 0 ? cellNum : monthlyFee;
      paidAmount = monthAmount;
    } else if (cellNum > 0) {
      status = 'Unpaid';
      monthAmount = cellNum;
      paidAmount = 0;
      unpaidMonthNames.push(m.name);
      totalDueFromMonths += monthAmount;
    }

    monthlyPayments.push({
      key: m.key,
      name: m.name,
      short: m.short,
      amount: monthAmount,
      paidAmount: paidAmount,
      status: status,
      details: rawVal || (status === 'Paid' ? 'Paid' : (status === 'Unpaid' ? `₹${monthAmount}` : '-')),
    });
  });

  const due = COL.DUE !== -1 && parseCurrency(row[COL.DUE]) > 0 ? parseCurrency(row[COL.DUE]) : totalDueFromMonths;

  // Build full payment history dynamically from monthly billing entries
  const parsedHistory = [];
  monthlyPayments.forEach(m => {
    if (m.details && m.details !== 'Unpaid') {
      const parts = String(m.details).split(',');
      parts.forEach((p, pIdx) => {
        const pStr = p.trim();
        if (pStr) {
          const match = pStr.match(/^(\d+(\.\d+)?)/) || pStr.match(/(\d+(\.\d+)?)\s*(?=\()/);
          const amt = match ? parseFloat(match[1]) : 0;
          
          let mode = 'BANK';
          const pUpper = pStr.toUpperCase();
          if (pUpper.includes('CASH')) mode = 'CASH';
          else if (pUpper.includes('GPAY')) mode = 'GPAY';
          else if (pUpper.includes('PHONEPE')) mode = 'PHONEPE';
          else if (pUpper.includes('PAYTM')) mode = 'PAYTM';
          else if (pUpper.includes('UPI')) mode = 'UPI';

          const dateMatch = pStr.match(/\((.*?)\)/);
          const dateStr = dateMatch ? dateMatch[1] : m.name;

          if (amt > 0 || m.status === 'Paid') {
            parsedHistory.push({
              id: `tx_${m.key}_${pIdx}_${rowIndex}`,
              date: dateStr,
              monthKey: m.key,
              monthName: m.name,
              mode: mode,
              amount: amt || m.amount,
              discount: discount,
              transactionId: transactionId || 'SHEET_REC',
              notes: `${m.name} Collection (${pStr})`
            });
          }
        }
      });
    }
  });

  const memoryLogs = paymentTransactionLogs[username] || [];
  const historyMap = new Map();
  // Reverse parsedHistory so latest months appear first
  [...parsedHistory].reverse().forEach(item => historyMap.set(item.id, item));
  memoryLogs.forEach(item => historyMap.set(item.id, item));
  let history = Array.from(historyMap.values());

  const userKey = username ? username.toLowerCase().trim() : String(rowIndex);
  let stbLoc = stbLocationStore.get(userKey) || stbLocationStore.get(String(rowIndex));

  // If not in store yet, check if raw location cell has coordinates e.g. "16.5062,80.6480"
  if ((!stbLoc || !stbLoc.lat) && location) {
    const coordsMatch = location.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (coordsMatch) {
      stbLoc = {
        lat: parseFloat(coordsMatch[1]),
        lng: parseFloat(coordsMatch[2]),
        isLocked: location.toLowerCase().includes('lock') || location.toLowerCase().includes('verified') || location.includes('(LOCKED)'),
        loggedBy: 'Field Staff',
        loggedAt: new Date().toISOString(),
        username,
        rowIndex,
      };
      stbLocationStore.set(userKey, stbLoc);
      stbLocationStore.set(String(rowIndex), stbLoc);
    }
  }

  if (!stbLoc) {
    stbLoc = {
      lat: null,
      lng: null,
      isLocked: false,
      loggedBy: null,
      loggedAt: null,
    };
  }

  return {
    rowIndex,
    username,
    mobile,
    boxNo,
    ipAddress: customerNo || location || (COL.IP_ADDRESS !== -1 ? (row[COL.IP_ADDRESS] || '').trim() : ''),
    customerNo,
    serialNumber,
    status,
    location,
    latitude: stbLoc.lat,
    longitude: stbLoc.lng,
    locationLocked: stbLoc.isLocked,
    locationLoggedBy: stbLoc.loggedBy,
    locationTimestamp: stbLoc.loggedAt,
    basePack,
    monthlyFee,
    monthlyPayments,
    unpaidMonths: unpaidMonthNames,
    expiryDate,
    renew: monthlyFee,
    due,
    discount,
    charges,
    bank,
    cash,
    balance: due,
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
  const envId = (process.env.SPREADSHEET_ID || '').trim().replace(/^["']|["']$/g, '');
  return envId || '1ZTu28UuoqngxqHavlcF2lRiuBHslY_sNWqw-mYpiw0k';
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

let _resolvedSheetId = null;

async function resolveSheetId() {
  if (_resolvedSheetId !== null && _resolvedSheetId !== undefined) return _resolvedSheetId;
  try {
    const client = await getClient();
    const spreadsheetId = getSpreadsheetId();
    const sheetName = await resolveSheetName();
    const meta = await client.spreadsheets.get({ spreadsheetId });
    if (meta.data.sheets && meta.data.sheets.length > 0) {
      const match = meta.data.sheets.find(s => s.properties.title === sheetName);
      if (match && match.properties.sheetId !== undefined) {
        _resolvedSheetId = match.properties.sheetId;
        return _resolvedSheetId;
      }
      _resolvedSheetId = meta.data.sheets[0].properties.sheetId;
      return _resolvedSheetId;
    }
  } catch (err) {
    console.warn('⚠️ Could not resolve sheetId:', err.message);
  }
  _resolvedSheetId = 0;
  return 0;
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
    (item.boxNo && item.boxNo.toLowerCase().includes(searchTerm)) ||
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

function colIndexToLetter(idx) {
  let letter = '';
  let temp = idx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Record a payment and update row in Google Sheets.
 * Always writes to the target 2026 month grid cell (Jan-26 ... Dec-26).
 * Writes Transaction ID to Column N / TRANSACTION_ID.
 */
async function updatePayment(rowIndex, paymentMode, paymentAmount, discountAmount = 0, transactionId = '', notes = '', targetUsername = '', selectedMonthKey = '') {
  const discountVal = parseFloat(discountAmount) || 0;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const shortDate = `${today.getDate()}/${today.getMonth() + 1}`;

  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = await resolveSheetName();
      const spreadsheetId = getSpreadsheetId();

      const current = await getCustomerByRow(rowIndex, targetUsername);
      if (!current) throw new Error(`Customer not found for row ${rowIndex} / ${targetUsername}`);
      const index = current.rowIndex;

      // 1. Resolve Target Month Key
      let targetMonthKey = selectedMonthKey;
      if (!targetMonthKey && current.monthlyPayments) {
        const unpaidObj = current.monthlyPayments.find(m => m.status === 'Unpaid');
        if (unpaidObj) targetMonthKey = unpaidObj.key;
      }
      if (!targetMonthKey) {
        const monthShort = MONTH_LIST[today.getMonth()].key;
        targetMonthKey = monthShort;
      }

      const targetMonthIndex = MONTH_LIST.findIndex(m => m.key === targetMonthKey);
      const monthColIdx = (COL.MONTH_COLS && COL.MONTH_COLS[targetMonthKey] !== undefined && COL.MONTH_COLS[targetMonthKey] !== -1)
        ? COL.MONTH_COLS[targetMonthKey]
        : (targetMonthIndex !== -1 ? 8 + targetMonthIndex : -1);

      if (monthColIdx !== -1) {
        const colLetter = colIndexToLetter(monthColIdx);
        
        const existingMonthObj = current.monthlyPayments ? current.monthlyPayments.find(m => m.key === targetMonthKey) : null;
        const existingCellText = (existingMonthObj && existingMonthObj.details && existingMonthObj.details !== 'Unpaid' && existingMonthObj.details !== 'Paid' && existingMonthObj.details !== 'Not Due')
          ? existingMonthObj.details.trim()
          : '';

        const newEntry = `${paymentAmount} (${paymentMode} ${shortDate})`;
        const updatedCellText = existingCellText ? `${existingCellText}, ${newEntry}` : newEntry;

        console.log(`📝 Writing month payment cell ${colLetter}${index}: "${updatedCellText}"`);
        await client.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!${colLetter}${index}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[updatedCellText]] },
        });

        // Change target month cell background color to Green in Google Sheets
        try {
          const targetSheetId = await resolveSheetId();
          await client.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  repeatCell: {
                    range: {
                      sheetId: targetSheetId,
                      startRowIndex: index - 1,
                      endRowIndex: index,
                      startColumnIndex: monthColIdx,
                      endColumnIndex: monthColIdx + 1,
                    },
                    cell: {
                      userEnteredFormat: {
                        backgroundColor: {
                          red: 0.819,   // Light green #D1FAE5
                          green: 0.98,
                          blue: 0.898,
                        },
                      },
                    },
                    fields: 'userEnteredFormat.backgroundColor',
                  },
                },
              ],
            },
          });
          console.log(`🎨 Cell ${colLetter}${index} background color updated to GREEN in Google Sheets.`);
        } catch (colorErr) {
          console.warn('⚠️ Could not update cell color on Google Sheet:', colorErr.message);
        }
      }

      // 2. Write Transaction ID (Column N or TRANSACTION_ID)
      if (transactionId && transactionId.trim()) {
        const txnColIdx = COL.TRANSACTION_ID !== -1 ? COL.TRANSACTION_ID : 13; // Column N (index 13)
        const txnColLetter = colIndexToLetter(txnColIdx);
        try {
          await client.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!${txnColLetter}${index}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[transactionId.trim()]] },
          });
        } catch (e) {
          console.warn('Could not write Transaction ID to column:', e.message);
        }
      }

      // 3. Write Discount (if discountVal > 0 and DISCOUNT column exists)
      if (discountVal > 0 && COL.DISCOUNT !== -1) {
        const discColLetter = colIndexToLetter(COL.DISCOUNT);
        const newTotalDiscount = (current.discount || 0) + discountVal;
        try {
          await client.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!${discColLetter}${index}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[newTotalDiscount]] },
          });
        } catch (e) {
          console.warn('Could not write discount to column:', e.message);
        }
      }

      console.log(`✅ Payment recorded on Google Sheet row ${index} for ${current.username}`);

      // Log in memory transaction history
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
        notes: notes || `${paymentMode} collection for ${targetMonthKey}`
      });

      return await getCustomerByRow(index, targetUsername);
    } catch (err) {
      console.error('❌ Google Sheet update error:', err.message);
      throw err;
    }
  }

  // Local fallback
  return null;
}

/**
 * Add a new customer account to Google Sheet or memory ledger.
 */
async function addCustomer(customerData) {
  const { username, mobile, ipAddress, renew, due, date1, location } = customerData;
  const planRate = parseFloat(renew) || 0;
  const initialDue = parseFloat(due) || 0;
  const renewDate = date1 || '';
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
      const spreadsheetId = getSpreadsheetId();

      // Values array mapping columns A to H for SSC USERS APP
      const rowValues = [
        username || '',
        mobile || '',
        location || '',
        ipAddress || '', // Customer #
        '', // Serial Number
        'Active', // Status
        renew ? `${renew} Plan` : '', // Base Pack
        renewDate || '' // Expiry Date
      ];

      await client.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:H`,
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
    forField: '',
  };

  localLedger.push(newCustomer);
  return newCustomer;
}

/**
 * Register a complaint or priority flag on a customer account.
 * Updates Column I (Notes / Complaints).
 */
async function updateComplaint(rowIndex, urgent, complaint) {
  const index = parseInt(rowIndex, 10);
  
  // Format the note field
  let noteText = urgent ? `[URGENT] ${complaint.trim()}` : complaint.trim();

  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = await resolveSheetName();
      const spreadsheetId = getSpreadsheetId();

      const current = await getCustomerByRow(index);
      if (!current) throw new Error(`Customer not found for row ${index}`);
      const targetIndex = current.rowIndex;

      // Target Column I for Notes / Complaints (index 8, letter I)
      const targetColIdx = COL.FOR !== -1 ? COL.FOR : 8;
      const colLetter = colIndexToLetter(targetColIdx);

      // Ensure header I1 is "Notes / Complaints" if missing
      if (COL.FOR === -1 && targetColIdx === 8) {
        try {
          await client.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!I1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['Notes / Complaints']] },
          });
        } catch (e) {
          // ignore header update error
        }
      }

      const updateRange = `'${sheetName}'!${colLetter}${targetIndex}`;
      const values = [[noteText]];

      console.log(`📝 Writing complaint to sheet "${sheetName}" cell ${colLetter}${targetIndex}: "${noteText}"`);

      await client.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      console.log(`✅ Complaint written to Google Sheet cell ${colLetter}${targetIndex}`);

      return await getCustomerByRow(targetIndex);
    } catch (err) {
      console.error('❌ Google Sheet update complaint error:', err.message);
      throw err;
    }
  }

  // Fallback to local copy
  const customer = localLedger.find(c => c.rowIndex === index);
  if (!customer) throw new Error(`Customer not found at row ${index}`);

  customer.forField = noteText;
  return customer;
}

/**
 * Log or update STB Geolocation coordinates.
 * Once logged, location becomes LOCKED unless user is Admin or unlocked by Admin.
 */
async function updateSTBLocation(rowIndex, lat, lng, loggedBy, userRole) {
  const index = parseInt(rowIndex, 10);
  const current = await getCustomerByRow(index);
  if (!current) throw new Error(`Customer not found for row ${index}`);

  const targetIndex = current.rowIndex;
  const userKey = (current.username || `row_${targetIndex}`).toLowerCase().trim();
  const existingLoc = stbLocationStore.get(userKey) || stbLocationStore.get(String(targetIndex));
  const isAdmin = userRole === 'admin';

  if (existingLoc && existingLoc.isLocked && !isAdmin) {
    throw new Error('STB location is LOCKED. Permission from Admin is required to change this location.');
  }

  const updatedLoc = {
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    isLocked: true,
    loggedBy: loggedBy || (isAdmin ? 'Admin' : 'Field Employee'),
    loggedAt: new Date().toISOString(),
    username: current.username,
    rowIndex: targetIndex,
  };

  stbLocationStore.set(userKey, updatedLoc);
  stbLocationStore.set(String(targetIndex), updatedLoc);
  saveSTBLocations();

  console.log(`📍 STB Location logged & locked for "${current.username}" (Row ${targetIndex}): (${lat}, ${lng}) by ${updatedLoc.loggedBy}`);

  // Write location string to Google Sheet column LOCATION (Column C or COL.LOCATION)
  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = await resolveSheetName();
      const spreadsheetId = getSpreadsheetId();

      const locColIdx = (COL.LOCATION !== undefined && COL.LOCATION !== -1) ? COL.LOCATION : 2; // Column C
      const colLetter = colIndexToLetter(locColIdx);
      const locValue = `${updatedLoc.lat.toFixed(6)},${updatedLoc.lng.toFixed(6)} (LOCKED)`;

      await client.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!${colLetter}${targetIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[locValue]] },
      });
      console.log(`✅ Location written to Google Sheet cell ${colLetter}${targetIndex}: "${locValue}"`);
    } catch (sheetErr) {
      console.warn('⚠️ Could not write location to Google Sheet:', sheetErr.message);
    }
  }

  return await getCustomerByRow(targetIndex, current.username);
}

/**
 * Submit a request to Admin to unlock STB location coordinates.
 */
async function requestLocationUnlock(rowIndex, username, requestedBy, reason) {
  const index = parseInt(rowIndex, 10);
  const req = {
    id: `req_${Date.now()}_${index}`,
    rowIndex: index,
    username: username || `Row ${index}`,
    requestedBy: requestedBy || 'Field Tech',
    reason: reason || 'STB re-installed or moved to new location',
    timestamp: new Date().toISOString(),
    status: 'PENDING',
  };
  unlockRequestsStore.push(req);
  console.log(`🔓 Location Unlock Request submitted for Row ${index} by ${req.requestedBy}`);
  return req;
}

/**
 * Retrieve all pending unlock requests for Admin dashboard.
 */
function getUnlockRequests() {
  return unlockRequestsStore;
}

/**
 * Admin approves or unlocks an STB location.
 */
async function approveLocationUnlock(requestId) {
  const req = unlockRequestsStore.find(r => r.id === requestId);
  if (!req) throw new Error('Unlock request not found.');
  req.status = 'APPROVED';

  const index = req.rowIndex;
  const userKey = (req.username || `row_${index}`).toLowerCase().trim();
  
  if (stbLocationStore.has(userKey)) {
    const loc = stbLocationStore.get(userKey);
    loc.isLocked = false; // Unlocked!
    stbLocationStore.set(userKey, loc);
  }
  if (stbLocationStore.has(String(index))) {
    const loc = stbLocationStore.get(String(index));
    loc.isLocked = false; // Unlocked!
    stbLocationStore.set(String(index), loc);
  }
  saveSTBLocations();

  console.log(`✅ Admin approved location unlock for Row ${index} (${req.username})`);
  return await getCustomerByRow(index, req.username);
}

/**
 * Update Customer Profile (Name, Mobile, Box Number).
 * Editable by all user profiles.
 */
async function updateCustomerProfile(rowIndex, { username, mobile, boxNo }) {
  const index = parseInt(rowIndex, 10);
  if (isNaN(index)) throw new Error('Invalid row index');

  const current = await getCustomerByRow(index);
  if (!current) throw new Error(`Customer not found for row ${index}`);

  const targetIndex = current.rowIndex;

  if (boxNo !== undefined) {
    stbBoxNoStore.set(targetIndex, String(boxNo).trim());
  }

  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = await resolveSheetName();
      const spreadsheetId = getSpreadsheetId();

      // 1. Update Username if column exists & provided
      if (username !== undefined && username.trim() && COL.USERNAME !== -1) {
        const colLetter = colIndexToLetter(COL.USERNAME);
        await client.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!${colLetter}${targetIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[username.trim()]] },
        });
      }

      // 2. Update Mobile if column exists & provided
      if (mobile !== undefined && COL.MOBILE !== -1) {
        const colLetter = colIndexToLetter(COL.MOBILE);
        await client.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!${colLetter}${targetIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[mobile.trim()]] },
        });
      }

      // 3. Update Box No if column exists
      if (boxNo !== undefined && COL.BOX_NO !== undefined && COL.BOX_NO !== -1) {
        const colLetter = colIndexToLetter(COL.BOX_NO);
        await client.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!${colLetter}${targetIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[boxNo.trim()]] },
        });
      }

      console.log(`✅ Profile updated for Row ${targetIndex}: Name="${username || current.username}", Mobile="${mobile || current.mobile}", BoxNo="${boxNo || ''}"`);
    } catch (err) {
      console.warn('⚠️ Could not update profile in Google Sheet:', err.message);
    }
  }

  // Update local ledger if fallback
  const localCust = localLedger.find(c => c.rowIndex === targetIndex);
  if (localCust) {
    if (username) localCust.username = username.trim();
    if (mobile) localCust.mobile = mobile.trim();
    if (boxNo) localCust.boxNo = boxNo.trim();
  }

  return await getCustomerByRow(targetIndex);
}

module.exports = {
  getAllCustomers,
  searchCustomers,
  getCustomerByRow,
  updatePayment,
  addCustomer,
  updateComplaint,
  updateSTBLocation,
  requestLocationUnlock,
  getUnlockRequests,
  approveLocationUnlock,
  updateCustomerProfile,
  getAllRows,
  detectColumnsFromHeader,
  rowToCustomer,
};
