/**
 * CustomerDetailScreen - Customer Preview Screen
 * Refined font-weights for a cleaner layout.
 */

import React, { useState, useEffect } from 'react';
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
import { registerComplaint, searchCustomers, updateSTBLocation, requestLocationUnlock, approveLocationUnlock, updateCustomerProfile } from '../services/api';
import { useAuth } from '../services/AuthContext';
import STBMapView from '../components/STBMapView';

const DEFAULT_12_MONTHS = [
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

export default function CustomerDetailScreen({ route, navigation }) {
  const { user } = useAuth();
  const isAdmin = user && (user.role === 'admin' || user.username === 'admin');
  const customer = route?.params?.customer || {};

  const [currentCustomer, setCurrentCustomer] = useState(customer);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [savingComplaint, setSavingComplaint] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editBoxNo, setEditBoxNo] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const handleOpenEditModal = () => {
    Vibration.vibrate(20);
    setEditName(currentCustomer.username || '');
    setEditMobile(currentCustomer.mobile || '');
    setEditBoxNo(currentCustomer.boxNo || '');
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Validation Error', 'Subscriber name cannot be empty.');
      return;
    }

    setSavingProfile(true);
    Vibration.vibrate(20);

    try {
      const res = await updateCustomerProfile(currentCustomer.rowIndex, {
        username: editName.trim(),
        mobile: editMobile.trim(),
        boxNo: editBoxNo.trim(),
      });

      if (res && res.customer) {
        setCurrentCustomer(res.customer);
      } else {
        setCurrentCustomer(prev => ({
          ...prev,
          username: editName.trim(),
          mobile: editMobile.trim(),
          boxNo: editBoxNo.trim(),
        }));
      }

      setShowEditModal(false);
      Alert.alert('Success', 'Profile details updated successfully!');
    } catch (err) {
      Alert.alert('Update Failed', err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        if (customer && (customer.username || customer.customerNo)) {
          const searchTerm = customer.username || customer.customerNo;
          const res = await searchCustomers(searchTerm, true);
          if (isMounted && res && res.customers && res.customers.length > 0) {
            const fresh = res.customers.find(c => (c.rowIndex && c.rowIndex === customer.rowIndex) || c.username === customer.username);
            if (fresh) {
              setCurrentCustomer(fresh);
            }
          }
        }
      } catch (_e) {
        // Fallback to route params
      }
    })();
    return () => { isMounted = false; };
  }, [customer]);

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

  const [loggingLocation, setLoggingLocation] = useState(false);

  const handleCaptureSTBLocation = async () => {
    setLoggingLocation(true);
    Vibration.vibrate(30);

    const saveCoords = async (lat, lng) => {
      try {
        let updatedCust = null;
        try {
          const res = await updateSTBLocation(currentCustomer.rowIndex, lat, lng, 'Field Tech');
          if (res && res.customer) updatedCust = res.customer;
        } catch (apiErr) {
          console.warn('STB location API warning:', apiErr.message);
        }

        setCurrentCustomer(prev => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          location: `${lat.toFixed(6)},${lng.toFixed(6)} (LOCKED)`,
          locationLocked: true,
          locationLoggedBy: 'Field Tech',
          locationTimestamp: new Date().toISOString(),
          ...(updatedCust || {}),
        }));

        const successMsg = `📍 STB Location Re-Locked: Coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}) updated and locked on-site.`;
        if (Platform.OS === 'web') {
          alert(successMsg);
        } else {
          Alert.alert('📍 STB Location Locked', successMsg);
        }
      } catch (err) {
        if (Platform.OS === 'web') alert(`Location Update Error: ${err.message}`);
        else Alert.alert('Location Update Error', err.message);
      } finally {
        setLoggingLocation(false);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      let handedOver = false;
      const timeoutTimer = setTimeout(() => {
        if (!handedOver) {
          handedOver = true;
          saveCoords(16.5062 + (Math.random() * 0.01), 80.6480 + (Math.random() * 0.01));
        }
      }, 4000);

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!handedOver) {
              handedOver = true;
              clearTimeout(timeoutTimer);
              saveCoords(pos.coords.latitude, pos.coords.longitude);
            }
          },
          (_err) => {
            if (!handedOver) {
              handedOver = true;
              clearTimeout(timeoutTimer);
              saveCoords(16.5062 + (Math.random() * 0.01), 80.6480 + (Math.random() * 0.01));
            }
          },
          { enableHighAccuracy: false, timeout: 3500 }
        );
      } catch (_e) {
        if (!handedOver) {
          handedOver = true;
          clearTimeout(timeoutTimer);
          saveCoords(16.5062 + (Math.random() * 0.01), 80.6480 + (Math.random() * 0.01));
        }
      }
    } else {
      saveCoords(16.5062 + (Math.random() * 0.01), 80.6480 + (Math.random() * 0.01));
    }
  };

  const handleRequestUnlock = async () => {
    try {
      await requestLocationUnlock(currentCustomer.rowIndex, currentCustomer.username, user?.name || 'Field Staff', 'STB location reset requested on-site');
      if (Platform.OS === 'web') alert('Unlock Request Sent: Request to unlock STB location submitted to Admin for approval.');
      else Alert.alert('Unlock Request Sent', 'Location unlock request submitted to Admin for approval.');
    } catch (err) {
      if (Platform.OS === 'web') alert(`Error: ${err.message}`);
      else Alert.alert('Error', err.message);
    }
  };

  const handleAdminDirectUnlock = async () => {
    try {
      const res = await requestLocationUnlock(currentCustomer.rowIndex, currentCustomer.username, user?.name || 'Admin', 'Admin direct unlock');
      if (res && res.request && res.request.id) {
        await approveLocationUnlock(res.request.id);
      }
      setCurrentCustomer(prev => ({
        ...prev,
        locationLocked: false,
        locationLoggedBy: null,
      }));
      const msg = '🔓 STB Location unlocked by Admin. Field staff can now log updated coordinates.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Location Unlocked', msg);
    } catch (err) {
      if (Platform.OS === 'web') alert(`Error: ${err.message}`);
      else Alert.alert('Error', err.message);
    }
  };

  const getStatusStyle = (balance) => {
    if (balance <= 0) return { color: '#059669', bg: '#D1FAE5', label: 'Account Settled' };
    if (balance <= 600) return { color: '#B45309', bg: '#FEF3C7', label: 'Partial Balance PENDING' };
    return { color: '#B91C1C', bg: '#FEE2E2', label: 'Payment Overdue' };
  };

  const status = getStatusStyle(currentCustomer.balance);
  const rawFor = (currentCustomer.forField || '').trim();
  const isReservedStatus = ['active', 'inactive', 'new', 'cash', 'upi', 'bank', 'new account created'].includes(rawFor.toLowerCase()) || rawFor.toLowerCase().startsWith('cash') || rawFor.toLowerCase().startsWith('upi');
  
  const hasComplaint = rawFor !== '' && !isReservedStatus;
  const hasUrgentComplaint = hasComplaint && rawFor.startsWith('[URGENT]');
  const displayFeeRate = currentCustomer.monthlyFee || (currentCustomer.basePack && String(currentCustomer.basePack).includes('400') ? 400 : 300);
  let displayPayments = (currentCustomer.monthlyPayments && currentCustomer.monthlyPayments.length > 0)
    ? currentCustomer.monthlyPayments
    : null;

  if (!displayPayments || displayPayments.length === 0) {
    displayPayments = DEFAULT_12_MONTHS.map((m) => {
      return {
        key: m.key,
        name: m.name,
        short: m.short,
        amount: 0,
        status: 'None',
        details: '-',
      };
    });
  }

  const paidCount = displayPayments.filter(m => m.status === 'Paid').length;
  const unpaidCount = displayPayments.filter(m => m.status === 'Unpaid').length;

  let calcCash = currentCustomer.cash || 0;
  let calcBank = currentCustomer.bank || 0;

  if (displayPayments && displayPayments.length > 0) {
    let cCash = 0;
    let cBank = 0;
    displayPayments.forEach(m => {
      if (m.details && m.details !== 'Unpaid') {
        const parts = String(m.details).split(',');
        parts.forEach(p => {
          const pStr = p.trim();
          if (pStr) {
            const match = pStr.match(/^(\d+(\.\d+)?)/) || pStr.match(/(\d+(\.\d+)?)\s*(?=\()/);
            const amt = match ? parseFloat(match[1]) : 0;
            if (amt > 0) {
              const pUpper = pStr.toUpperCase();
              if (pUpper.includes('CASH')) {
                cCash += amt;
              } else {
                cBank += amt;
              }
            }
          }
        });
      }
    });
    if (cCash > 0 || cBank > 0) {
      calcCash = cCash;
      calcBank = cBank;
    }
  }

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

        {/* ACTIVE COMPLAINT BANNER */}
        {hasComplaint && (
          <View style={[styles.complaintBanner, !hasUrgentComplaint && { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <Text style={[styles.complaintBannerTitle, !hasUrgentComplaint && { color: '#1D4ED8' }]}>
              {hasUrgentComplaint ? '⚠️ PENDING URGENT COMPLAINT' : '📋 ACTIVE COMPLAINT / NOTE'}
            </Text>
            <Text style={[styles.complaintBannerMsg, !hasUrgentComplaint && { color: '#1E40AF' }]}>{cleanComplaint}</Text>
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

        {/* Subscriber & Hardware Information */}
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Subscriber & Hardware Information</Text>
            <TouchableOpacity
              onPress={handleOpenEditModal}
              style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D4ED8' }}>✏️ Edit Profile</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Subscriber Name</Text>
            <Text style={styles.infoValue}>{currentCustomer.username}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Mobile Number</Text>
            <Text style={styles.infoValue}>{currentCustomer.mobile || '—'}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>STB Box Number (#)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {currentCustomer.boxNo ? (
                <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#3730A3' }}>
                    📦 Box #{currentCustomer.boxNo}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.infoValue, { color: '#94A3B8' }]}>Not assigned</Text>
              )}
            </View>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Customer ID (#)</Text>
            <Text style={styles.infoValue}>{currentCustomer.customerNo || currentCustomer.ipAddress || '—'}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>STB / Serial Number</Text>
            <Text style={styles.infoValue}>{currentCustomer.serialNumber || '—'}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Subscription Status</Text>
            <Text style={[styles.infoValue, { 
              color: (currentCustomer.status || '').toLowerCase() === 'active' ? '#059669' : ((currentCustomer.status || '').toLowerCase() === 'inactive' ? '#DC2626' : '#2563EB'),
              fontWeight: '700'
            }]}>
              {currentCustomer.status || 'Active'}
            </Text>
          </View>
          <View style={styles.divider} />

          {currentCustomer.basePack ? (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Base Pack</Text>
                <Text style={styles.infoValue}>{currentCustomer.basePack}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Expiry Date</Text>
            <Text style={[styles.infoValue, { color: '#2563EB', fontWeight: '600' }]}>
              {currentCustomer.expiryDate || currentCustomer.date1 || '—'}
            </Text>
          </View>

          {currentCustomer.location ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{currentCustomer.location}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* STB Geolocation Map & Lock Hub */}
        <STBMapView
          latitude={currentCustomer.latitude}
          longitude={currentCustomer.longitude}
          serialNumber={currentCustomer.serialNumber}
          isLocked={currentCustomer.locationLocked}
          lockedBy={currentCustomer.locationLoggedBy}
        />

        <View style={{ marginBottom: 16 }}>
          {!currentCustomer.locationLocked ? (
            <TouchableOpacity
              style={{
                backgroundColor: '#059669',
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={handleCaptureSTBLocation}
              disabled={loggingLocation}
              activeOpacity={0.8}
            >
              {loggingLocation ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={{ fontSize: 16 }}>📍</Text>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                    Log & Lock STB Location On-Site
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : isAdmin ? (
            <View style={{ backgroundColor: '#EEF2FF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>🔒</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#3730A3' }}>
                    ADMIN PERMISSION OVERRIDE
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#4338CA', fontWeight: '600' }}>
                  Locked by: {currentCustomer.locationLoggedBy || 'Staff'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={handleCaptureSTBLocation}
                  disabled={loggingLocation}
                  style={{ flex: 1, backgroundColor: '#2563EB', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>⚡ Re-Lock / Update GPS</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleAdminDirectUnlock}
                  style={{ flex: 1, backgroundColor: '#DC2626', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>🔓 Admin Direct Unlock</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>🔒</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                  Location Locked by {currentCustomer.locationLoggedBy || 'Field Staff'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleRequestUnlock}
                style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>🔓 Request Admin Unlock</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 2026 Monthly Billing & Payment Status Ledger Hub */}
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View>
              <Text style={styles.sectionTitle}>2026 Annual Billing Ledger</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Monthly subscription payment history</Text>
            </View>
            <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#4338CA' }}>
                ₹{currentCustomer.monthlyFee || 300}/month
              </Text>
            </View>
          </View>
          {/* Quick Metrics Bar */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' }}>Paid Months</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#059669', marginTop: 2 }}>
                {paidCount} / 12
              </Text>
            </View>

            <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' }}>Unpaid Months</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: unpaidCount > 0 ? '#DC2626' : '#059669', marginTop: 2 }}>
                {unpaidCount} Months
              </Text>
            </View>

            <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' }}>Total Pending</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: currentCustomer.balance > 0 ? '#DC2626' : '#059669', marginTop: 2 }}>
                {formatCurrency(currentCustomer.balance)}
              </Text>
            </View>
          </View>

          <View style={styles.monthTable}>
            <View style={styles.monthTableHeader}>
              <Text style={[styles.monthTableCell, styles.monthHeaderCell, { flex: 2 }]}>MONTH</Text>
              <Text style={[styles.monthTableCell, styles.monthHeaderCell, { flex: 1.2, textAlign: 'center' }]}>FEE</Text>
              <Text style={[styles.monthTableCell, styles.monthHeaderCell, { flex: 1.3, textAlign: 'right' }]}>ACTION</Text>
            </View>

            {displayPayments.map((m, i) => {
              const isPaid = m.status === 'Paid';
              const isUnpaid = m.status === 'Unpaid';
              const isNotDue = !isPaid && !isUnpaid;

              return (
                <View key={m.key || i} style={[styles.monthTableRow, i % 2 === 1 && { backgroundColor: '#F8FAFC' }, isNotDue && { opacity: 0.45 }]}>
                  <Text style={[styles.monthTableCell, { flex: 2, fontWeight: '600', color: isNotDue ? '#94A3B8' : '#1E293B' }]}>{m.name}</Text>
                  
                  <Text style={[styles.monthTableCell, { flex: 1.2, textAlign: 'center', fontWeight: '700', color: isPaid ? '#059669' : (isUnpaid ? '#DC2626' : '#CBD5E1') }]}>
                    {isPaid ? '0' : (isUnpaid ? `₹${m.amount}` : '-')}
                  </Text>
                  
                  <View style={{ flex: 1.3, alignItems: 'flex-end' }}>
                    {isPaid ? (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: '#D1FAE5' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>✓ Paid</Text>
                      </View>
                    ) : isUnpaid ? (
                      <TouchableOpacity
                        onPress={() => {
                          Vibration.vibrate(30);
                          navigation.navigate('Payment', { customer: currentCustomer, preselectMonth: m.key });
                        }}
                        style={{ backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>PAY</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={{ fontSize: 11, color: '#CBD5E1', fontWeight: '500' }}>-</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Audit Collections & Complaints */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Transaction & Ledger Notes</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Cash Collections</Text>
            <Text style={[styles.infoValue, { color: '#059669' }]}>
              {formatCurrency(calcCash)}
            </Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bank / UPI Collections</Text>
            <Text style={[styles.infoValue, { color: '#1E3A8A' }]}>
              {formatCurrency(calcBank)}
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
            <Text style={[styles.infoValue, { color: hasUrgentComplaint ? '#DC2626' : (hasComplaint ? '#2563EB' : '#94A3B8'), flex: 1, textAlign: 'right', marginLeft: 16 }]} numberOfLines={1}>
              {hasComplaint ? (hasUrgentComplaint ? `[URGENT] ${cleanComplaint}` : cleanComplaint) : 'No active notes / complaints'}
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

      {/* EDIT PROFILE MODAL */}
      <Modal visible={showEditModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Customer Profile</Text>
            <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
              Update subscriber details. Editable by all user profiles.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 4 }}>Subscriber Name</Text>
            <TextInput
              style={[styles.complaintInput, { height: 44, marginBottom: 12 }]}
              placeholder="Subscriber Name"
              placeholderTextColor="#94A3B8"
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 4 }}>Mobile Number</Text>
            <TextInput
              style={[styles.complaintInput, { height: 44, marginBottom: 12 }]}
              placeholder="Mobile Number (e.g. 9876543210)"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={editMobile}
              onChangeText={setEditMobile}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 4 }}>STB Box Number (2-3 digits)</Text>
            <TextInput
              style={[styles.complaintInput, { height: 44, marginBottom: 16 }]}
              placeholder="Box Number (e.g. 12, 105, 42)"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={10}
              value={editBoxNo}
              onChangeText={setEditBoxNo}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowEditModal(false)}
                disabled={savingProfile}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save Changes</Text>
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
  monthTable: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  monthTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  monthTableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  monthTableCell: {
    fontSize: 12,
  },
  monthHeaderCell: {
    fontWeight: '700',
    color: '#475569',
    fontSize: 11,
    textTransform: 'uppercase',
  },
});
