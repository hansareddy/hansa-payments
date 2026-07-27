const path = require('path');
const { google } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'googleapis'));
const fs = require('fs');

async function runMigration() {
  const SPREADSHEET_ID = '1ZTu28UuoqngxqHavlcF2lRiuBHslY_sNWqw-mYpiw0k';
  let keyPath = path.join(__dirname, '..', 'backend', 'smart-firmament-496107-b0-f31ca0d4791d.json');
  if (!fs.existsSync(keyPath)) {
    const files = fs.readdirSync(path.join(__dirname, '..', 'backend'));
    const jsonKey = files.find(f => f.includes('smart-firmament') || (f.endsWith('.json') && !f.includes('package') && !f.includes('stb')));
    if (jsonKey) keyPath = path.join(__dirname, '..', 'backend', jsonKey);
  }

  if (!fs.existsSync(keyPath)) {
    console.error('Service account key missing at:', keyPath);
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  console.log('Fetching spreadsheet metadata...');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const firstSheet = meta.data.sheets[0];
  const sheetTitle = firstSheet.properties.title;
  const sheetId = firstSheet.properties.sheetId;

  console.log(`Working on sheet tab: "${sheetTitle}" (ID: ${sheetId})`);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetTitle}'!A1:AZ200`,
  });

  const rows = res.data.values || [];
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = (rows[i] || []).join(' ').toLowerCase();
    if (rowStr.includes('jan-26') || rowStr.includes('january') || rowStr.includes('subscriber') || rowStr.includes('name')) {
      headerRowIdx = i;
      break;
    }
  }

  console.log(`Header row index: ${headerRowIdx + 1}`);
  const headerRow = rows[headerRowIdx] || [];

  const MONTH_LIST = [
    { key: 'Jan-26', short: 'Jan', name: 'January 2026' },
    { key: 'Feb-26', short: 'Feb', name: 'February 2026' },
    { key: 'Mar-26', short: 'Mar', name: 'March 2026' },
    { key: 'Apr-26', short: 'Apr', name: 'April 2026' },
    { key: 'May-26', short: 'May', name: 'May 2026' },
    { key: 'Jun-26', short: 'Jun', name: 'June 2026' },
    { key: 'Jul-26', short: 'Jul', name: 'July 2026' },
    { key: 'Aug-26', short: 'Aug', name: 'August 2026' },
    { key: 'Sep-26', short: 'Sep', name: 'September 2026' },
    { key: 'Oct-26', short: 'Oct', name: 'October 2026' },
    { key: 'Nov-26', short: 'Nov', name: 'November 2026' },
    { key: 'Dec-26', short: 'Dec', name: 'December 2026' },
  ];

  // Determine month column start
  let monthStartIdx = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').trim();
    const hLower = h.toLowerCase();
    const isMonthCol = MONTH_LIST.some(m => 
      hLower.includes(m.short.toLowerCase()) || hLower.includes(m.key.toLowerCase())
    );
    if (isMonthCol && monthStartIdx === -1) {
      monthStartIdx = i;
    }
  }

  if (monthStartIdx === -1) monthStartIdx = 8; // Default to column I

  const baseHeaders = headerRow.slice(0, monthStartIdx);
  const newHeaderRow = [...baseHeaders];

  MONTH_LIST.forEach(m => {
    newHeaderRow.push(`${m.key}`);
    newHeaderRow.push(`${m.key} Paid`);
    newHeaderRow.push(`${m.key} Details`);
  });

  // Build new grid values
  const newRows = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const oldRow = rows[rIdx] || [];
    if (rIdx < headerRowIdx) {
      newRows.push(oldRow);
      continue;
    }
    if (rIdx === headerRowIdx) {
      newRows.push(newHeaderRow);
      continue;
    }

    const rowBase = oldRow.slice(0, monthStartIdx);
    const newRow = [...rowBase];

    MONTH_LIST.forEach(m => {
      const shortLower = m.short.toLowerCase();
      const keyLower = m.key.toLowerCase();

      // Find old fee & paid values
      let oldFeeVal = '';
      let oldPaidVal = '';

      for (let c = monthStartIdx; c < oldRow.length; c++) {
        const colHeader = String(headerRow[c] || '').trim().toLowerCase();
        if (colHeader.includes(shortLower) || colHeader.includes(keyLower)) {
          if (colHeader.includes('paid') || colHeader.includes('collected')) {
            oldPaidVal = String(oldRow[c] || '').trim();
          } else if (!colHeader.includes('detail')) {
            oldFeeVal = String(oldRow[c] || '').trim();
          }
        }
      }

      // Check if fee or paid contains merged details e.g. "300 (BANK 27/7)"
      let fee = oldFeeVal || '300';
      let paid = oldPaidVal;
      let details = '';

      if (paid.includes('(') || paid.includes('CASH') || paid.includes('BANK') || paid.includes('UPI')) {
        const amtMatch = paid.match(/^(\d+(\.\d+)?)/);
        const detailsMatch = paid.match(/\((.*?)\)/);

        if (amtMatch) paid = amtMatch[1];
        if (detailsMatch) details = detailsMatch[1];
        else details = paid.replace(amtMatch ? amtMatch[0] : '', '').trim();
      }

      if (fee.includes('(') || fee.includes('CASH') || fee.includes('BANK') || fee.includes('UPI')) {
        const amtMatch = fee.match(/^(\d+(\.\d+)?)/);
        if (amtMatch) fee = amtMatch[1];
      }

      newRow.push(fee);
      newRow.push(paid);
      newRow.push(details);
    });

    newRows.push(newRow);
  }

  console.log(`Writing updated 3-column grid to "${sheetTitle}"...`);

  // Clear existing values and update
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetTitle}'!A1:AZ200`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetTitle}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: newRows },
  });

  console.log('Grid updated! Now formatting headers...');

  // Format header row
  const formatRequests = [];

  let cOffset = monthStartIdx;
  MONTH_LIST.forEach(() => {
    // Fee header
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRowIdx, endRowIndex: headerRowIdx + 1, startColumnIndex: cOffset, endColumnIndex: cOffset + 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.118, green: 0.227, blue: 0.541 }, // Navy #1E3A8A
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    // Paid header
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRowIdx, endRowIndex: headerRowIdx + 1, startColumnIndex: cOffset + 1, endColumnIndex: cOffset + 2 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.655, green: 0.953, blue: 0.816 }, // Mint #A7F3D0
            textFormat: { foregroundColor: { red: 0.02, green: 0.35, blue: 0.22 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    // Details header
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRowIdx, endRowIndex: headerRowIdx + 1, startColumnIndex: cOffset + 2, endColumnIndex: cOffset + 3 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.886, green: 0.91, blue: 0.941 }, // Slate #E2E8F0
            textFormat: { foregroundColor: { red: 0.118, green: 0.16, blue: 0.23 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    cOffset += 3;
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: formatRequests },
  });

  console.log('✅ Migration to 3-column month schema finished successfully!');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
});
