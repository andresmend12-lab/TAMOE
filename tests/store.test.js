/**
 * Tests for State Store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { store, Store, initialState } from '../src/state/store.js';

describe('Store', () => {
  let testStore;

  beforeEach(() => {
    testStore = new Store();
  });

  // ============================================
  // BASIC OPERATIONS
  // ============================================

  describe('get', () => {
    it('should return entire state when no key provided', () => {
      const state = testStore.get();
      expect(state).toHaveProperty('currentUser');
      expect(state).toHaveProperty('allClients');
    });

    it('should return specific value when key provided', () => {
      testStore.set({ currentUser: { uid: 'test-123' } });
      expect(testStore.get('currentUser')).toEqual({ uid: 'test-123' });
    });

    it('should return undefined for non-existent key', () => {
      expect(testStore.get('nonExistent')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should update state with partial updates', () => {
      testStore.set({ currentUser: { uid: 'user-1' } });
      expect(testStore.get('currentUser')).toEqual({ uid: 'user-1' });

      testStore.set({ selectedClientId: 'client-1' });
      expect(testStore.get('selectedClientId')).toBe('client-1');
      expect(testStore.get('currentUser')).toEqual({ uid: 'user-1' });
    });

    it('should notify subscribers on update', () => {
      const callback = vi.fn();
      testStore.subscribe(callback);

      testStore.set({ selectedClientId: 'client-1' });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('setKey', () => {
    it('should update specific key', () => {
      testStore.setKey('selectedClientId', 'client-1');
      expect(testStore.get('selectedClientId')).toBe('client-1');
    });

    it('should notify subscribers with changed key', () => {
      const callback = vi.fn();
      testStore.subscribe(callback);

      testStore.setKey('selectedClientId', 'client-1');

      expect(callback).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'selectedClientId'
      );
    });
  });

  // ============================================
  // SUBSCRIPTIONS
  // ============================================

  describe('subscribe', () => {
    it('should call callback on state change', () => {
      const callback = vi.fn();
      testStore.subscribe(callback);

      testStore.set({ selectedClientId: 'client-1' });

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ selectedClientId: 'client-1' }),
        expect.any(Object),
        null
      );
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = testStore.subscribe(callback);

      testStore.set({ selectedClientId: 'client-1' });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      testStore.set({ selectedClientId: 'client-2' });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should filter by keys when provided', () => {
      const callback = vi.fn();
      testStore.subscribe(callback, ['selectedClientId']);

      testStore.setKey('selectedProjectId', 'project-1');
      expect(callback).not.toHaveBeenCalled();

      testStore.setKey('selectedClientId', 'client-1');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in subscribers gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const normalCallback = vi.fn();

      testStore.subscribe(errorCallback);
      testStore.subscribe(normalCallback);

      testStore.set({ selectedClientId: 'client-1' });

      expect(normalCallback).toHaveBeenCalled();
    });
  });

  // ============================================
  // RESET
  // ============================================

  describe('reset', () => {
    it('should reset state to initial values', () => {
      testStore.set({
        currentUser: { uid: 'user-1' },
        selectedClientId: 'client-1',
        allClients: [{ name: 'Test' }]
      });

      testStore.reset();

      expect(testStore.get('currentUser')).toBeNull();
      expect(testStore.get('selectedClientId')).toBeNull();
      expect(testStore.get('allClients')).toEqual([]);
    });

    it('should notify subscribers on reset', () => {
      const callback = vi.fn();
      testStore.subscribe(callback);

      testStore.reset();

      expect(callback).toHaveBeenCalled();
    });
  });

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  describe('getClient', () => {
    it('should return client by ID', () => {
      const client = createMockClient({ clientId: 'client-123' });
      testStore.set({ allClients: [client] });

      expect(testStore.getClient('client-123')).toEqual(client);
    });

    it('should return null for non-existent client', () => {
      testStore.set({ allClients: [] });
      expect(testStore.getClient('non-existent')).toBeNull();
    });
  });

  describe('getProject', () => {
    it('should return project from client', () => {
      const project = createMockProject({ projectId: 'project-123' });
      const client = createMockClient({
        clientId: 'client-123',
        projects: { 'project-123': project }
      });
      testStore.set({ allClients: [client] });

      expect(testStore.getProject('client-123', 'project-123')).toEqual(project);
    });

    it('should return null for non-existent project', () => {
      const client = createMockClient({ clientId: 'client-123', projects: {} });
      testStore.set({ allClients: [client] });

      expect(testStore.getProject('client-123', 'non-existent')).toBeNull();
    });
  });

  describe('getProduct', () => {
    it('should return product from project', () => {
      const product = { productId: 'product-123', name: 'Test Product' };
      const project = createMockProject({
        projectId: 'project-123',
        products: { 'product-123': product }
      });
      const client = createMockClient({
        clientId: 'client-123',
        projects: { 'project-123': project }
      });
      testStore.set({ allClients: [client] });

      expect(testStore.getProduct('client-123', 'project-123', 'product-123')).toEqual(product);
    });
  });

  describe('getUser', () => {
    it('should return user by UID', () => {
      const user = { username: 'Test User', email: 'test@example.com' };
      testStore.set({ usersByUid: { 'user-123': user } });

      expect(testStore.getUser('user-123')).toEqual(user);
    });

    it('should return null for non-existent user', () => {
      testStore.set({ usersByUid: {} });
      expect(testStore.getUser('non-existent')).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when user is set', () => {
      testStore.set({ currentUser: { uid: 'user-123' } });
      expect(testStore.isAuthenticated()).toBe(true);
    });

    it('should return false when user is null', () => {
      testStore.set({ currentUser: null });
      expect(testStore.isAuthenticated()).toBe(false);
    });
  });

  describe('getSelectionPath', () => {
    it('should return all selection IDs', () => {
      testStore.set({
        selectedClientId: 'client-1',
        selectedProjectId: 'project-1',
        selectedProductId: 'product-1',
        selectedTaskId: 'task-1',
        selectedSubtaskId: 'subtask-1'
      });

      expect(testStore.getSelectionPath()).toEqual({
        clientId: 'client-1',
        projectId: 'project-1',
        productId: 'product-1',
        taskId: 'task-1',
        subtaskId: 'subtask-1'
      });
    });
  });

  describe('clearSelection', () => {
    it('should clear all selection IDs', () => {
      testStore.set({
        selectedClientId: 'client-1',
        selectedProjectId: 'project-1',
        selectedProductId: 'product-1',
        selectedTaskId: 'task-1',
        selectedSubtaskId: 'subtask-1'
      });

      testStore.clearSelection();

      expect(testStore.get('selectedClientId')).toBeNull();
      expect(testStore.get('selectedProjectId')).toBeNull();
      expect(testStore.get('selectedProductId')).toBeNull();
      expect(testStore.get('selectedTaskId')).toBeNull();
      expect(testStore.get('selectedSubtaskId')).toBeNull();
    });
  });

  describe('selectClient', () => {
    it('should select client and clear downstream selections', () => {
      testStore.set({
        selectedClientId: 'client-old',
        selectedProjectId: 'project-1',
        selectedProductId: 'product-1'
      });

      testStore.selectClient('client-new');

      expect(testStore.get('selectedClientId')).toBe('client-new');
      expect(testStore.get('selectedProjectId')).toBeNull();
      expect(testStore.get('selectedProductId')).toBeNull();
    });
  });

  describe('selectProject', () => {
    it('should select project and clear downstream selections', () => {
      testStore.set({
        selectedClientId: 'client-1',
        selectedProjectId: 'project-old',
        selectedProductId: 'product-1',
        selectedTaskId: 'task-1'
      });

      testStore.selectProject('project-new');

      expect(testStore.get('selectedClientId')).toBe('client-1');
      expect(testStore.get('selectedProjectId')).toBe('project-new');
      expect(testStore.get('selectedProductId')).toBeNull();
      expect(testStore.get('selectedTaskId')).toBeNull();
    });
  });

  describe('selectProduct', () => {
    it('should select product and clear downstream selections', () => {
      testStore.set({
        selectedProductId: 'product-old',
        selectedTaskId: 'task-1'
      });

      testStore.selectProduct('product-new');

      expect(testStore.get('selectedProductId')).toBe('product-new');
      expect(testStore.get('selectedTaskId')).toBeNull();
    });
  });

  describe('selectTask', () => {
    it('should select task and clear subtask selection', () => {
      testStore.set({
        selectedTaskId: 'task-old',
        selectedSubtaskId: 'subtask-1'
      });

      testStore.selectTask('task-new');

      expect(testStore.get('selectedTaskId')).toBe('task-new');
      expect(testStore.get('selectedSubtaskId')).toBeNull();
    });
  });

  describe('selectSubtask', () => {
    it('should select subtask', () => {
      testStore.selectSubtask('subtask-new');
      expect(testStore.get('selectedSubtaskId')).toBe('subtask-new');
    });
  });
});

// ============================================
// SINGLETON INSTANCE
// ============================================

describe('Store Singleton', () => {
  it('should export a store instance', () => {
    expect(store).toBeInstanceOf(Store);
  });

  it('should maintain state across uses', () => {
    store.setKey('selectedClientId', 'singleton-test');
    expect(store.get('selectedClientId')).toBe('singleton-test');

    // Cleanup
    store.setKey('selectedClientId', null);
  });
});
