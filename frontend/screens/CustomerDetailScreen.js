/**
 * CustomerDetailScreen - Customer Preview Screen
 * Refined font-weights for a cleaner layout.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Vibration,
  Linking,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { registerComplaint } from '../services/api';

export default function CustomerDetailScreen({ route, navigation }) {
  const { customer } = route.params;

  const [currentCustomer, setCurrentCustomer] = useState(customer);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [savingComplaint, setSavingComplaint] = useState(false);

  const formatCurrency = (val) => {
    return '₹' + Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleCall = () => {
    if (!currentCustomer.mobile) {
      Alert.alert('No Mobile Number', 'This account has no mobile number registered.');
      return;
    }
    Vibration.vibrate(20);
    Linking.openURL(`tel:${currentCustomer.mobile}`);
  };

  const handleWhatsApp = () => {
    if (!currentCustomer.mobile) {
      Alert.alert('No Mobile Number', 'This account has no mobile number registered.');
      return;
    }
    Vibration.vibrate(20);
    
    const message = `Hello ${currentCustomer.username}, this is a reminder from Hansa Communications regarding your outstanding internet service bill. Your remaining balance is ${formatCurrency(currentCustomer.balance)}. Please complete your payment at the earliest. Thank you!`;
    const whatsappUrl = `https://wa.me/91${currentCustomer.mobile}?text=${encodeURIComponent(message)}`;
    
    Linking.openURL(whatsappUrl).catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed on this device.');
    });
  };

  const handleSaveComplaint = async () => {
    if (!complaintText.trim()) {
      Alert.alert('Validation Error', 'Please enter a complaint description.');
      return;
    }

    setSavingComplaint(true);
    Vibration.vibrate(20);

    try {
      const result = await registerComplaint(currentCustomer.rowIndex, isUrgent, complaintText.trim());
      setCurrentCustomer(result.customer);
      setShowComplaintModal(false);
      setComplaintText('');
      setIsUrgent(false);
      Alert.alert('Success', 'Complaint registered successfully!');
    } catch (err) {
      Alert.alert('Failed to register', err.message);
    } finally {
      setSavingComplaint(false);
    }
  };

  const getStatusStyle = (balance) => {
    if (balance <= 0) return { color: '#059669', bg: '#D1FAE5', label: 'Account Settled' };
    if (balance <= 600) return { color: '#B45309', bg: '#FEF3C7', label: 'Partial Balance PENDING' };
    return { color: '#B91C1C', bg: '#FEE2E2', label: 'Payment Overdue' };
  };

  const status = getStatusStyle(currentCustomer.balance);
  const hasUrgentComplaint = currentCustomer.forField && currentCustomer.forField.startsWith('[URGENT]');
  const cleanComplaint = hasUrgentComplaint 
    ? currentCustomer.forField.replace('[URGENT]', '').trim() 
    : currentCustomer.forField;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Profile Card Header */}
        <View style={styles.card}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {(currentCustomer.username || '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{currentCustomer.username}</Text>
          
          <View style={[styles.statusTag, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        {/* URGENT COMPLAINT BANNER IF ACTIVE */}
        {hasUrgentComplaint && (
          <View style={styles.complaintBanner}>
            <Text style={styles.complaintBannerTitle}>⚠️ PENDING URGENT COMPLAINT</Text>
            <Text style={styles.complaintBannerMsg}>{cleanComplaint}</Text>
          </View>
        )}

        {/* MOBILE QUICK ACTIONS PANEL */}
        <View style={styles.actionsPanel}>
          <TouchableOpacity style={styles.actionBtnCall} onPress={handleCall}>
            <Text style={styles.actionBtnEmoji}>📞</Text>
            <Text style={styles.actionBtnLabel}>Call Client</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtnWa} onPress={handleWhatsApp}>
            <Text style={styles.actionBtnEmoji}>💬</Text>
            <Text style={styles.actionBtnLabel}>Send WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* Network & Contact Parameters */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Username / ID</Text>
            <Text style={styles.infoValue}>{currentCustomer.username}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Mobile Line</Text>
            <Text style={styles.infoValue}>{currentCustomer.mobile || '—'}</Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Allocated IP</Text>
            <Text style={styles.infoValue}>{currentCustomer.ipAddress || '—'}</Text>
          </View>
        </View>

        {/* Accounting Statement */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Balance Statement</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Outstanding Balance</Text>
            <Text style={[styles.infoValue, { color: status.color, fontWeight: '600', fontSize: 18 }]}>
              {formatCurrency(currentCustomer.balance)}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Initial Due Dues</Text>
            <Text style={[styles.infoValue, { color: '#64748B' }]}>
              {formatCurrency(currentCustomer.due)}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Base Plan Rate (Monthly)</Text>
            <Text style={[styles.infoValue, { color: '#0F172A' }]}>
              {formatCurrency(currentCustomer.renew)}
            </Text>
          </View>
        </View>

        {/* Audit Collections & Complaints */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Transaction & Ledger Notes</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Cash Collections</Text>
            <Text style={[styles.infoValue, { color: '#059669' }]}>
              {formatCurrency(currentCustomer.cash)}
            </Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bank / UPI Collections</Text>
            <Text style={[styles.infoValue, { color: '#1E3A8A' }]}>
              {formatCurrency(currentCustomer.bank)}
            </Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Discounts Applied</Text>
            <Text style={[styles.infoValue, { color: '#B45309' }]}>
              {formatCurrency(currentCustomer.discount)}
            </Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Renew Expiry Date</Text>
            <Text style={[styles.infoValue, { color: '#0F172A' }]}>
              {currentCustomer.date1 || 'Not Specified'}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account Notes / Complaint</Text>
            <Text style={[styles.infoValue, { color: hasUrgentComplaint ? '#DC2626' : '#475569', flex: 1, textAlign: 'right', marginLeft: 16 }]} numberOfLines={1}>
              {cleanComplaint || 'No active notes'}
            </Text>
          </View>
        </View>

        {/* Payment History Section */}
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>💳 Payment History</Text>
            <TouchableOpacity 
              onPress={() => { Vibration.vibrate(20); setShowHistoryModal(true); }}
              style={styles.historyLinkBtn}
            >
              <Text style={styles.historyLinkText}>View Full Log ({currentCustomer.paymentHistory ? currentCustomer.paymentHistory.length : 0}) ➔</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last Payment Date</Text>
            <Text style={[styles.infoValue, { color: '#059669' }]}>
              {currentCustomer.date1 || 'No Payments Yet'}
            </Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last Transaction ID</Text>
            <Text style={[styles.infoValue, { color: '#1E3A8A' }]}>
              {currentCustomer.transactionId || '—'}
            </Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Paid (Cash + Bank)</Text>
            <Text style={[styles.infoValue, { color: '#0F172A', fontWeight: '700' }]}>
              {formatCurrency((currentCustomer.cash || 0) + (currentCustomer.bank || 0))}
            </Text>
          </View>
        </View>

        {/* Action Button Grid */}
        <View style={styles.actionBtnGrid}>
          <TouchableOpacity
            style={styles.complaintBtn}
            onPress={() => { Vibration.vibrate(20); setShowComplaintModal(true); }}
            activeOpacity={0.8}
          >
            <Text style={styles.complaintBtnText}>⚠️ Register Complaint</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.payBtn}
            onPress={() => {
              Vibration.vibrate(30);
              navigation.navigate('Payment', { customer: currentCustomer });
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.payBtnText}>Record Payment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* PAYMENT HISTORY MODAL */}
      <Modal visible={showHistoryModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>📜 Payment History ({currentCustomer.username})</Text>

            {(!currentCustomer.paymentHistory || currentCustomer.paymentHistory.length === 0) ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#94A3B8' }}>No payment transaction logs recorded yet.</Text>
              </View>
            ) : (
              <ScrollView style={{ marginTop: 8 }}>
                {currentCustomer.paymentHistory.map((item, index) => (
                  <View key={item.id || index} style={styles.historyCardItem}>
                    <View style={styles.historyCardHeader}>
                      <View style={[styles.historyModeBadge, item.mode === 'CASH' ? styles.badgeCash : styles.badgeBank]}>
                        <Text style={[styles.historyModeBadgeText, item.mode === 'CASH' ? styles.badgeTextCash : styles.badgeTextBank]}>
                          {item.mode === 'CASH' ? '💵 CASH' : '🏦 BANK / UPI'}
                        </Text>
                      </View>
                      <Text style={styles.historyDateText}>📅 {item.date}</Text>
                    </View>
                    <View style={styles.historyCardBody}>
                      <Text style={styles.historyAmountText}>{formatCurrency(item.amount)}</Text>
                      {item.discount > 0 ? (
                        <Text style={styles.historyDiscountText}>Discount: {formatCurrency(item.discount)}</Text>
                      ) : null}
                    </View>
                    <View style={styles.historyCardFooter}>
                      <Text style={styles.historyTxnIdText}>Txn ID: {item.transactionId || 'N/A'}</Text>
                      {item.notes ? <Text style={styles.historyNotesText}>{item.notes}</Text> : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity 
              style={[styles.modalCloseBtn, { marginTop: 14, alignSelf: 'center' }]}
              onPress={() => setShowHistoryModal(false)}
            >
              <Text style={[styles.modalCloseText, { fontSize: 16, color: '#1E3A8A' }]}>Close History</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* COMPLAINT MODAL OVERLAY */}
      <Modal visible={showComplaintModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Register Complaint / Notes</Text>
            
            <TouchableOpacity 
              style={[styles.urgentToggle, isUrgent && styles.urgentToggleActive]}
              onPress={() => { Vibration.vibrate(10); setIsUrgent(!isUrgent); }}
            >
              <Text style={[styles.urgentToggleText, isUrgent && styles.urgentToggleTextActive]}>
                {isUrgent ? '🔴 MARKED AS URGENT COMPLAINT' : '⚪ MARK AS URGENT'}
              </Text>
            </TouchableOpacity>

            <TextInput
              style={styles.complaintInput}
              placeholder="Type customer complaint or service notes here (e.g. Router red light / No internet)..."
              placeholderTextColor="#94A3B8"
              multiline={true}
              numberOfLines={4}
              value={complaintText}
              onChangeText={setComplaintText}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity 
                style={styles.modalCloseBtn}
                onPress={() => { setShowComplaintModal(false); setComplaintText(''); setIsUrgent(false); }}
                disabled={savingComplaint}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSubmitBtn}
                onPress={handleSaveComplaint}
                disabled={savingComplaint}
              >
                {savingComplaint ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save Note</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  avatarLargeText: {
    fontSize: 26,
    fontWeight: '600', // Muted bold
  },
  name: {
    fontSize: 22,
    fontWeight: '600', // Muted bold
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  statusTag: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  complaintBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  complaintBannerTitle: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  complaintBannerMsg: {
    color: '#7F1D1D',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionsPanel: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtnCall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 6,
  },
  actionBtnWa: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    gap: 6,
  },
  actionBtnEmoji: {
    fontSize: 16,
  },
  actionBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E3A8A',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F8FAFC',
  },
  actionBtnGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  complaintBtn: {
    flex: 1,
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  complaintBtnText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '600',
  },
  payBtn: {
    flex: 1.2,
    backgroundColor: '#1E3A8A',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 14,
  },
  urgentToggle: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 14,
  },
  urgentToggleActive: {
    backgroundColor: '#FFE4E6',
    borderColor: '#FECDD3',
  },
  urgentToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  urgentToggleTextActive: {
    color: '#B91C1C',
  },
  complaintInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    color: '#0F172A',
    fontSize: 15,
    height: 100,
    textAlignVertical: 'top',
    outlineStyle: 'none',
    marginBottom: 18,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCloseBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCloseText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 22,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 110,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // History styles
  historyLinkBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  historyLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  historyCardItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyModeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeCash: {
    backgroundColor: '#ECFDF5',
  },
  badgeBank: {
    backgroundColor: '#EFF6FF',
  },
  historyModeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextCash: {
    color: '#059669',
  },
  badgeTextBank: {
    color: '#1D4ED8',
  },
  historyDateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  historyCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyAmountText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  historyDiscountText: {
    fontSize: 12,
    color: '#D97706',
    fontWeight: '600',
  },
  historyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
  },
  historyTxnIdText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  historyNotesText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
});
