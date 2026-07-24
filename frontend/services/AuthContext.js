/**
 * AuthContext — Production Authentication State Management
 *
 * Features:
 *   - Persistent login via encrypted SecureStore (auto-login on restart)
 *   - Transparent access token refresh (using refresh token)
 *   - Loading state during token restoration
 *   - Clean logout with server-side refresh token revocation
 */

import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { setAuthToken, refreshSession, logoutUser } from './api';
import { saveAuthData, loadAuthData, clearAuthData } from './SecureStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true while restoring session

  // ── Restore session from secure storage on mount ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await loadAuthData();
        if (stored.token && stored.user) {
          // Instantly restore cached session
          setUser(stored.user);
          setToken(stored.token);
          setRefreshToken(stored.refreshToken);
          setAuthToken(stored.token);

          // Background refresh token sync
          if (stored.refreshToken) {
            try {
              const refreshed = await refreshSession(stored.refreshToken);
              setUser(stored.user);
              setToken(refreshed.token);
              setRefreshToken(refreshed.refreshToken);
              setAuthToken(refreshed.token);
              await saveAuthData(refreshed.token, refreshed.refreshToken, stored.user);
            } catch (refreshErr) {
              // Only clear if server explicitly revoked (401), not network timeouts
              if (refreshErr.message && refreshErr.message.includes('401')) {
                await clearAuthData();
                setUser(null);
                setToken(null);
                setRefreshToken(null);
                setAuthToken(null);
              }
            }
          }
        }
      } catch (err) {
        console.warn('AuthContext: session restore failed', err.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (userData, accessToken, newRefreshToken) => {
    setUser(userData);
    setToken(accessToken);
    setRefreshToken(newRefreshToken);
    setAuthToken(accessToken);
    await saveAuthData(accessToken, newRefreshToken, userData);
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      if (refreshToken) {
        await logoutUser(refreshToken); // revoke on server
      }
    } catch (_err) {
      // ignore — server revocation is best-effort
    }
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setAuthToken(null);
    await clearAuthData();
  }, [refreshToken]);

  // ── Transparent token refresh ─────────────────────────────────────────────
  const tryRefresh = useCallback(async () => {
    if (!refreshToken) return false;
    try {
      const refreshed = await refreshSession(refreshToken);
      setToken(refreshed.token);
      setRefreshToken(refreshed.refreshToken);
      setAuthToken(refreshed.token);
      await saveAuthData(refreshed.token, refreshed.refreshToken, user);
      return true;
    } catch (_err) {
      await logout();
      return false;
    }
  }, [refreshToken, user, logout]);

  const value = {
    user,
    token,
    isLoggedIn: !!token,
    isLoading,
    login,
    logout,
    tryRefresh,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
