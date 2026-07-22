/**
 * LoginScreen - Premium Dark-Themed Admin Login
 * Hansa Communications branding with secure credential entry.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Vibration,
} from 'react-native';
import { loginUser } from '../services/api';
import { useAuth } from '../services/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    setError(null);
    setLoading(true);
    Vibration.vibrate(20);

    try {
      const result = await loginUser(username.trim(), password);
      login(result.user, result.token);
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
      Vibration.vibrate([0, 80, 60, 80]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0E21" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top decorative shapes */}
          <View style={styles.decorTop}>
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
          </View>

          {/* Branding Section */}
          <View style={styles.brandSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>HC</Text>
            </View>
            <Text style={styles.brandName}>Hansa Communications</Text>
            <Text style={styles.brandTagline}>Customer Management System</Text>
          </View>

          {/* Login Card */}
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Welcome Back</Text>
            <Text style={styles.loginSubtitle}>
              Sign in to access the CRM dashboard
            </Text>

            {/* Error Message */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠  {error}</Text>
              </View>
            )}

            {/* Username Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>USERNAME</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputIcon}>👤</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter username"
                  placeholderTextColor="#64748B"
                  value={username}
                  onChangeText={(t) => {
                    setUsername(t);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? '🙈' : '👁'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footerSection}>
            <View style={styles.footerDivider} />
            <Text style={styles.footerText}>
              🔐  Authorized Personnel Only
            </Text>
            <Text style={styles.versionText}>v1.0.0</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E21',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  /* Decorative circles */
  decorTop: {
    position: 'absolute',
    top: -60,
    right: -40,
  },
  decorCircle1: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(30, 58, 138, 0.25)',
    position: 'absolute',
    top: 0,
    right: 0,
  },
  decorCircle2: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    position: 'absolute',
    top: 80,
    right: 100,
  },

  /* Branding */
  brandSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  /* Login Card */
  loginCard: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 24,
  },

  /* Error */
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* Input fields */
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '500',
    outlineStyle: 'none',
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  eyeIcon: {
    fontSize: 18,
  },

  /* Login Button */
  loginBtn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 14,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  /* Footer */
  footerSection: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerDivider: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#1F2937',
    marginBottom: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  versionText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
    marginTop: 6,
  },
});
