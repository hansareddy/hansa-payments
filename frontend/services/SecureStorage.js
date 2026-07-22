/**
 * SecureStorage — Encrypted device-local token storage.
 * Uses expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on Android).
 * Falls back to in-memory if SecureStore is unavailable (e.g. web).
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEYS = {
  ACCESS_TOKEN: 'hansa_access_token',
  REFRESH_TOKEN: 'hansa_refresh_token',
  USER_DATA: 'hansa_user_data',
};

// Web fallback (SecureStore is native-only)
const memoryStore = {};

async function setItem(key, value) {
  try {
    if (Platform.OS === 'web') {
      memoryStore[key] = value;
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch (err) {
    console.warn('SecureStorage.setItem failed:', err.message);
    memoryStore[key] = value; // fallback
  }
}

async function getItem(key) {
  try {
    if (Platform.OS === 'web') {
      return memoryStore[key] || null;
    }
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.warn('SecureStorage.getItem failed:', err.message);
    return memoryStore[key] || null;
  }
}

async function deleteItem(key) {
  try {
    if (Platform.OS === 'web') {
      delete memoryStore[key];
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch (err) {
    console.warn('SecureStorage.deleteItem failed:', err.message);
    delete memoryStore[key];
  }
}

// ── High-level API ────────────────────────────────────────────────────────────

export async function saveAuthData(token, refreshToken, user) {
  await setItem(KEYS.ACCESS_TOKEN, token);
  await setItem(KEYS.REFRESH_TOKEN, refreshToken);
  await setItem(KEYS.USER_DATA, JSON.stringify(user));
}

export async function loadAuthData() {
  const token = await getItem(KEYS.ACCESS_TOKEN);
  const refreshToken = await getItem(KEYS.REFRESH_TOKEN);
  const userStr = await getItem(KEYS.USER_DATA);
  const user = userStr ? JSON.parse(userStr) : null;
  return { token, refreshToken, user };
}

export async function clearAuthData() {
  await deleteItem(KEYS.ACCESS_TOKEN);
  await deleteItem(KEYS.REFRESH_TOKEN);
  await deleteItem(KEYS.USER_DATA);
}
