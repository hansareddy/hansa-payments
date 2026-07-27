/**
 * ManageUsersScreen - Admin User Management
 * View, add, and delete user accounts. Admin-only access.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  StatusBar,
  Vibration,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { getUsers, createUser, removeUser } from '../services/api';
import { useAuth } from '../services/AuthContext';

export default function ManageUsersScreen({ navigation }) {
  const { user: currentUser, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Add user modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('collector');
  const [addingUser, setAddingUser] = useState(false);

  // Granular Checkbox Permissions State
  const [permissions, setPermissions] = useState({
    recordPayments: true,
    lockLocation: true,
    editProfile: true,
    registerComplaint: true,
    viewMap: true,
    manageUsers: false,
  });

  const togglePermission = (key) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleRoleChange = (selectedRole) => {
    setNewRole(selectedRole);
    if (selectedRole === 'admin') {
      setPermissions({
        recordPayments: true,
        lockLocation: true,
        editProfile: true,
        registerComplaint: true,
        viewMap: true,
        manageUsers: true,
      });
    } else {
      setPermissions({
        recordPayments: true,
        lockLocation: true,
        editProfile: true,
        registerComplaint: true,
        viewMap: true,
        manageUsers: false,
      });
    }
  };

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const result = await getUsers();
      setUsers(result.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers();
  };

  const handleAddUser = async () => {
    if (!newUsername.trim()) {
      Alert.alert('Validation', 'Username is required.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 4) {
      Alert.alert('Validation', 'Password must be at least 4 characters.');
      return;
    }

    setAddingUser(true);
    Vibration.vibrate(20);

    try {
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        displayName: newDisplayName.trim() || newUsername.trim(),
        role: newRole,
        permissions,
      });

      setShowAddModal(false);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('collector');
      setPermissions({
        recordPayments: true,
        lockLocation: true,
        editProfile: true,
        registerComplaint: true,
        viewMap: true,
        manageUsers: false,
      });
      Alert.alert('Success', 'User profile created with custom permissions!');
      loadUsers();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = (targetUser) => {
    if (targetUser.id === 1) {
      Alert.alert('Restricted', 'Cannot delete the primary admin account.');
      return;
    }
    if (targetUser.username === currentUser?.username) {
      Alert.alert('Error', 'You cannot delete your own account.');
      return;
    }

    Vibration.vibrate(30);
    Alert.alert(
      'Delete User',
      `Are you sure you want to remove "${targetUser.displayName}" (${targetUser.username})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeUser(targetUser.id);
              Alert.alert('Deleted', `User "${targetUser.username}" has been removed.`);
              loadUsers();
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') {
      return { bg: '#EEF2FF', color: '#3730A3', label: 'ADMIN' };
    }
    return { bg: '#ECFDF5', color: '#065F46', label: 'COLLECTOR' };
  };

  const renderUser = ({ item }) => {
    const badge = getRoleBadge(item.role);
    const isCurrentUser = item.username === currentUser?.username;
    const isPrimaryAdmin = item.id === 1;
    const userPerms = item.permissions || {};

    return (
      <View style={[styles.userCard, isCurrentUser && styles.userCardCurrent]}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {(item.displayName || item.username || '?')[0].toUpperCase()}
          </Text>
        </View>

        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={styles.userDisplayName} numberOfLines={1}>
              {item.displayName}
            </Text>
            {isCurrentUser && (
              <Text style={styles.youBadge}>CURRENT PROFILE</Text>
            )}
          </View>
          <Text style={styles.userUsername}>@{item.username}</Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.roleBadgeText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
          </View>

          {/* Granular Active Permissions Pills */}
          <View style={styles.permsPillRow}>
            {userPerms.recordPayments && <Text style={styles.permPill}>Collect Payments</Text>}
            {userPerms.lockLocation && <Text style={styles.permPill}>GPS Lock</Text>}
            {userPerms.editProfile && <Text style={styles.permPill}>Edit Profile</Text>}
            {userPerms.registerComplaint && <Text style={styles.permPill}>Complaints</Text>}
            {userPerms.viewMap && <Text style={styles.permPill}>Network Map</Text>}
            {userPerms.manageUsers && <Text style={[styles.permPill, styles.permPillAdmin]}>User Mgmt</Text>}
          </View>
        </View>

        {!isPrimaryAdmin && !isCurrentUser && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeleteUser(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />

      {/* Header Info Banner */}
      <View style={styles.headerInfo}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <View>
            <Text style={styles.headerTitle}>User Account Profiles</Text>
            <Text style={styles.headerSub}>
              {users.length} registered profile{users.length === 1 ? '' : 's'} with custom RBAC permissions
            </Text>
          </View>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => {
              Vibration.vibrate(20);
              logout();
            }}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Clear Active Profile Indicator Card */}
        <View style={styles.activeProfileCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E3A8A' }}>
                  ACTIVE ACCOUNT: {currentUser?.displayName || 'Admin'} (@{currentUser?.username || 'admin'})
                </Text>
                <View style={{ backgroundColor: currentUser?.role === 'admin' ? '#EEF2FF' : '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: currentUser?.role === 'admin' ? '#3730A3' : '#047857' }}>
                    {currentUser?.role === 'admin' ? 'ADMIN' : 'COLLECTOR'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                {currentUser?.role === 'admin' ? 'Full Administrator Access & Granular Checkbox Permission Management' : 'Field Collection Profile Active'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* States */}
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.loadingText}>Loading profiles & permissions...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Failed to load users</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadUsers}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* User List */}
      {!loading && (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />
          }
          ListEmptyComponent={
            !error && (
              <View style={styles.centerBox}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            )
          }
        />
      )}

      {/* Add User FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          Vibration.vibrate(20);
          setShowAddModal(true);
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+ Add New User Profile</Text>
      </TouchableOpacity>

      {/* Add User Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowAddModal(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.dragHandle} />

            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>Create New User Profile</Text>
              <Text style={styles.modalSub}>
                Assign login credentials and select granular checkbox permissions
              </Text>

              {/* Username */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>USERNAME *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. john"
                  placeholderTextColor="#94A3B8"
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!addingUser}
                />
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Min. 4 characters"
                  placeholderTextColor="#94A3B8"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={true}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!addingUser}
                />
              </View>

              {/* Display Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. John Field Tech"
                  placeholderTextColor="#94A3B8"
                  value={newDisplayName}
                  onChangeText={setNewDisplayName}
                  editable={!addingUser}
                />
              </View>

              {/* Role Selector */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>ROLE PRESET</Text>
                <View style={styles.roleRow}>
                  <TouchableOpacity
                    style={[
                      styles.roleOption,
                      newRole === 'collector' && styles.roleOptionActiveCollector,
                    ]}
                    onPress={() => handleRoleChange('collector')}
                    disabled={addingUser}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        newRole === 'collector' && styles.roleOptionTextActive,
                      ]}
                    >
                      Field Collector
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.roleOption,
                      newRole === 'admin' && styles.roleOptionActiveAdmin,
                    ]}
                    onPress={() => handleRoleChange('admin')}
                    disabled={addingUser}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        newRole === 'admin' && styles.roleOptionTextActive,
                      ]}
                    >
                      Full Admin
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* GRANULAR PERMISSIONS CHECKBOXES HUB */}
              <View style={styles.permsSection}>
                <Text style={styles.permsSectionTitle}>GRANULAR PERMISSIONS (CHECKBOXES)</Text>
                <Text style={styles.permsSectionSub}>Check all capabilities that this profile can perform:</Text>

                <TouchableOpacity 
                  style={styles.checkboxRow} 
                  onPress={() => togglePermission('recordPayments')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxBox, permissions.recordPayments && styles.checkboxBoxChecked]}>
                    {permissions.recordPayments && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkboxLabel}>Record Payments & Collect Money</Text>
                    <Text style={styles.checkboxSub}>Collect cash/UPI payments from customers in app</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.checkboxRow} 
                  onPress={() => togglePermission('lockLocation')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxBox, permissions.lockLocation && styles.checkboxBoxChecked]}>
                    {permissions.lockLocation && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkboxLabel}>Log & Lock STB GPS Locations</Text>
                    <Text style={styles.checkboxSub}>Capture on-site GPS coordinates for STB units</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.checkboxRow} 
                  onPress={() => togglePermission('editProfile')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxBox, permissions.editProfile && styles.checkboxBoxChecked]}>
                    {permissions.editProfile && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkboxLabel}>Edit Customer Profiles</Text>
                    <Text style={styles.checkboxSub}>Update Subscriber Name, Mobile Number, or Box #</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.checkboxRow} 
                  onPress={() => togglePermission('registerComplaint')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxBox, permissions.registerComplaint && styles.checkboxBoxChecked]}>
                    {permissions.registerComplaint && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkboxLabel}>Register Complaints & Service Notes</Text>
                    <Text style={styles.checkboxSub}>Log customer complaints and field service notes</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.checkboxRow} 
                  onPress={() => togglePermission('viewMap')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxBox, permissions.viewMap && styles.checkboxBoxChecked]}>
                    {permissions.viewMap && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkboxLabel}>Access Network STB Map</Text>
                    <Text style={styles.checkboxSub}>View OpenStreetMap multi-marker network view</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.checkboxRow} 
                  onPress={() => togglePermission('manageUsers')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxBox, permissions.manageUsers && styles.checkboxBoxChecked]}>
                    {permissions.manageUsers && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkboxLabel}>Admin User Management</Text>
                    <Text style={styles.checkboxSub}>Create, edit, and delete user profiles</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setShowAddModal(false);
                    setNewUsername('');
                    setNewPassword('');
                    setNewDisplayName('');
                    setNewRole('collector');
                  }}
                  disabled={addingUser}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalCreateBtn, addingUser && { opacity: 0.6 }]}
                  onPress={handleAddUser}
                  disabled={addingUser}
                >
                  {addingUser ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.modalCreateText}>Create Profile with Permissions</Text>
                  )}
                </TouchableOpacity>
              </View>
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
  headerInfo: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  userCardCurrent: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFF',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  userAvatarText: {
    color: '#1E3A8A',
    fontSize: 18,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userDisplayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  youBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1E3A8A',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
    overflow: 'hidden',
  },
  userUsername: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECDD3',
    marginLeft: 8,
  },
  deleteBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 36,
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
    borderRadius: 10,
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
    fontSize: 13,
    color: '#7F1D1D',
    marginTop: 4,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 10,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  /* FAB */
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    left: 20,
    backgroundColor: '#1E3A8A',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  /* Modal */
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
    maxHeight: '85%',
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
  modalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 4,
  },
  modalSub: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '500',
    outlineStyle: 'none',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  roleOptionActiveAdmin: {
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
  },
  roleOptionActiveCollector: {
    borderColor: '#34D399',
    backgroundColor: '#ECFDF5',
  },
  roleOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  roleOptionTextActive: {
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  modalCreateBtn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 140,
  },
  modalCreateText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  activeProfileCard: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 4,
  },
  permsPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  permPill: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  permPillAdmin: {
    color: '#4338CA',
    backgroundColor: '#EEF2FF',
  },
  permsSection: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  permsSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E3A8A',
    letterSpacing: 0.5,
  },
  permsSectionSub: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 12,
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  checkboxIcon: {
    fontSize: 16,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  checkboxSub: {
    fontSize: 11,
    color: '#64748B',
  },
});
