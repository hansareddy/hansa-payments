/**
 * Google Sheets Service Layer
 * Handles all communication with the Google Sheets API.
 * Includes graceful fallback to local ledger data if Google credentials are not yet configured.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Column index mapping (0-based)
const COL = {
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
};

// Sample ledger data parsed from SAGAR 2022 PDF for instant availability
let localLedger = [
  { rowIndex: 2, username: 'HCS_PILLA', mobile: '9441695167', ipAddress: '172.168.104.49', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '7', date2: '', forField: '' },
  { rowIndex: 3, username: 'HCS_APRTA', mobile: '9908492567', ipAddress: '172.168.104.50', renew: 600, due: 600, discount: 0, charges: 0, bank: 0, cash: 0, balance: 600, date1: '', date2: '', forField: '' },
  { rowIndex: 4, username: 'HCS_PENDYALA', mobile: '9491771812', ipAddress: '172.168.104.51', renew: 600, due: 600, discount: 0, charges: 0, bank: 0, cash: 0, balance: 600, date1: '', date2: '', forField: '' },
  { rowIndex: 5, username: 'HCS_KADIMI', mobile: '9000580395', ipAddress: '172.168.104.52', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '', date2: '', forField: '' },
  { rowIndex: 6, username: 'HCS_TVAPPARAO', mobile: '9493121001', ipAddress: '172.168.104.53', renew: 600, due: 600, discount: 0, charges: 0, bank: 0, cash: 0, balance: 600, date1: '', date2: '', forField: '' },
  { rowIndex: 7, username: 'HCS_DWARAMPUDI', mobile: '9493120031', ipAddress: '172.168.104.54', renew: 600, due: 1600, discount: 0, charges: 0, bank: 1000, cash: 600, balance: 0, date1: '24', date2: '', forField: '' },
  { rowIndex: 8, username: 'HCS_MAZEED', mobile: '7382784274', ipAddress: '172.168.104.55', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '12.01', date2: '', forField: '' },
  { rowIndex: 9, username: 'HCS_SHOBHAN', mobile: '9704978756', ipAddress: '172.168.104.56', renew: 600, due: 600, discount: 0, charges: 0, bank: 0, cash: 0, balance: 600, date1: '', date2: '', forField: '' },
  { rowIndex: 10, username: 'HCS_KETHANI', mobile: '9490570018', ipAddress: '172.168.104.57', renew: 600, due: 600, discount: 0, charges: 0, bank: 0, cash: 0, balance: 600, date1: '', date2: '', forField: '' },
  { rowIndex: 11, username: 'HCS_RAMPRASAD', mobile: '9010861086', ipAddress: '172.168.104.58', renew: 600, due: 1800, discount: 0, charges: 0, bank: 1200, cash: 0, balance: 600, date1: '', date2: '', forField: '' },
  { rowIndex: 12, username: 'HCS_YEMINENI', mobile: '9440573884', ipAddress: '172.168.104.59', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '17', date2: '', forField: '' },
  { rowIndex: 13, username: 'HCS_VADDE', mobile: '9030842400', ipAddress: '172.168.104.60', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '24', date2: '', forField: '' },
  { rowIndex: 14, username: 'HCS_MACHA', mobile: '8500616371', ipAddress: '172.168.104.61', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 600, balance: 0, date1: '25', date2: '', forField: '' },
  { rowIndex: 15, username: 'HCS_KALLURI', mobile: '9963646187', ipAddress: '172.168.104.62', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '11', date2: '', forField: '' },
  { rowIndex: 16, username: 'HCS_BANGI', mobile: '9441451824', ipAddress: '172.168.104.64', renew: 600, due: 1200, discount: 0, charges: 0, bank: 600, cash: 0, balance: 600, date1: '', date2: '', forField: '' },
  { rowIndex: 17, username: 'HCS_MANNARU', mobile: '9493801375', ipAddress: '172.168.104.65', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '5', date2: '', forField: '' },
  { rowIndex: 18, username: 'HCS_MISHAEL', mobile: '9493120189', ipAddress: '172.168.104.67', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '12', date2: '', forField: '' },
  { rowIndex: 19, username: 'HCS_DAGGUBATI', mobile: '9491049480', ipAddress: '172.168.104.68', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '20', date2: '', forField: '' },
  { rowIndex: 20, username: 'HCS_RAMANA', mobile: '7989426158', ipAddress: '172.168.104.73', renew: 600, due: 1000, discount: 0, charges: 0, bank: 400, cash: 600, balance: 0, date1: '20', date2: '', forField: '' },
  { rowIndex: 21, username: 'HCS_PVSRAO', mobile: '9490138480', ipAddress: '172.168.104.74', renew: 600, due: 3000, discount: 0, charges: 0, bank: 2400, cash: 600, balance: 0, date1: '', date2: '', forField: '' },
  { rowIndex: 22, username: 'hcs_srinivas', mobile: '9440103251', ipAddress: '172.168.104.78', renew: 600, due: 4200, discount: 0, charges: 0, bank: 3600, cash: 600, balance: 0, date1: '', date2: '', forField: '' },
  { rowIndex: 23, username: 'hcs_gouthampalvai', mobile: '8886345366', ipAddress: '172.168.104.79', renew: 600, due: 600, discount: 0, charges: 0, bank: 600, cash: 0, balance: 0, date1: '5', date2: '', forField: '' },
  { rowIndex: 24, username: 'hcs_jogi', mobile: '8985384920', ipAddress: '172.168.104.140', renew: 600, due: 1200, discount: 0, charges: 0, bank: 600, cash: 600, balance: 0, date1: '04-31', date2: '', forField: '' },
  { rowIndex: 25, username: 'hcs_chary', mobile: '9490487880', ipAddress: '172.168.104.145', renew: 600, due: 1200, discount: 0, charges: 0, bank: 1200, cash: 600, balance: 600, date1: '12, 31', date2: '', forField: '' }
];

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

async function getClient() {
  if (sheetsClient) return sheetsClient;

  let auth;

  // Priority 1: Base64-encoded credentials (most reliable for cloud deployment)
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    try {
      const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8');
      const credentials = JSON.parse(decoded);
      console.log('✅ Google credentials loaded from GOOGLE_CREDENTIALS_BASE64');
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } catch (err) {
      console.error('Failed to parse GOOGLE_CREDENTIALS_BASE64:', err.message);
    }
  }

  // Priority 2: Raw JSON string (may have escape issues from web paste)
  if (!auth && process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      console.log('✅ Google credentials loaded from GOOGLE_CREDENTIALS_JSON');
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } catch (err) {
      console.error('Failed to parse GOOGLE_CREDENTIALS_JSON:', err.message);
    }
  }

  // Priority 3: Local credentials file (development)
  if (!auth) {
    const credentialsPath = path.resolve(
      __dirname,
      process.env.GOOGLE_APPLICATION_CREDENTIALS || 'credentials.json'
    );
    auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
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

function rowToCustomer(row, rowIndex) {
  return {
    rowIndex,
    username: (row[COL.USERNAME] || '').trim(),
    mobile: (row[COL.MOBILE] || '').trim(),
    ipAddress: (row[COL.IP_ADDRESS] || '').trim(),
    renew: parseCurrency(row[COL.RENEW]),
    due: parseCurrency(row[COL.DUE]),
    discount: parseCurrency(row[COL.DISCOUNT]),
    charges: parseCurrency(row[COL.CHARGES]),
    bank: parseCurrency(row[COL.BANK]),
    cash: parseCurrency(row[COL.CASH]),
    balance: parseCurrency(row[COL.BALANCE]),
    date1: (row[COL.DATE1] || '').trim(),
    date2: (row[COL.DATE2] || '').trim(),
    forField: (row[COL.FOR] || '').trim(),
  };
}

async function getAllRows() {
  if (!isGoogleConfigured()) return null;
  const client = await getClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const configuredSheetName = process.env.SHEET_NAME;

  // Candidate tab names to try
  const candidateNames = configuredSheetName
    ? [configuredSheetName, configuredSheetName.trim(), `${configuredSheetName.trim()} `]
    : [];

  for (const name of candidateNames) {
    try {
      const response = await client.spreadsheets.values.get({
        spreadsheetId,
        range: `'${name}'!A:M`,
      });
      if (response.data.values && response.data.values.length > 0) {
        return response.data.values;
      }
    } catch (e) {
      // continue to next candidate
    }
  }

  // Fallback: query spreadsheet metadata to get the first tab title
  try {
    const meta = await client.spreadsheets.get({ spreadsheetId });
    if (meta.data.sheets && meta.data.sheets.length > 0) {
      const firstTabName = meta.data.sheets[0].properties.title;
      console.log(`Auto-detected sheet tab name: "${firstTabName}"`);
      const response = await client.spreadsheets.values.get({
        spreadsheetId,
        range: `'${firstTabName}'!A:M`,
      });
      return response.data.values || [];
    }
  } catch (err) {
    console.error('Failed to auto-detect sheet tabs:', err.message);
  }

  return [];
}

/**
 * Get all customers from the sheet or local ledger.
 */
async function getAllCustomers() {
  try {
    const rows = await getAllRows();
    if (rows && rows.length > 1) {
      const customers = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row && row.length > 0 && (row[COL.USERNAME] || row[COL.MOBILE])) {
          customers.push(rowToCustomer(row, i + 1));
        }
      }
      return customers;
    }
  } catch (err) {
    console.warn('Google Sheets fetch warning, fallback to local ledger:', err.message);
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
    item.username.toLowerCase().includes(searchTerm) ||
    item.mobile.toLowerCase().includes(searchTerm) ||
    item.ipAddress.toLowerCase().includes(searchTerm)
  );
}

/**
 * Get a single customer by row index.
 */
async function getCustomerByRow(rowIndex) {
  const all = await getAllCustomers();
  return all.find(c => c.rowIndex === parseInt(rowIndex, 10)) || null;
}

/**
 * Record a payment and update row.
 */
async function updatePayment(rowIndex, paymentMode, paymentAmount, discountAmount = 0, renewDate, notes) {
  const index = parseInt(rowIndex, 10);
  const discountVal = parseFloat(discountAmount) || 0;

  // If Google API is configured, write back to Google Sheet
  if (isGoogleConfigured()) {
    try {
      const client = await getClient();
      const sheetName = process.env.SHEET_NAME || 'Sheet1';
      const spreadsheetId = process.env.SPREADSHEET_ID;

      const current = await getCustomerByRow(index);
      if (!current) throw new Error(`Customer not found at row ${index}`);

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

      // Update F (DISCOUNT), G (CHARGES), H (BANK), I (CASH), J (BALANCE), K (DATE1), L (DATE2), M (FOR ?)
      const updateRange = `'${sheetName}'!F${index}:M${index}`;
      const values = [[
        newDiscount || 0,
        current.charges || 0,
        newBank || 0,
        newCash || 0,
        newBalance,
        renewDate || current.date1,
        current.date2,
        current.forField || '' // Preserve existing complaints/notes exactly
      ]];

      await client.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      return await getCustomerByRow(index);
    } catch (err) {
      console.warn('Google Sheet update error, updating local copy:', err.message);
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
  if (renewDate) customer.date1 = renewDate;
  // Preserve customer.forField (no changes to notes)

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
      const sheetName = process.env.SHEET_NAME || 'Sheet1';
      const spreadsheetId = process.env.SPREADSHEET_ID;

      // Values array mapping columns A to M
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
        'New account created' // FOR ?
      ];

      await client.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:M`,
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
      const sheetName = process.env.SHEET_NAME || 'Sheet1';
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
