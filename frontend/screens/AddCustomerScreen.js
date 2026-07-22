/**
 * AddCustomerScreen - Create New Customer Account
 * Refined font-weights for a cleaner layout.
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
  StatusBar,
  Vibration,
  Modal,
  FlatList,
} from 'react-native';
import { createCustomer } from '../services/api';

export default function AddCustomerScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [mobile, setMobile] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [renew, setRenew] = useState('');
  const [due, setDue] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async () => {
    if (!username.trim()) {
      Alert.alert('Validation Error', 'Please enter a Username.');
      return;
    }

    Vibration.vibrate(30);
    setLoading(true);

    try {
      const payload = {
        username: username.trim(),
        mobile: mobile.trim() || undefined,
        ipAddress: ipAddress.trim() || undefined,
        renew: parseFloat(renew) || 0,
        due: parseFloat(due) || 0,
        date1: getFormattedDateString(selectedDate),
      };

      await createCustomer(payload);
      
      Alert.alert(
        'Success',
        'Customer account created successfully!',
        [
          { 
            text: 'OK', 
            onPress: () => {
              navigation.navigate('CustomerList');
            } 
          }
        ]
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calendar Modal State
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <Text style={styles.screenTitle}>Create Customer Account</Text>
        <Text style={styles.screenSub}>Add a new client ledger profile directly to Google Sheets.</Text>

        {/* Username */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Username / ID *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. HCS_CLIENTNAME"
            placeholderTextColor="#94A3B8"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Mobile */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Mobile Number</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. 9848022338"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={mobile}
            onChangeText={setMobile}
          />
        </View>

        {/* IP Address */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>IP Address</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. 172.168.104.200"
            placeholderTextColor="#94A3B8"
            value={ipAddress}
            onChangeText={setIpAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Monthly Plan Rate */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Monthly Plan Rate (₹)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. 600"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            value={renew}
            onChangeText={setRenew}
          />
        </View>

        {/* Initial Outstanding Dues */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Initial Outstanding Due Dues (₹)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. 1200"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            value={due}
            onChangeText={setDue}
          />
        </View>

        {/* Renewal Target Date */}
        <View style={styles.inputCard}>
          <Text style={styles.fieldLabel}>Renewal Date</Text>
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
            <Text style={styles.submitBtnText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
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
    padding: 18,
    paddingBottom: 40,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '600', // Refined bold
    color: '#0F172A',
    marginTop: 10,
    letterSpacing: -0.5,
  },
  screenSub: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 20,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 4,
    outlineStyle: 'none',
  },
  dateSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 48,
  },
  dateSelectorIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#64748B',
  },
  dateSelectorText: {
    fontSize: 15,
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
    marginTop: 14,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  cancelBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
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
});
