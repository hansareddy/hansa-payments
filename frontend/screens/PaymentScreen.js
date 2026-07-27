/**
 * PaymentScreen - Record Transactions
 * Support recording optional discounts that update the sheet F (DISCOUNT) column.
 * Transaction ID is written to column N of the sheet.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
  Vibration,
  Image,
} from 'react-native';
import { recordPayment } from '../services/api';
import { enqueue, isNetworkError } from '../services/OfflineQueue';

export default function PaymentScreen({ route, navigation }) {
  const customer = route.params?.customer || {};
  const preselectMonth = route.params?.preselectMonth;

  // Find preselected or first unpaid month key
  const firstUnpaidMonth = customer?.monthlyPayments?.find(m => m.status === 'Unpaid');
  const targetMonthObj = preselectMonth 
    ? (customer?.monthlyPayments?.find(m => m.key === preselectMonth) || firstUnpaidMonth)
    : firstUnpaidMonth;

  const initialMonthKey = targetMonthObj ? targetMonthObj.key : (customer?.monthlyPayments?.[0]?.key || 'Jul-26');
  const initialAmount = targetMonthObj?.amount ? String(targetMonthObj.amount) : (customer?.monthlyFee ? String(customer.monthlyFee) : '300');

  const [selectedMonthKey, setSelectedMonthKey] = useState(initialMonthKey);
  const [paymentMode, setPaymentMode] = useState(null); // 'CASH' | 'GPAY' | 'PHONEPE' | 'PAYTM'
  const [amount, setAmount] = useState(initialAmount);
  const [discount, setDiscount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [updatedCustomer, setUpdatedCustomer] = useState(null);

  const getTodayString = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatCurrency = (val) => {
    return '₹' + Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getStatusColor = (balance) => {
    if (balance <= 0) return '#059669';
    if (balance <= 600) return '#D97706';
    return '#E11D48';
  };

  const handleSubmit = async () => {
    if (!paymentMode) {
      if (Platform.OS === 'web') alert('Payment Method Required: Please select Cash or a UPI Application.');
      else Alert.alert('Payment Method Required', 'Please select Cash or a UPI Application.');
      return;
    }
    if (!transactionId.trim()) {
      if (Platform.OS === 'web') alert('Transaction ID Required: Please enter the Transaction ID / Reference Number before submitting.');
      else Alert.alert('Transaction ID Required', 'Please enter the Transaction ID / Reference Number before submitting.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      if (Platform.OS === 'web') alert('Invalid Amount: Please input a valid transaction amount.');
      else Alert.alert('Invalid Amount', 'Please input a valid transaction amount.');
      return;
    }

    const discountVal = discount.trim() ? parseFloat(discount) : 0;
    if (isNaN(discountVal) || discountVal < 0) {
      if (Platform.OS === 'web') alert('Invalid Discount: Please input a valid discount amount.');
      else Alert.alert('Invalid Discount', 'Please input a valid discount amount.');
      return;
    }

    Vibration.vibrate(30);
    setLoading(true);

    try {
      const apiMode = paymentMode === 'CASH' ? 'CASH' : 'BANK';
      let notes = paymentMode === 'CASH' ? 'CASH payment' : `UPI: ${paymentMode}`;
      if (discountVal > 0) {
        notes += ` (Discounted ₹${discountVal})`;
      }

      const payload = {
        rowIndex: customer.rowIndex,
        username: customer.username,
        paymentMode: apiMode,
        paymentAmount: parseFloat(amount),
        discount: discountVal,
        transactionId: transactionId.trim(),
        notes: notes,
        monthKey: selectedMonthKey,
      };

      const result = await recordPayment(payload);

      Vibration.vibrate([0, 100, 50, 100]);
      setUpdatedCustomer(result.customer || { ...customer, ...payload, date1: getTodayString() });
      setSuccess(true);
    } catch (err) {
      if (isNetworkError(err)) {
        const payload = {
          rowIndex: customer.rowIndex,
          paymentMode: paymentMode === 'CASH' ? 'CASH' : 'BANK',
          paymentAmount: parseFloat(amount),
          discount: discountVal,
          transactionId: transactionId.trim(),
          notes: paymentMode === 'CASH' ? 'CASH payment' : `UPI: ${paymentMode}`,
          monthKey: selectedMonthKey,
        };
        await enqueue(payload, customer.username);
        Vibration.vibrate([0, 100, 50, 100]);
        setUpdatedCustomer({
          ...customer,
          transactionId: transactionId.trim(),
          date1: getTodayString(),
          isOffline: true,
        });
        setSuccess(true);
      } else {
        if (Platform.OS === 'web') alert(`Transaction Failed: ${err.message}`);
        else Alert.alert('Transaction Failed', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success && updatedCustomer) {
    const discountVal = discount.trim() ? parseFloat(discount) : 0;
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />
        <ScrollView contentContainerStyle={styles.successContainer}>
          <View style={styles.successCircle}>
            <Text style={styles.successCheck}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Transaction Saved</Text>
          <Text style={styles.successMsg}>
            Successfully registered {formatCurrency(parseFloat(amount))} via {paymentMode === 'CASH' ? 'Cash' : paymentMode}
            {discountVal > 0 ? ` (with ${formatCurrency(discountVal)} Discount)` : ''}
          </Text>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryName}>{updatedCustomer.username}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Outstanding Dues</Text>
              <Text style={[styles.summaryVal, { color: getStatusColor(updatedCustomer.balance) }]}>
                {formatCurrency(updatedCustomer.balance)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Discount Given</Text>
              <Text style={styles.summaryVal}>{formatCurrency(updatedCustomer.discount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment Date</Text>
              <Text style={styles.summaryVal}>{updatedCustomer.date1}</Text>
            </View>
            {transactionId.trim() ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Transaction ID</Text>
                <Text style={styles.summaryVal}>{transactionId.trim()}</Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: '#059669', marginBottom: 10 }]}
            onPress={() => navigation.navigate('CustomerDetail', { customer: updatedCustomer || customer, refresh: true })}
          >
            <Text style={styles.doneBtnText}>Back to Customer Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => navigation.navigate('CustomerList')}
          >
            <Text style={styles.doneBtnText}>Return to Accounts Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Customer Ledger Preview header */}
        {/* Billing Month Selector */}
        {customer.monthlyPayments && customer.monthlyPayments.length > 0 ? (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Select Month Being Paid</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {customer.monthlyPayments.map((m) => {
                const isSelected = selectedMonthKey === m.key;
                const isPaid = m.status === 'Paid';
                const isUnpaid = m.status === 'Unpaid';
                return (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => {
                      Vibration.vibrate(20);
                      setSelectedMonthKey(m.key);
                      if (isUnpaid) {
                        setAmount(String(m.amount || customer.monthlyFee || 300));
                      } else if (m.amount > 0) {
                        setAmount(String(m.amount));
                      }
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#2563EB' : (isPaid ? '#059669' : (isUnpaid ? '#EF4444' : '#CBD5E1')),
                      backgroundColor: isSelected ? '#EFF6FF' : (isPaid ? '#F0FDF4' : (isUnpaid ? '#FEF2F2' : '#FFFFFF')),
                      marginRight: 8,
                      alignItems: 'center',
                      minWidth: 85,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#1E40AF' : (isPaid ? '#047857' : (isUnpaid ? '#B91C1C' : '#334155')) }}>
                      {m.short}
                    </Text>
                    <Text style={{ fontSize: 10, color: isPaid ? '#059669' : (isUnpaid ? '#DC2626' : '#94A3B8'), marginTop: 2, fontWeight: '600' }}>
                      {isPaid ? 'Paid' : (isUnpaid ? `₹${m.amount}` : '-')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Payment mode selection & Transaction ID */}
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Payment Method</Text>
          
          <TouchableOpacity
            style={[styles.modeRowBtn, paymentMode === 'CASH' && styles.activeCashBtn]}
            onPress={() => setPaymentMode('CASH')}
          >
            <Image 
              source={{ uri: 'https://img.icons8.com/color/96/money-bag.png' }} 
              style={styles.brandLogo} 
            />
            <Text style={[styles.modeLabel, paymentMode === 'CASH' && styles.activeText]}>Cash Payment</Text>
            {paymentMode === 'CASH' && <Text style={styles.checkIcon}>✓ Selected</Text>}
          </TouchableOpacity>

          <Text style={styles.subDividerText}>OR CHOOSE UPI PROVIDER</Text>

          <View style={styles.upiGrid}>
            <TouchableOpacity
              style={[styles.upiBtn, paymentMode === 'GPAY' && styles.activeGpayBtn]}
              onPress={() => setPaymentMode('GPAY')}
            >
              <Image 
                source={{ uri: 'https://img.icons8.com/color/96/google-pay.png' }} 
                style={styles.upiLogo} 
              />
              <Text style={styles.upiLabel}>Google Pay</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.upiBtn, paymentMode === 'PHONEPE' && styles.activePhonepeBtn]}
              onPress={() => setPaymentMode('PHONEPE')}
            >
              <Image 
                source={{ uri: 'https://img.icons8.com/color/96/phone-pe.png' }} 
                style={styles.upiLogo} 
              />
              <Text style={styles.upiLabel}>PhonePe</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.upiBtn, paymentMode === 'PAYTM' && styles.activePaytmBtn]}
              onPress={() => setPaymentMode('PAYTM')}
            >
              <Image 
                source={{ uri: 'https://img.icons8.com/color/96/paytm.png' }} 
                style={styles.upiLogo} 
              />
              <Text style={styles.upiLabel}>Paytm</Text>
            </TouchableOpacity>
          </View>

          {/* Transaction ID — Required inside Payment Method */}
          <Text style={[styles.stepTitle, { marginTop: 16, marginBottom: 8 }]}>
            Transaction ID / Ref No. <Text style={{ color: '#E11D48' }}>*</Text>
          </Text>
          <View style={styles.txnIdBox}>
            <Text style={styles.txnIdIcon}>🧾</Text>
            <TextInput
              style={styles.txnIdInput}
              placeholder="Enter UPI Ref No. or Receipt ID (Required)"
              placeholderTextColor="#94A3B8"
              value={transactionId}
              onChangeText={setTransactionId}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Input Amount */}
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Collection Amount</Text>
          <View style={styles.amountBox}>
            <Text style={styles.rupeeSign}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>
        </View>

        {/* Input Discount */}
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Applied Discount (Optional)</Text>
          <View style={styles.amountBox}>
            <Text style={styles.rupeeSign}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              keyboardType="numeric"
              value={discount}
              onChangeText={setDiscount}
            />
          </View>
        </View>


        {/* Today's Date (read-only) */}
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Payment Date</Text>
          <View style={styles.dateSelectorBtn}>
            <Text style={styles.dateSelectorIcon}>📅</Text>
            <Text style={styles.dateSelectorText}>
              {getTodayString()}
            </Text>
            <Text style={styles.todayBadge}>Today</Text>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="large" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Transaction</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },
  headerInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  headerName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0F172A',
  },
  headerBalance: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E11D48',
    marginTop: 4,
  },
  stepCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modeRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  activeCashBtn: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  brandLogo: {
    width: 28,
    height: 28,
    marginRight: 10,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  activeText: {
    color: '#059669',
  },
  checkIcon: {
    color: '#059669',
    fontWeight: '600',
    fontSize: 13,
  },
  subDividerText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
    marginVertical: 12,
  },
  upiGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  upiBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
  },
  activeGpayBtn: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  activePhonepeBtn: {
    borderColor: '#8B5CF6',
    backgroundColor: '#F5F3FF',
  },
  activePaytmBtn: {
    borderColor: '#0EA5E9',
    backgroundColor: '#F0F9FF',
  },
  upiLogo: {
    width: 32,
    height: 32,
    marginBottom: 6,
    resizeMode: 'contain',
  },
  upiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 56,
  },
  rupeeSign: {
    color: '#64748B',
    fontSize: 24,
    fontWeight: '600',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '600',
    outlineStyle: 'none',
  },
  txnIdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 52,
  },
  txnIdIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  txnIdInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
    outlineStyle: 'none',
  },
  dateSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 52,
  },
  dateSelectorIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#64748B',
  },
  dateSelectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  todayBadge: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  submitBtn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  successContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D1FAE5',
    borderColor: '#059669',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successCheck: {
    color: '#059669',
    fontSize: 32,
    fontWeight: '600',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  successMsg: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 24,
  },
  summaryName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  doneBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    height: 50,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

