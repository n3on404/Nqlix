// Storage keys prefix
const STORAGE_PREFIX = 'louaj_';

// In-memory cache for faster access
const memoryCache: Record<string, any> = {};

/**
 * Get a value from local storage
 */
export function getLocalStorage(key: string): any {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  
  // Check memory cache first
  if (fullKey in memoryCache) {
    return memoryCache[fullKey];
  }
  
  // Get from localStorage
  try {
    const item = localStorage.getItem(fullKey);
    if (item) {
      const value = JSON.parse(item);
      memoryCache[fullKey] = value;
      return value;
    }
  } catch (error) {
    console.error(`Error reading from localStorage for key ${key}:`, error);
  }
  
  return null;
}

/**
 * Set a value in local storage
 */
export function setLocalStorage(key: string, value: any): void {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  
  // Update memory cache
  memoryCache[fullKey] = value;
  
  // Update localStorage
  try {
    localStorage.setItem(fullKey, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing to localStorage for key ${key}:`, error);
  }
}

/**
 * Remove a value from local storage
 */
export function removeLocalStorage(key: string): void {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  
  // Remove from memory cache
  delete memoryCache[fullKey];
  
  // Remove from localStorage
  try {
    localStorage.removeItem(fullKey);
  } catch (error) {
    console.error(`Error removing from localStorage for key ${key}:`, error);
  }
}

/**
 * Clear all storage values
 */
export function clearLocalStorage(): void {
  // Clear memory cache
  Object.keys(memoryCache).forEach(key => {
    if (key.startsWith(STORAGE_PREFIX)) {
      delete memoryCache[key];
    }
  });
  
  // Clear localStorage
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
}

/**
 * Get all storage keys
 */
export function getLocalStorageKeys(): string[] {
  const keys: string[] = [];
  
  // Get keys from localStorage
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        keys.push(key.substring(STORAGE_PREFIX.length));
      }
    });
  } catch (error) {
    console.error('Error getting localStorage keys:', error);
  }
  
  return keys;
}

export default {
  getLocalStorage,
  setLocalStorage,
  removeLocalStorage,
  clearLocalStorage,
  getLocalStorageKeys,
}; 