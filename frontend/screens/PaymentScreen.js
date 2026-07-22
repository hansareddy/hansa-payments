/**
 * PaymentScreen - Record Transactions
 * Support recording optional discounts that update the sheet F (DISCOUNT) column.
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
  Modal,
  FlatList,
} from 'react-native';
import { recordPayment } from '../services/api';
import { enqueue, isNetworkError } from '../services/OfflineQueue';

export default function PaymentScreen({ route, navigation }) {
  const { customer } = route.params;

  const [paymentMode, setPaymentMode] = useState(null); // 'CASH' | 'GPAY' | 'PHONEPE' | 'PAYTM'
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [updatedCustomer, setUpdatedCustomer] = useState(null);

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getFormattedDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
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
      Alert.alert('Payment Method Required', 'Please select Cash or a UPI Application.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please input a valid transaction amount.');
      return;
    }

    const discountVal = discount.trim() ? parseFloat(discount) : 0;
    if (isNaN(discountVal) || discountVal < 0) {
      Alert.alert('Invalid Discount', 'Please input a valid discount amount.');
      return;
    }

    Vibration.vibrate(30);

    const displayMode = paymentMode === 'CASH' ? 'Cash' : `UPI (${paymentMode})`;
    const dateStr = getFormattedDateString(selectedDate);

    const confirmationMsg = discountVal > 0 
      ? `Record ${displayMode} collection of ${formatCurrency(parseFloat(amount))} with a ${formatCurrency(discountVal)} discount for ${customer.username}?`
      : `Record ${displayMode} collection of ${formatCurrency(parseFloat(amount))} for ${customer.username}?`;

    Alert.alert(
      'Confirm Transaction',
      confirmationMsg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save Payment',
          onPress: async () => {
            setLoading(true);
              try {
                const apiMode = paymentMode === 'CASH' ? 'CASH' : 'BANK';
                
                let notes = paymentMode === 'CASH' ? 'CASH payment' : `UPI: ${paymentMode}`;
                if (discountVal > 0) {
                  notes += ` (Discounted ₹${discountVal})`;
                }

                const payload = {
                  rowIndex: customer.rowIndex,
                  paymentMode: apiMode,
                  paymentAmount: parseFloat(amount),
                  discount: discountVal,
                  renewDate: dateStr,
                  notes: notes,
                };

                const result = await recordPayment(payload);

                Vibration.vibrate([0, 100, 50, 100]);
                setUpdatedCustomer(result.customer);
                setSuccess(true);
              } catch (err) {
                if (isNetworkError(err)) {
                  const payload = {
                    rowIndex: customer.rowIndex,
                    paymentMode: paymentMode === 'CASH' ? 'CASH' : 'BANK',
                    paymentAmount: parseFloat(amount),
                    discount: discountVal,
                    renewDate: dateStr,
                    notes: paymentMode === 'CASH' ? 'CASH payment' : `UPI: ${paymentMode}`,
                  };
                  await enqueue(payload, customer.username);
                  Vibration.vibrate([0, 100, 50, 100]);
                  
                  // Compute local balance prediction for instant display
                  const paidVal = parseFloat(amount);
                  const newBal = Math.max(0, (customer.balance || 0) - paidVal - discountVal);
                  setUpdatedCustomer({
                    ...customer,
                    balance: newBal,
                    discount: (customer.discount || 0) + discountVal,
                    date1: dateStr,
                    isOffline: true,
                  });
                  setSuccess(true);
                } else {
                  Alert.alert('Transaction Failed', err.message);
                }
              } finally {
                setLoading(false);
              }
          },
        },
      ]
    );
  };

  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

  const changeMonth = (direction) => {
    let newMonth = calendarMonth + direction;
    let newYear = calendarYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
  };

  const renderCalendarModal = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    
    const daysArray = [];
    for (let i = 0; i < firstDayIndex; i++) {
      daysArray.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      daysArray.push(i);
    }

    return (
      <Modal visible={showCalendar} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowBtn}>
                <Text style={styles.arrowText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {MONTHS[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowBtn}>
                <Text style={styles.arrowText}>▶</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, index) => (
                <Text key={index} style={styles.weekdayHeader}>{d}</Text>
              ))}
            </View>

            <FlatList
              data={daysArray}
              numColumns={7}
              keyExtractor={(item, idx) => String(idx)}
              renderItem={({ item }) => {
                if (item === null) return <View style={styles.emptyDay} />;
                
                const isSelected = selectedDate.getDate() === item && 
                                   selectedDate.getMonth() === calendarMonth && 
                                   selectedDate.getFullYear() === calendarYear;
                
                return (
                  <TouchableOpacity
                    style={[styles.dayCell, isSelected && styles.selectedDayCell]}
                    onPress={() => {
                      Vibration.vibrate(20);
                      setSelectedDate(new Date(calendarYear, calendarMonth, item));
                      setShowCalendar(false);
                    }}
                  >
                    <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity 
              style={styles.closeCalendarBtn}
              onPress={() => setShowCalendar(false)}
            >
              <Text style={styles.closeCalendarText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
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
              <Text style={styles.summaryLabel}>Next Billing Date</Text>
              <Text style={styles.summaryVal}>{updatedCustomer.date1}</Text>
            </View>
          </View>

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
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{customer.username}</Text>
          <Text style={styles.headerBalance}>Account Balance: {formatCurrency(customer.balance)}</Text>
        </View>

        {/* Payment mode selection */}
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
                source={{ uri: 'https://raw.githubusercontent.com/PhonePe/phonepe-pg-sdk-php/master/phonepe-logo.png' }} 
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

        {/* Renew Date */}
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Billing Renewal Target Date</Text>
          <TouchableOpacity 
            style={styles.dateSelectorBtn} 
            onPress={() => { Vibration.vibrate(20); setShowCalendar(true); }}
          >
            <Text style={styles.dateSelectorIcon}>📅</Text>
            <Text style={styles.dateSelectorText}>
              {getFormattedDateString(selectedDate)}
            </Text>
            <Text style={styles.changeDateHint}>Change Date</Text>
          </TouchableOpacity>
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

      {/* Render Calendar Modal */}
      {renderCalendarModal()}
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
  changeDateHint: {
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '600',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calendarContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  arrowBtn: {
    padding: 8,
  },
  arrowText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayHeader: {
    width: 32,
    textAlign: 'center',
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  dayCell: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 1,
    borderRadius: 4,
  },
  selectedDayCell: {
    backgroundColor: '#1E3A8A',
  },
  emptyDay: {
    flex: 1,
    margin: 1,
  },
  dayText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  closeCalendarBtn: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  closeCalendarText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 13,
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
