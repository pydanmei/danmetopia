// Global state management
export const state = {
  // User
  currentUser: null,
  
  // Data
  stories: [],
  groups: [],
  follows: {},
  
  // UI
  selectedGenre: "",
  currentTab: "all",
  
  // Reader
  currentReaderStoryId: null,
  currentChapters: [],
  currentChapterIndex: 0,
  
  // Loading
  isLoading: false,
  
  // Listeners
  _listeners: new Map()
};

// Subscribe to state changes
export function subscribe(key, callback) {
  if (!state._listeners.has(key)) {
    state._listeners.set(key, []);
  }
  state._listeners.get(key).push(callback);
  
  // Return unsubscribe function
  return () => {
    const callbacks = state._listeners.get(key);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  };
}

// Update state and notify listeners
export function setState(key, value) {
  const oldValue = state[key];
  state[key] = value;
  
  if (state._listeners.has(key)) {
    state._listeners.get(key).forEach(callback => {
      callback(value, oldValue);
    });
  }
  
  // Also dispatch global event
  window.dispatchEvent(new CustomEvent('state-change', { detail: { key, value, oldValue } }));
}

// Batch update
export function batchUpdate(updates) {
  Object.entries(updates).forEach(([key, value]) => {
    const oldValue = state[key];
    state[key] = value;
    
    if (state._listeners.has(key)) {
      state._listeners.get(key).forEach(callback => {
        callback(value, oldValue);
      });
    }
  });
  
  window.dispatchEvent(new CustomEvent('state-batch-update', { detail: updates }));
}
