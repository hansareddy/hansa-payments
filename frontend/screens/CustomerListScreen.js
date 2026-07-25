/**
 * CustomerListScreen - Mobile Ledger & Billing Dashboard
 * 100% optimized for mobile screens (removed header clutter, slide-up complaints modal).
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Platform,
  Vibration,
  RefreshControl,
  ScrollView,
  Modal,
  SafeAreaView,
  BackHandler,
  Image,
} from 'react-native';
import { getCustomers, recordPayment } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { processQueue, getPendingCount } from '../services/OfflineQueue';

export default function CustomerListScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [allCustomers, setAllCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'OVERDUE' | 'PAID'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [pendingSync, setPendingSync] = useState(0);
  
  // Mobile drawer modal state
  const [showComplaintsDrawer, setShowComplaintsDrawer] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  useEffect(() => {
    loadData();

    // Prevent back button on home screen from going back to login
    const backAction = () => {
      return true; // Return true to block default back navigation
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const loadData = async (attempts = 3) => {
    setError(null);
    for (let i = 0; i < attempts; i++) {
      try {
        // Auto-sync offline queue if connection is restored
        const syncResult = await processQueue(recordPayment);
        if (syncResult.synced > 0) {
          Vibration.vibrate([0, 50, 50, 50]);
        }
        setPendingSync(getPendingCount());

        const res = await getCustomers('', true);
        const list = res.customers || [];
        setAllCustomers(list);
        applyFilters(list, query, activeFilter);
        setError(null);
        break;
      } catch (err) {
        if (i < attempts - 1) {
          await new Promise(r => setTimeout(r, 1500));
        } else {
          if (allCustomers.length === 0) {
            setError(err.message);
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  useEffect(() => {
    applyFilters(allCustomers, query, activeFilter);
  }, [query, activeFilter, allCustomers]);

  const applyFilters = (list, search, filter) => {
    let result = list;

    if (filter === 'OVERDUE') {
      result = result.filter(c => c.balance > 0);
    } else if (filter === 'PAID') {
      result = result.filter(c => c.balance <= 0);
    }

    if (search.trim()) {
      const term = search.toLowerCase().trim();
      result = result.filter(c =>
        (c.username && c.username.toLowerCase().includes(term)) ||
        (c.mobile && c.mobile.toLowerCase().includes(term)) ||
        (c.ipAddress && c.ipAddress.toLowerCase().includes(term)) ||
        (c.customerNo && c.customerNo.toLowerCase().includes(term)) ||
        (c.serialNumber && c.serialNumber.toLowerCase().includes(term)) ||
        (c.status && c.status.toLowerCase().includes(term)) ||
        (c.location && c.location.toLowerCase().includes(term))
      );
    }

    setFilteredCustomers(result);
  };

  const handleClear = () => {
    setQuery('');
  };

  const formatCurrency = (amount) => {
    return '₹' + Number(amount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    });
  };

  const totalCount = allCustomers.length;
  const overdueCount = allCustomers.filter(c => c.balance > 0).length;
  const totalBalanceDue = allCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);

  // Extract complaints
  const activeComplaints = allCustomers.filter(c => {
    if (!c.forField || c.forField.trim() === '') return false;
    const val = c.forField.trim().toLowerCase();
    return val !== 'new account created' &&
           val !== 'active' &&
           val !== 'inactive' &&
           val !== 'new' &&
           !val.startsWith('cash') &&
           !val.startsWith('upi') &&
           !val.startsWith('bank');
  });

  // Aggregate payment records across all accounts for Home Screen History
  const getAllPayments = () => {
    const records = [];
    allCustomers.forEach(c => {
      if (c.paymentHistory && c.paymentHistory.length > 0) {
        c.paymentHistory.forEach(ph => {
          records.push({
            ...ph,
            username: c.username,
            mobile: c.mobile,
            rowIndex: c.rowIndex,
          });
        });
      } else if (c.bank > 0 || c.cash > 0 || c.transactionId) {
        if (c.bank > 0) {
          records.push({
            id: `bank_${c.rowIndex}`,
            username: c.username,
            mobile: c.mobile,
            date: c.date1 || 'Recent',
            mode: 'BANK',
            amount: c.bank,
            discount: c.discount || 0,
            transactionId: c.transactionId || 'SHEET_REC',
            notes: 'Bank / UPI Payment',
          });
        }
        if (c.cash > 0) {
          records.push({
            id: `cash_${c.rowIndex}`,
            username: c.username,
            mobile: c.mobile,
            date: c.date1 || 'Recent',
            mode: 'CASH',
            amount: c.cash,
            discount: 0,
            transactionId: 'CASH_PAYMENT',
            notes: 'Cash Collection',
          });
        }
      }
    });

    // Sort so today's transactions (YYYY-MM-DD & live timestamps) ALWAYS appear at the very top #1
    const getSortScore = (item) => {
      // 1. If timestamp ID exists (e.g. tx_1784891601944)
      if (typeof item.id === 'string') {
        const digits = item.id.replace(/\D/g, '');
        if (digits.length >= 10) return parseInt(digits.slice(0, 13), 10);
      }
      
      // 2. If ISO date string YYYY-MM-DD (e.g. 2026-07-24)
      const dateStr = String(item.date || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const time = new Date(dateStr).getTime();
        if (!isNaN(time)) return time;
      }
      
      // 3. Fallback for legacy dates (e.g. '9', '24', 'Recent')
      return 1000000000000; 
    };

    records.sort((a, b) => getSortScore(b) - getSortScore(a));

    if (!historySearchQuery.trim()) return records;
    const term = historySearchQuery.toLowerCase().trim();
    return records.filter(r =>
      (r.username || '').toLowerCase().includes(term) ||
      (r.transactionId || '').toLowerCase().includes(term) ||
      (r.mode || '').toLowerCase().includes(term) ||
      (r.date || '').toLowerCase().includes(term)
    );
  };

  const getStatusColor = (balance) => {
    if (balance <= 0) return '#059669';
    return '#DC2626';
  };

  const renderCustomerRow = ({ item }) => {
    const isOverdue = item.balance > 0;
    const balanceColor = getStatusColor(item.balance);
    const isUrgent = item.forField && item.forField.startsWith('[URGENT]');
    const displayNotes = isUrgent ? item.forField.replace('[URGENT]', '').trim() : item.forField;
    
    // Status text from sheet (Active / Inactive / New)
    const activeState = (item.status || item.forField || 'Active').trim();
    const stateColor = activeState.toLowerCase() === 'active' ? '#059669' : (activeState.toLowerCase() === 'inactive' ? '#DC2626' : '#2563EB');

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          Vibration.vibrate(30);
          navigation.navigate('CustomerDetail', { customer: item });
        }}
        style={[styles.row, isUrgent && styles.rowUrgent]}
      >
        <View style={styles.avatarMini}>
          <Text style={styles.avatarMiniText}>
            {(item.username || '?')[0].toUpperCase()}
          </Text>
        </View>
        
        <View style={styles.rowMain}>
          <View style={styles.rowNameRow}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.username}
            </Text>
            {isUrgent && (
              <View style={styles.urgentBadgeInline}>
                <Text style={styles.urgentBadgeInlineText}>URGENT</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            Cust #: {item.customerNo || item.ipAddress || '—'}  •  STB: {item.serialNumber || '—'}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            Ph: {item.mobile || '—'}  •  Expiry: {item.expiryDate || item.date1 || '—'}
          </Text>
          {item.forField && item.forField.trim() !== '' && item.forField !== 'New account created' && !['active', 'inactive', 'new', 'cash', 'upi', 'bank'].includes(item.forField.trim().toLowerCase()) && !item.forField.toLowerCase().startsWith('cash') && !item.forField.toLowerCase().startsWith('upi') && (
            <Text style={[styles.complaintSub, isUrgent && { color: '#DC2626' }]} numberOfLines={1}>
              Note: {displayNotes}
            </Text>
          )}
        </View>

        <View style={styles.rowRight}>
          <View style={[styles.statePill, { backgroundColor: stateColor + '20', borderColor: stateColor }]}>
            <Text style={[styles.statePillText, { color: stateColor }]}>{activeState}</Text>
          </View>
          {item.balance > 0 && (
            <Text style={[styles.rowBalance, { color: balanceColor }]}>
              {formatCurrency(item.balance)}
            </Text>
          )}
        </View>

        <Text style={styles.rowChevron}>➔</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />

      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerLogo}>Hansa CRM</Text>
            <Text style={styles.headerSub}>Welcome, {user?.displayName || 'User'}</Text>
          </View>
          <View style={styles.headerActionRow}>
            {/* complaints badge button */}
            <TouchableOpacity 
              style={[styles.complaintsBtn, activeComplaints.length > 0 && styles.complaintsBtnActive]} 
              onPress={() => { Vibration.vibrate(20); setShowComplaintsDrawer(true); }}
            >
              <Text style={styles.complaintsBtnText}>
                ⚠️ {activeComplaints.length}
              </Text>
            </TouchableOpacity>

            {/* manage users button */}
            {user?.role === 'admin' && (
              <TouchableOpacity 
                style={[styles.complaintsBtn, { backgroundColor: 'rgba(99,102,241,0.25)', borderColor: 'rgba(99,102,241,0.4)' }]} 
                onPress={() => { Vibration.vibrate(20); navigation.navigate('ManageUsers'); }}
              >
                <Image 
                  source={{ uri: 'https://img.icons8.com/color/96/administrator-male.png' }} 
                  style={{ width: 20, height: 20 }} 
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.addBtn} 
              onPress={() => {
                Vibration.vibrate(20);
                navigation.navigate('AddCustomer');
              }}
            >
              <Text style={styles.addBtnText}>+ ADD</Text>
            </TouchableOpacity>

            {/* logout button */}
            <TouchableOpacity 
              style={[styles.complaintsBtn, { backgroundColor: 'rgba(239,68,68,0.25)', borderColor: 'rgba(239,68,68,0.4)', marginLeft: 6 }]} 
              onPress={() => { Vibration.vibrate(20); logout(); }}
            >
              <Text style={{ fontSize: 16 }}>🚪</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Interactive Stats Grid */}
        <View style={styles.statsCard}>
          <TouchableOpacity 
            style={[styles.statItem, activeFilter === 'ALL' && { opacity: 1 }]} 
            onPress={() => { Vibration.vibrate(15); setActiveFilter('ALL'); }}
          >
            <Text style={styles.statVal}>{totalCount}</Text>
            <Text style={styles.statLabel}>ACCOUNTS</Text>
          </TouchableOpacity>
          
          <View style={styles.statDivider} />
          
          <TouchableOpacity 
            style={styles.statItem} 
            onPress={() => { Vibration.vibrate(15); setActiveFilter('OVERDUE'); }}
          >
            <Text style={[styles.statVal, { color: '#FCA5A5' }]}>{overdueCount}</Text>
            <Text style={styles.statLabel}>OVERDUE</Text>
          </TouchableOpacity>
          
          <View style={styles.statDivider} />
          
          <TouchableOpacity 
            style={styles.statItem} 
            onPress={() => { Vibration.vibrate(15); setActiveFilter('OVERDUE'); }}
          >
            <Text style={[styles.statVal, { color: '#A7F3D0' }]}>{formatCurrency(totalBalanceDue)}</Text>
            <Text style={styles.statLabel}>TOTAL DUE</Text>
          </TouchableOpacity>
        </View>

        {/* Offline Sync Banner */}
        {pendingSync > 0 && (
          <TouchableOpacity style={styles.offlineBanner} onPress={loadData}>
            <Text style={styles.offlineBannerText}>
              ⚡ {pendingSync} offline payment{pendingSync > 1 ? 's' : ''} queued — Tap to sync now
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Controls Container */}
      <View style={styles.controlsContainer}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, mobile, or IP..."
              placeholderTextColor="#94A3B8"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.historyBtnPill}
            onPress={() => { Vibration.vibrate(20); setShowHistoryDrawer(true); }}
          >
            <Text style={styles.historyBtnPillText}>📜 History</Text>
          </TouchableOpacity>
        </View>

        {/* filter tabs (3 clean equal tabs) */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, activeFilter === 'ALL' && styles.tabActive]}
            onPress={() => setActiveFilter('ALL')}
          >
            <Text style={[styles.tabText, activeFilter === 'ALL' && styles.tabTextActive]}>
              All ({allCustomers.length})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeFilter === 'OVERDUE' && styles.tabActiveRed]}
            onPress={() => setActiveFilter('OVERDUE')}
          >
            <Text style={[styles.tabText, activeFilter === 'OVERDUE' && styles.tabTextRedActive]}>
              🔴 Overdue ({overdueCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeFilter === 'PAID' && styles.tabActiveGreen]}
            onPress={() => setActiveFilter('PAID')}
          >
            <Text style={[styles.tabText, activeFilter === 'PAID' && styles.tabTextGreenActive]}>
              🟢 Settled ({allCustomers.length - overdueCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* States */}
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.loadingText}>Syncing CRM ledger...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Synchronization Failed</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
              <Text style={styles.retryText}>Retry Sync</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.retryBtn, { backgroundColor: '#EF4444' }]} 
              onPress={() => { Vibration.vibrate(20); logout(); }}
            >
              <Text style={styles.retryText}>🔑 Log In Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Account List */}
      {!loading && (
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomerRow}
          keyExtractor={(item) => String(item.rowIndex)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />
          }
          ListEmptyComponent={
            !error && (
              <View style={styles.centerBox}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyText}>No accounts found</Text>
              </View>
            )
          }
        />
      )}

      {/* MOBILE-NATIVE COMPLAINTS MODAL SHEET */}
      <Modal 
        visible={showComplaintsDrawer} 
        animationType="slide" 
        transparent={true}
        onRequestClose={() => setShowComplaintsDrawer(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity 
            style={styles.modalDismissArea} 
            activeOpacity={1} 
            onPress={() => setShowComplaintsDrawer(false)} 
          />
          <View style={styles.modalSheet}>
            {/* Drag Handle indicator */}
            <View style={styles.dragHandle} />
            
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Active Complaints</Text>
                <Text style={styles.modalSubTitle}>Customer service requests</Text>
              </View>
              <TouchableOpacity 
                style={styles.modalCloseBtn}
                onPress={() => setShowComplaintsDrawer(false)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* scrollable complaints list */}
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {activeComplaints.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Text style={styles.modalEmptyEmoji}>🎉</Text>
                  <Text style={styles.modalEmptyText}>All complaints cleared!</Text>
                </View>
              ) : (
                activeComplaints.map((item) => {
                  const isUrgent = item.forField && item.forField.startsWith('[URGENT]');
                  const displayNotes = isUrgent ? item.forField.replace('[URGENT]', '').trim() : item.forField;

                  return (
                    <TouchableOpacity
                      key={item.rowIndex}
                      style={[styles.ticketCard, isUrgent && styles.ticketCardUrgent]}
                      activeOpacity={0.85}
                      onPress={() => {
                        Vibration.vibrate(20);
                        setShowComplaintsDrawer(false);
                        navigation.navigate('CustomerDetail', { customer: item });
                      }}
                    >
                      <View style={styles.ticketHeader}>
                        <Text style={styles.ticketUsername}>{item.username}</Text>
                        {isUrgent && (
                          <View style={styles.urgentBadgeInline}>
                            <Text style={styles.urgentBadgeInlineText}>URGENT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.ticketSubRow}>IP: {item.ipAddress || 'No IP'}  •  Row: {item.rowIndex}</Text>
                      
                      <View style={[styles.ticketBubble, isUrgent && styles.ticketBubbleUrgent]}>
                        <Text style={styles.ticketText}>{displayNotes}</Text>
                      </View>
                      <Text style={styles.ticketAction}>Open Profile ➔</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MOBILE-NATIVE PAYMENT HISTORY MODAL SHEET */}
      <Modal 
        visible={showHistoryDrawer} 
        animationType="slide" 
        transparent={true}
        onRequestClose={() => setShowHistoryDrawer(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity 
            style={styles.modalDismissArea} 
            activeOpacity={1} 
            onPress={() => setShowHistoryDrawer(false)} 
          />
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            {/* Drag Handle indicator */}
            <View style={styles.dragHandle} />
            
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>📜 Payment History Log</Text>
                <Text style={styles.modalSubTitle}>Transactions collected across all accounts</Text>
              </View>
              <TouchableOpacity 
                style={styles.modalCloseBtn}
                onPress={() => setShowHistoryDrawer(false)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input for History */}
            <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
              <TextInput
                style={{
                  backgroundColor: '#F1F5F9',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 14,
                  color: '#0F172A',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
                placeholder="Filter by Username, Txn ID, Date..."
                placeholderTextColor="#94A3B8"
                value={historySearchQuery}
                onChangeText={setHistorySearchQuery}
              />
            </View>

            {/* scrollable payment history list */}
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {getAllPayments().length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Text style={styles.modalEmptyEmoji}>💳</Text>
                  <Text style={styles.modalEmptyText}>No payment history records found.</Text>
                </View>
              ) : (
                getAllPayments().map((item, idx) => (
                  <TouchableOpacity
                    key={item.id || idx}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      padding: 14,
                      marginBottom: 10,
                    }}
                    onPress={() => {
                      if (item.rowIndex) {
                        setShowHistoryDrawer(false);
                        const targetCust = allCustomers.find(c => c.rowIndex === item.rowIndex);
                        if (targetCust) {
                          navigation.navigate('CustomerDetail', { customer: targetCust });
                        }
                      }
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>{item.username}</Text>
                      <View style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        backgroundColor: item.mode === 'CASH' ? '#ECFDF5' : '#EFF6FF',
                      }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: item.mode === 'CASH' ? '#059669' : '#1D4ED8',
                        }}>
                          {item.mode === 'CASH' ? '💵 CASH' : '🏦 BANK / UPI'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#059669' }}>
                        {formatCurrency(item.amount)}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500' }}>
                        📅 {item.date}
                      </Text>
                    </View>

                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTopWidth: 1,
                      borderTopColor: '#F1F5F9',
                      paddingTop: 6,
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E3A8A' }}>
                        Txn ID (Col N): {item.transactionId || 'N/A'}
                      </Text>
                      {item.discount > 0 && (
                        <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '600' }}>
                          Disc: {formatCurrency(item.discount)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
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
  header: {
    backgroundColor: '#1E3A8A',
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLogo: {
    fontSize: 21,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 11,
    color: '#93C5FD',
    fontWeight: '500',
    marginTop: 1,
  },
  headerActionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  complaintsBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  complaintsBtnActive: {
    backgroundColor: '#DC2626',
    borderColor: '#F87171',
  },
  complaintsBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  addBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginTop: 6,
  },
  statItem: {
    alignItems: 'center',
  },
  statVal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 8,
    color: '#93C5FD',
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  offlineBanner: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  controlsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
  },
  historyBtnPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyBtnPillText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 6,
    color: '#94A3B8',
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '500',
    outlineStyle: 'none',
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#1E3A8A',
  },
  tabActiveRed: {
    backgroundColor: '#DC2626',
  },
  tabActiveGreen: {
    backgroundColor: '#059669',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabTextRedActive: {
    color: '#FFFFFF',
  },
  tabTextGreenActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarMini: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  avatarMiniText: {
    color: '#1E3A8A',
    fontSize: 15,
    fontWeight: '600',
  },
  rowMain: {
    flex: 1,
    marginRight: 8,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  rowSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  complaintSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 3,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  rowBalance: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowStatus: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  rowChevron: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  rowUrgent: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF1F2',
  },
  urgentBadgeInline: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  urgentBadgeInlineText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '600',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#991B1B',
  },
  errorSub: {
    fontSize: 12,
    color: '#7F1D1D',
    marginTop: 4,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 10,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // MOBILE MODAL SHEET STYLES
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 20,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  modalCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  modalCloseText: {
    fontSize: 14,
    color: '#1E3A8A',
    fontWeight: '600',
  },
  modalScroll: {
    padding: 16,
  },
  modalEmptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  modalEmptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  modalEmptyText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  ticketCard: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
  },
  ticketCardUrgent: {
    backgroundColor: '#FFE4E6',
    borderColor: '#FCA5A5',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  ticketSubRow: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  ticketBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ticketBubbleUrgent: {
    borderColor: '#FECDD3',
  },
  ticketText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    fontWeight: '500',
  },
  ticketAction: {
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'right',
  },
  statePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 4,
  },
  statePillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
