/**
 * SearchScreen - Main Customer Ledger & Management Screen
 * 
 * FEATURES:
 * - ☀️ Clean High-Contrast Light Theme
 * - 📱 Customer data loaded by default on app launch (Always Accessible)
 * - ⚡ Instant Live Search (Filters in real-time as you type)
 * - 🏷️ Quick Filter Tabs: ALL / OVERDUE / PAID
 * - 📊 Live Summary Stats Counter at the top
 * - 👴 Extra Large Fonts (20-30px) & 60px+ Touch Buttons for Elderly Techs
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
} from 'react-native';
import { getCustomers } from '../services/api';

export default function SearchScreen({ navigation }) {
  const [allCustomers, setAllCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'OVERDUE' | 'PAID'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Load customer records on startup
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError(null);
    try {
      const res = await getCustomers();
      const list = res.customers || [];
      setAllCustomers(list);
      applyFilters(list, query, activeFilter);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Live filter when search query or tab changes
  useEffect(() => {
    applyFilters(allCustomers, query, activeFilter);
  }, [query, activeFilter, allCustomers]);

  const applyFilters = (list, search, filter) => {
    let result = list;

    // Filter by tab
    if (filter === 'OVERDUE') {
      result = result.filter(c => c.balance > 0);
    } else if (filter === 'PAID') {
      result = result.filter(c => c.balance <= 0);
    }

    // Filter by live search text
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
    return '₹ ' + Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Summary statistics
  const totalCount = allCustomers.length;
  const overdueCount = allCustomers.filter(c => c.balance > 0).length;
  const totalBalanceDue = allCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);

  const getStatusInfo = (item) => {
    const activeState = (item.status || item.forField || 'Active').trim();
    if (activeState.toLowerCase() === 'active') return { color: '#059669', bg: '#D1FAE5', label: 'ACTIVE' };
    if (activeState.toLowerCase() === 'inactive') return { color: '#DC2626', bg: '#FEE2E2', label: 'INACTIVE' };
    return { color: '#2563EB', bg: '#DBEAFE', label: activeState.toUpperCase() };
  };

  const renderCustomerCard = ({ item }) => {
    const status = getStatusInfo(item);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          Vibration.vibrate(30);
          navigation.navigate('Payment', { customer: item });
        }}
        style={styles.card}
      >
        {/* Top bar: Name, Mobile, Status Badge */}
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(item.username || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.customerName}>{item.username}</Text>
            <Text style={styles.customerPhone}>📱  {item.mobile || 'No Mobile'}</Text>
            <Text style={styles.customerIP}>🆔  Cust #: {item.customerNo || item.ipAddress || '—'}</Text>
            <Text style={styles.customerIP}>📺  STB: {item.serialNumber || '—'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* Financial Details Row */}
        <View style={styles.financeGrid}>
          <View style={[styles.financeBox, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
            <Text style={styles.financeLabel}>TOTAL DUE</Text>
            <Text style={[styles.financeValue, { color: '#DC2626' }]}>
              {formatCurrency(item.due)}
            </Text>
          </View>
          <View style={[styles.financeBox, { backgroundColor: status.bg, borderColor: status.color }]}>
            <Text style={styles.financeLabel}>BALANCE</Text>
            <Text style={[styles.financeValue, { color: status.color }]}>
              {formatCurrency(item.balance)}
            </Text>
          </View>
        </View>

        <View style={styles.financeGrid}>
          <View style={[styles.financeBox, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}>
            <Text style={styles.financeLabel}>💵 CASH PAID</Text>
            <Text style={[styles.financeValue, { color: '#059669' }]}>
              {formatCurrency(item.cash)}
            </Text>
          </View>
          <View style={[styles.financeBox, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}>
            <Text style={styles.financeLabel}>🏦 BANK PAID</Text>
            <Text style={[styles.financeValue, { color: '#2563EB' }]}>
              {formatCurrency(item.bank)}
            </Text>
          </View>
        </View>

        {/* Big Tap Button */}
        <View style={styles.cardActionBtn}>
          <Text style={styles.cardActionText}>💰  COLLECT PAYMENT</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />

      {/* Blue Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.logo}>📡 HANSA</Text>
            <Text style={styles.logoSub}>COMMUNICATIONS NETWORK</Text>
          </View>
          <TouchableOpacity 
            style={styles.refreshHeaderBtn} 
            onPress={loadData} 
            activeOpacity={0.7}
          >
            <Text style={styles.refreshHeaderIcon}>🔄  RELOAD</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Summary Bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalCount}</Text>
            <Text style={styles.summaryLabel}>CUSTOMERS</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#FCA5A5' }]}>{overdueCount}</Text>
            <Text style={styles.summaryLabel}>OVERDUE</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#FCD34D' }]}>{formatCurrency(totalBalanceDue)}</Text>
            <Text style={styles.summaryLabel}>TOTAL DUE</Text>
          </View>
        </View>
      </View>

      {/* Search Input Box */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Type name, mobile, or IP address..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearIconBtn}>
              <Text style={styles.clearIconText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeFilter === 'ALL' && styles.tabActive]}
            onPress={() => setActiveFilter('ALL')}
          >
            <Text style={[styles.tabText, activeFilter === 'ALL' && styles.tabTextActive]}>
              ALL ({allCustomers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeFilter === 'OVERDUE' && styles.tabActiveRed]}
            onPress={() => setActiveFilter('OVERDUE')}
          >
            <Text style={[styles.tabText, activeFilter === 'OVERDUE' && styles.tabTextRedActive]}>
              🔴 OVERDUE ({overdueCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeFilter === 'PAID' && styles.tabActiveGreen]}
            onPress={() => setActiveFilter('PAID')}
          >
            <Text style={[styles.tabText, activeFilter === 'PAID' && styles.tabTextGreenActive]}>
              🟢 PAID ({allCustomers.length - overdueCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading State */}
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.loadingText}>Loading customer records...</Text>
        </View>
      )}

      {/* Error State */}
      {error && !loading && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>⚠️ Connection Issue</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>🔄  TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Customer List */}
      {!loading && (
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomerCard}
          keyExtractor={(item) => String(item.rowIndex)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />
          }
          ListEmptyComponent={
            !error ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No matching customers</Text>
                <Text style={styles.emptySub}>Try typing a different name or number</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },

  // ── HEADER ──
  header: {
    backgroundColor: '#1E3A8A',
    paddingTop: Platform.OS === 'ios' ? 54 : 38,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  logo: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  logoSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#93C5FD',
    letterSpacing: 1.5,
  },
  refreshHeaderBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  refreshHeaderIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // Summary Bar
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  summaryLabel: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // ── SEARCH & TABS ──
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2563EB',
    paddingHorizontal: 16,
    height: 60,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 20,
    fontWeight: '600',
  },
  clearIconBtn: {
    padding: 8,
  },
  clearIconText: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: '800',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
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
    color: '#374151',
    fontSize: 14,
    fontWeight: '800',
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

  // ── CUSTOMER CARD ──
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#93C5FD',
  },
  avatarText: {
    color: '#1E3A8A',
    fontSize: 24,
    fontWeight: '900',
  },
  nameContainer: {
    flex: 1,
  },
  customerName: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  customerPhone: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 1,
  },
  customerIP: {
    color: '#6B7280',
    fontSize: 15,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 6,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '900',
  },

  // Finance Grid
  financeGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  financeBox: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  financeLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
    color: '#4B5563',
  },
  financeValue: {
    fontSize: 20,
    fontWeight: '900',
  },

  // Action Button
  cardActionBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  cardActionText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ── MESSAGES & EMPTY ──
  centerBox: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 30,
  },
  loadingText: {
    color: '#4B5563',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 54,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },
  emptySub: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 4,
  },
  errorCard: {
    margin: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#FCA5A5',
    alignItems: 'center',
  },
  errorTitle: {
    color: '#DC2626',
    fontSize: 20,
    fontWeight: '800',
  },
  errorSub: {
    color: '#991B1B',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
