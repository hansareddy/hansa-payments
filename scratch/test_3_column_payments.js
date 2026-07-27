const { getAllCustomers, updatePayment } = require('../backend/sheets');

async function test3ColumnFlow() {
  console.log('--- 🧪 Testing 3-Column Month Sheet Integration ---');
  
  const customers = await getAllCustomers();
  console.log(`Successfully fetched ${customers.length} customers.`);

  if (customers.length > 0) {
    const testCust = customers[0];
    console.log(`Test Customer: ${testCust.username} (Row ${testCust.rowIndex})`);
    console.log('Monthly Payments Sample:', testCust.monthlyPayments ? testCust.monthlyPayments.slice(0, 3) : 'None');

    // Record test payment for Jan-26
    console.log('Recording test payment of 300 via PhonePe for Jan-26...');
    const result = await updatePayment({
      rowIndex: testCust.rowIndex,
      paymentMode: 'PhonePe',
      paymentAmount: 300,
      discount: 0,
      transactionId: 'TXN987654321',
      monthKey: 'Jan-26',
      username: testCust.username,
    });

    console.log('Payment result:', result ? 'SUCCESS' : 'FAILED');

    const updatedCusts = await getAllCustomers();
    const updatedTestCust = updatedCusts.find(c => c.rowIndex === testCust.rowIndex);
    console.log('Updated Jan-26 payment:', updatedTestCust ? updatedTestCust.monthlyPayments[0] : 'None');
  }

  console.log('--- ✅ Test Finished ---');
}

test3ColumnFlow().catch(err => {
  console.error('Test Failed:', err);
});
