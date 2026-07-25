/**
 * API Service — Production
 *
 * Features:
 *   - Auto-retry on 401 with transparent token refresh
 *   - Refresh token exchange endpoint
 *   - Server-side logout (revoke refresh token)
 *   - All requests include JWT auth + tunnel-bypass headers
 */

import { API_BASE_URL } from './config';

// ── Auth token management ─────────────────────────────────────────────────────

let _authToken = null;
let _onAuthExpired = null; // callback to trigger re-login from AuthContext

export function setAuthToken(token) {
  _authToken = token;
}

/**
 * Register a callback invoked when a 401 is unrecoverable (refresh also failed).
 */
export function setOnAuthExpired(callback) {
  _onAuthExpired = callback;
}

function getBaseUrl() {
  return API_BASE_URL;
}

function getHeaders(includeContentType = false) {
  const headers = { 'bypass-tunnel-reminder': 'true' };
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;
  if (includeContentType) headers['Content-Type'] = 'application/json';
  return headers;
}

/**
 * Core fetch wrapper with auto-retry on 401 (token expired → refresh → retry).
 */
async function apiFetch(url, options = {}, retried = false) {
  const response = await fetch(url, {
    ...options,
    headers: { ...getHeaders(!!options.body), ...options.headers },
  });

  // If 401 and we haven't retried yet, attempt a token refresh
  if (response.status === 401 && !retried && _onAuthExpired) {
    // The AuthContext tryRefresh will update _authToken via setAuthToken
    const refreshed = await _onAuthExpired();
    if (refreshed) {
      // Retry the request with the new token
      return apiFetch(url, options, true);
    }
  }

  return response;
}

async function apiGet(path) {
  const response = await apiFetch(`${getBaseUrl()}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function apiPost(path, body) {
  const response = await apiFetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function apiDelete(path) {
  const response = await apiFetch(`${getBaseUrl()}${path}`, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Login with username & password. Returns { token, refreshToken, user }.
 */
export async function loginUser(username, password) {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed.');
    return data;
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error('Cannot connect to server. Check your internet connection.');
    }
    throw error;
  }
}

/**
 * Exchange a refresh token for new access + refresh tokens.
 */
export async function refreshSession(refreshToken) {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Token refresh failed.');
  return data;
}

/**
 * Revoke refresh token on the server (logout).
 */
export async function logoutUser(refreshToken) {
  const baseUrl = getBaseUrl();
  await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
    body: JSON.stringify({ refreshToken }),
  });
}

// ── User Management ───────────────────────────────────────────────────────────

export async function getUsers() {
  return apiGet('/api/users');
}

export async function createUser(userData) {
  return apiPost('/api/users', userData);
}

export async function removeUser(userId) {
  return apiDelete(`/api/users/${userId}`);
}

// ── Customer Data ─────────────────────────────────────────────────────────────

export async function getCustomers(query = '', refresh = false) {
  try {
    const params = [];
    if (query && query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
    if (refresh) params.push('refresh=true');
    const path = params.length > 0 ? `/api/customers?${params.join('&')}` : '/api/customers';
    return await apiGet(path);
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error('Cannot connect to server. Ensure backend is running.');
    }
    throw error;
  }
}

export async function searchCustomers(query, refresh = true) {
  return getCustomers(query, refresh);
}

export async function getCustomer(rowIndex) {
  return apiGet(`/api/customers/${rowIndex}`);
}

export async function recordPayment(paymentData) {
  return apiPost('/api/payments', paymentData);
}

export async function createCustomer(customerData) {
  return apiPost('/api/customers', customerData);
}

export async function registerComplaint(rowIndex, urgent, complaint) {
  return apiPost(`/api/customers/${rowIndex}/complaint`, { urgent, complaint });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNetworkError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('cannot connect')
  );
}
