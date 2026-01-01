/**
 * Test Setup File
 * Runs before all tests
 */

import { vi } from 'vitest';

// ============================================
// GLOBAL MOCKS
// ============================================

// Mock Firebase
vi.mock('../firebase.js', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((callback) => {
      callback(null);
      return vi.fn();
    }),
    signOut: vi.fn(() => Promise.resolve())
  },
  database: {},
  storage: {},
  firestore: {}
}));

// Mock Firebase Database Functions
vi.mock('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js', () => ({
  ref: vi.fn((db, path) => ({ path })),
  push: vi.fn(() => ({ key: 'mock-key-' + Date.now() })),
  onValue: vi.fn((ref, callback) => {
    callback({ val: () => ({}), key: ref?.path });
    return vi.fn();
  }),
  query: vi.fn((ref) => ref),
  set: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({ val: () => null, exists: () => false })),
  runTransaction: vi.fn((ref, updateFn) => {
    const newValue = updateFn(1);
    return Promise.resolve({ snapshot: { val: () => newValue } });
  }),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  orderByChild: vi.fn(() => ({})),
  limitToLast: vi.fn(() => ({}))
}));

// Mock Firebase Auth Functions
vi.mock('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => {
    callback(null);
    return vi.fn();
  }),
  signOut: vi.fn(() => Promise.resolve())
}));

// ============================================
// DOM SETUP
// ============================================

// Create basic DOM structure for tests
beforeEach(() => {
  document.body.innerHTML = `
    <div id="app">
      <div id="client-list-nav"></div>
      <div id="project-list-nav"></div>
      <div id="product-list-nav"></div>
      <div id="task-list"></div>
      <div id="subtask-list"></div>
      <div id="calendar-grid"></div>
      <div id="calendar-day-list"></div>
      <div id="search-results"></div>
    </div>
  `;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// ============================================
// GLOBAL TEST UTILITIES
// ============================================

// Helper to create mock user
global.createMockUser = (overrides = {}) => ({
  uid: 'test-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  ...overrides
});

// Helper to create mock client
global.createMockClient = (overrides = {}) => ({
  clientId: 'client-123',
  name: 'Test Client',
  createdAt: new Date().toISOString(),
  createdBy: 'test-uid-123',
  manageId: 'TC-001',
  managePrefix: 'TC',
  manageNextNumber: 2,
  projects: {},
  ...overrides
});

// Helper to create mock project
global.createMockProject = (overrides = {}) => ({
  projectId: 'project-123',
  name: 'Test Project',
  createdAt: new Date().toISOString(),
  status: 'Pendiente',
  manageId: 'TC-002',
  products: {},
  tasks: {},
  ...overrides
});

// Helper to create mock task
global.createMockTask = (overrides = {}) => ({
  taskId: 'task-123',
  name: 'Test Task',
  createdAt: new Date().toISOString(),
  status: 'Pendiente',
  manageId: 'TC-003',
  assigneeUid: '',
  description: '',
  priority: 'Media',
  subtasks: {},
  ...overrides
});

// Helper to wait for async operations
global.waitFor = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to flush promises
global.flushPromises = () => new Promise(resolve => setImmediate(resolve));

// ============================================
// CONSOLE MOCKING
// ============================================

// Suppress console.error in tests (can be enabled per-test)
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

// ============================================
// CUSTOM MATCHERS
// ============================================

expect.extend({
  toBeValidManageId(received) {
    const pass = /^[A-Z]{2,3}-\d{3}$/.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid manage ID`
          : `expected ${received} to be a valid manage ID (e.g., TC-001)`
    };
  },

  toBeValidStatus(received) {
    const validStatuses = ['Pendiente', 'En proceso', 'Finalizado'];
    const pass = validStatuses.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid status`
          : `expected ${received} to be one of: ${validStatuses.join(', ')}`
    };
  },

  toBeValidPriority(received) {
    const validPriorities = ['Alta', 'Media', 'Baja'];
    const pass = validPriorities.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid priority`
          : `expected ${received} to be one of: ${validPriorities.join(', ')}`
    };
  }
});
