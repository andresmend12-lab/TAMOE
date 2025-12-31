/**
 * Global State Management for TAMOE
 * Provides a centralized store with subscription capabilities
 */

// Initial state
const initialState = {
  // User
  currentUser: null,
  usersByUid: {},

  // Data
  allClients: [],
  automations: [],

  // Selection state
  selectedClientId: null,
  selectedProjectId: null,
  selectedProductId: null,
  selectedTaskId: null,
  selectedSubtaskId: null,

  // UI state
  sidebarAutoOpenKeys: new Set(),
  clientSearchQuery: '',
  clientsLoading: false,

  // Context for creation modals
  taskCreationContext: null,
  productCreationContext: null,

  // Calendar state
  calendarItems: [],
  calendarState: { view: 'month', date: new Date() },

  // Sorting preferences
  projectChildSort: new Map(),

  // Listeners status
  listenersAttached: false
};

// Create a deep clone of initial state
const createInitialState = () => ({
  ...initialState,
  sidebarAutoOpenKeys: new Set(),
  projectChildSort: new Map(),
  calendarState: { view: 'month', date: new Date() }
});

// Store implementation
class Store {
  constructor() {
    this.state = createInitialState();
    this.subscribers = new Map();
    this.subscriberId = 0;
  }

  /**
   * Get current state or a specific key
   * @param {string} [key] - Optional key to get specific value
   * @returns {any} The state or specific value
   */
  get(key) {
    if (key) {
      return this.state[key];
    }
    return { ...this.state };
  }

  /**
   * Update state with partial updates
   * @param {Object} updates - Partial state updates
   */
  set(updates) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };
    this.notify(oldState);
  }

  /**
   * Update a specific key
   * @param {string} key - State key to update
   * @param {any} value - New value
   */
  setKey(key, value) {
    const oldState = { ...this.state };
    this.state[key] = value;
    this.notify(oldState, key);
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Callback function (newState, oldState, changedKey)
   * @param {string[]} [keys] - Optional array of keys to watch
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback, keys = null) {
    const id = ++this.subscriberId;
    this.subscribers.set(id, { callback, keys });
    return () => this.subscribers.delete(id);
  }

  /**
   * Notify subscribers of state changes
   * @param {Object} oldState - Previous state
   * @param {string} [changedKey] - Specific key that changed
   */
  notify(oldState, changedKey = null) {
    for (const [, { callback, keys }] of this.subscribers) {
      // If subscriber has specific keys, only notify if those changed
      if (keys && changedKey && !keys.includes(changedKey)) {
        continue;
      }
      try {
        callback(this.state, oldState, changedKey);
      } catch (error) {
        console.error('Store subscriber error:', error);
      }
    }
  }

  /**
   * Reset state to initial values
   */
  reset() {
    const oldState = { ...this.state };
    this.state = createInitialState();
    this.notify(oldState);
  }

  // ============================================
  // Convenience methods for common operations
  // ============================================

  /**
   * Get client by ID
   * @param {string} clientId
   * @returns {Object|null}
   */
  getClient(clientId) {
    return this.state.allClients.find(c => c.clientId === clientId) || null;
  }

  /**
   * Get project from a client
   * @param {string} clientId
   * @param {string} projectId
   * @returns {Object|null}
   */
  getProject(clientId, projectId) {
    const client = this.getClient(clientId);
    if (!client || !client.projects) return null;
    return client.projects[projectId] || null;
  }

  /**
   * Get product from a project
   * @param {string} clientId
   * @param {string} projectId
   * @param {string} productId
   * @returns {Object|null}
   */
  getProduct(clientId, projectId, productId) {
    const project = this.getProject(clientId, projectId);
    if (!project || !project.products) return null;
    return project.products[productId] || null;
  }

  /**
   * Get user by UID
   * @param {string} uid
   * @returns {Object|null}
   */
  getUser(uid) {
    return this.state.usersByUid[uid] || null;
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.state.currentUser;
  }

  /**
   * Get selected hierarchy path
   * @returns {Object}
   */
  getSelectionPath() {
    return {
      clientId: this.state.selectedClientId,
      projectId: this.state.selectedProjectId,
      productId: this.state.selectedProductId,
      taskId: this.state.selectedTaskId,
      subtaskId: this.state.selectedSubtaskId
    };
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.set({
      selectedClientId: null,
      selectedProjectId: null,
      selectedProductId: null,
      selectedTaskId: null,
      selectedSubtaskId: null
    });
  }

  /**
   * Select a client (clears downstream selections)
   * @param {string} clientId
   */
  selectClient(clientId) {
    this.set({
      selectedClientId: clientId,
      selectedProjectId: null,
      selectedProductId: null,
      selectedTaskId: null,
      selectedSubtaskId: null
    });
  }

  /**
   * Select a project (clears downstream selections)
   * @param {string} projectId
   */
  selectProject(projectId) {
    this.set({
      selectedProjectId: projectId,
      selectedProductId: null,
      selectedTaskId: null,
      selectedSubtaskId: null
    });
  }

  /**
   * Select a product (clears downstream selections)
   * @param {string} productId
   */
  selectProduct(productId) {
    this.set({
      selectedProductId: productId,
      selectedTaskId: null,
      selectedSubtaskId: null
    });
  }

  /**
   * Select a task (clears subtask selection)
   * @param {string} taskId
   */
  selectTask(taskId) {
    this.set({
      selectedTaskId: taskId,
      selectedSubtaskId: null
    });
  }

  /**
   * Select a subtask
   * @param {string} subtaskId
   */
  selectSubtask(subtaskId) {
    this.setKey('selectedSubtaskId', subtaskId);
  }
}

// Export singleton instance
export const store = new Store();

// Export for testing
export { Store, initialState };
