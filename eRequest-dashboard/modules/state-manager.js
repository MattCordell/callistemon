/**
 * @module state-manager
 * @description Centralized state management with observable pattern
 *
 * Replaces 29 React useState hooks with a single observable state object.
 * Provides:
 * - Centralized state storage
 * - Path-based state access and mutation
 * - Change subscription/notification
 */

/**
 * State Manager class
 * Manages application state with observable pattern
 */
class StateManager {
  /**
   * Create a new StateManager
   * @param {Object} initialState - Initial state object
   */
  constructor(initialState) {
    this.state = initialState;
    this.listeners = new Set();
  }

  /**
   * Get state value by path
   * @param {string} [path] - Dot-separated path (e.g., 'config.baseUrl'). If omitted, returns entire state.
   * @returns {*} State value at path
   */
  getState(path) {
    if (!path) return this.state;
    const keys = path.split('.');
    return keys.reduce((obj, key) => obj?.[key], this.state);
  }

  /**
   * Set state value by path
   * @param {string} path - Dot-separated path (e.g., 'config.baseUrl')
   * @param {*} value - New value
   */
  setState(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key], this.state);
    target[lastKey] = value;
    this.notify(path, value);
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener - Callback function (path, value, fullState) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   * @param {string} path - Path that changed
   * @param {*} value - New value
   * @private
   */
  notify(path, value) {
    this.listeners.forEach(fn => fn(path, value, this.state));
  }

  /**
   * Reset state to initial values
   */
  reset() {
    const initialState = createInitialState();
    Object.keys(this.state).forEach(key => {
      this.state[key] = initialState[key];
    });
    this.notify('', this.state);
  }
}

/**
 * Create initial state object
 * @returns {Object} Initial state
 */
function createInitialState() {
  return {
    // Configuration
    config: {
      baseUrl: '',
      txBase: ''
    },

    // UI State
    ui: {
      mode: 'incoming', // 'incoming' | 'patients'
      loading: false,
      error: ''
    },

    // Data (FHIR resources)
    data: {
      srList: [],           // ServiceRequest[]
      patientMap: {},       // { [patientRef]: Patient }
      taskBySrId: {},       // { [srRef]: Task }
      resByRef: {},         // { [ref]: Resource }
      nextLink: ''          // Pagination link
    },

    // Filters
    filters: {
      categoryFilter: 'all', // 'all' | 'lab' | 'imaging'
      modality: {
        selected: '',
        codes: new Set(),
        loading: false,
        error: false
      },
      anatomy: {
        query: '',
        options: [],
        selected: '',
        codes: new Set(),
        loading: false,
        error: '',
        menuOpen: false
      }
    },

    // Search
    search: {
      patientSearch: '',
      last7Only: false
    },

    // Selection
    selection: {
      patientRef: ''
    }
  };
}

/**
 * Global state instance
 * Export this to use throughout the application
 */
export const state = new StateManager(createInitialState());
