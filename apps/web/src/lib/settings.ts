/**
 * User settings persistence using localStorage
 */

const SCROBBLE_DELAY_KEY = 'scrobbleDelay';
const NOTIFY_ON_SIDE_COMPLETION_KEY = 'notifyOnSideCompletion';

const DEFAULT_SCROBBLE_DELAY = 50; // percentage
const DEFAULT_NOTIFY_ON_SIDE_COMPLETION = true;

/**
 * Check if localStorage is available (handles SSR and test environments)
 */
function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 
           typeof window.localStorage !== 'undefined' &&
           typeof window.localStorage.getItem === 'function';
  } catch {
    return false;
  }
}

/**
 * Get the scrobble delay percentage (when a track becomes eligible to scrobble)
 * @returns Percentage (0-100) of track duration required before scrobbling
 */
export function getScrobbleDelay(): number {
  if (!isLocalStorageAvailable()) {
    return DEFAULT_SCROBBLE_DELAY;
  }
  
  const stored = localStorage.getItem(SCROBBLE_DELAY_KEY);
  if (stored === null) {
    return DEFAULT_SCROBBLE_DELAY;
  }
  const parsed = parseInt(stored, 10);
  if (isNaN(parsed) || parsed < 0 || parsed > 100) {
    return DEFAULT_SCROBBLE_DELAY;
  }
  return parsed;
}

/**
 * Set the scrobble delay percentage
 * @param value - Percentage (0-100) of track duration required before scrobbling
 */
export function setScrobbleDelay(value: number): void {
  if (value < 0 || value > 100) {
    throw new Error('Scrobble delay must be between 0 and 100');
  }
  if (!isLocalStorageAvailable()) {
    return; // Silently fail in environments without localStorage
  }
  localStorage.setItem(SCROBBLE_DELAY_KEY, value.toString());
}

/**
 * Get whether to notify/pause on record side completion
 * @returns true if should notify/pause when side finishes
 */
export function getNotifyOnSideCompletion(): boolean {
  if (!isLocalStorageAvailable()) {
    return DEFAULT_NOTIFY_ON_SIDE_COMPLETION;
  }
  
  const stored = localStorage.getItem(NOTIFY_ON_SIDE_COMPLETION_KEY);
  if (stored === null) {
    return DEFAULT_NOTIFY_ON_SIDE_COMPLETION;
  }
  return stored === 'true';
}

/**
 * Set whether to notify/pause on record side completion
 * @param value - true to notify/pause when side finishes
 */
export function setNotifyOnSideCompletion(value: boolean): void {
  if (!isLocalStorageAvailable()) {
    return; // Silently fail in environments without localStorage
  }
  localStorage.setItem(NOTIFY_ON_SIDE_COMPLETION_KEY, value.toString());
}
