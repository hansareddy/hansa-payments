/**
 * OfflineQueue — Persistent payment queue for low-connectivity scenarios.
 *
 * When a payment API call fails due to a network error, the payment data is
 * saved locally. On the next successful connection (pull-to-refresh or
 * app foregrounding), pending payments are auto-submitted.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@hansa_offline_payment_queue';

let queue = [];
let loaded = false;

/**
 * Load the queue from persistent storage (call once at startup).
 */
export async function loadQueue() {
  if (loaded) return queue;
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY);
    queue = stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.warn('OfflineQueue: failed to load', err.message);
    queue = [];
  }
  loaded = true;
  return queue;
}

async function persist() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('OfflineQueue: failed to persist', err.message);
  }
}

/**
 * Add a failed payment or location lock to the offline queue.
 */
export async function enqueue(paymentData, customerName, type = 'PAYMENT') {
  await loadQueue();
  queue.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    data: paymentData,
    customerName: customerName || 'Unknown',
    createdAt: new Date().toISOString(),
  });
  await persist();
  return queue.length;
}

export async function enqueueLocationLock(locationData, customerName) {
  return enqueue(locationData, customerName, 'LOCATION_LOCK');
}

/**
 * Process all pending offline items using the provided API functions.
 * Returns { synced: number, failed: number }.
 */
export async function processQueue(recordPaymentFn, updateSTBLocationFn) {
  await loadQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      if (item.type === 'LOCATION_LOCK' && updateSTBLocationFn) {
        await updateSTBLocationFn(item.data.rowIndex, item.data.latitude, item.data.longitude, item.data.loggedBy);
      } else if (recordPaymentFn) {
        await recordPaymentFn(item.data);
      }
      synced++;
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(item); // keep for next retry
      } else {
        console.warn(`OfflineQueue: dropped item ${item.id} — ${err.message}`);
      }
      failed++;
    }
  }

  queue = remaining;
  await persist();
  return { synced, failed };
}

/**
 * Get number of pending offline payments.
 */
export function getPendingCount() {
  return queue.length;
}

/**
 * Get all pending items (for display purposes).
 */
export function getPendingItems() {
  return [...queue];
}

/**
 * Clear the entire queue.
 */
export async function clearQueue() {
  queue = [];
  await persist();
}

/**
 * Check if an error is a network connectivity issue.
 */
export function isNetworkError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('network error') ||
    msg.includes('cannot connect')
  );
}
