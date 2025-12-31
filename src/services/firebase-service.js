/**
 * Firebase Service - Centralized Firebase operations
 */

import { auth, database } from '../../firebase.js';
import {
  ref,
  push,
  onValue,
  query,
  set,
  update,
  remove,
  runTransaction,
  serverTimestamp,
  get,
  orderByChild,
  limitToLast
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

// ============================================
// EXPORTS
// ============================================

export { auth, database, serverTimestamp };

// ============================================
// REFERENCE HELPERS
// ============================================

/**
 * Get database reference
 * @param {string} path
 * @returns {DatabaseReference}
 */
export const getRef = (path) => ref(database, path);

/**
 * Get clients reference
 * @returns {DatabaseReference}
 */
export const getClientsRef = () => ref(database, 'clients');

/**
 * Get users reference
 * @returns {DatabaseReference}
 */
export const getUsersRef = () => ref(database, 'users');

/**
 * Get automations reference
 * @returns {DatabaseReference}
 */
export const getAutomationsRef = () => ref(database, 'automations');

/**
 * Get notifications reference for a user
 * @param {string} uid
 * @returns {DatabaseReference}
 */
export const getNotificationsRef = (uid) => ref(database, `notifications/${uid}`);

// ============================================
// AUTH OPERATIONS
// ============================================

/**
 * Subscribe to auth state changes
 * @param {Function} callback - (user) => void
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAuth = (callback) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export const logout = () => signOut(auth);

/**
 * Get current user
 * @returns {User|null}
 */
export const getCurrentUser = () => auth.currentUser;

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Subscribe to a database path
 * @param {string} path
 * @param {Function} callback - (data, key) => void
 * @param {Function} [errorCallback]
 * @returns {Function} Unsubscribe function
 */
export const subscribe = (path, callback, errorCallback) => {
  const dbRef = ref(database, path);
  const unsubscribe = onValue(dbRef, (snapshot) => {
    callback(snapshot.val(), snapshot.key);
  }, (error) => {
    console.error(`Firebase subscription error at ${path}:`, error);
    if (errorCallback) errorCallback(error);
  });
  return unsubscribe;
};

/**
 * Subscribe to clients with real-time updates
 * @param {Function} callback - (clients[]) => void
 * @param {Function} [errorCallback]
 * @returns {Function} Unsubscribe function
 */
export const subscribeToClients = (callback, errorCallback) => {
  const clientsRef = getClientsRef();
  return onValue(clientsRef, (snapshot) => {
    const data = snapshot.val() || {};
    const clients = Object.entries(data).map(([key, value]) => ({
      ...value,
      clientId: key
    }));
    callback(clients);
  }, (error) => {
    console.error('Firebase clients subscription error:', error);
    if (errorCallback) errorCallback(error);
  });
};

/**
 * Subscribe to users with real-time updates
 * @param {Function} callback - (usersByUid) => void
 * @param {Function} [errorCallback]
 * @returns {Function} Unsubscribe function
 */
export const subscribeToUsers = (callback, errorCallback) => {
  const usersRef = getUsersRef();
  return onValue(usersRef, (snapshot) => {
    const data = snapshot.val() || {};
    callback(data);
  }, (error) => {
    console.error('Firebase users subscription error:', error);
    if (errorCallback) errorCallback(error);
  });
};

/**
 * Get data once from a path
 * @param {string} path
 * @returns {Promise<any>}
 */
export const getData = async (path) => {
  const dbRef = ref(database, path);
  const snapshot = await get(dbRef);
  return snapshot.val();
};

/**
 * Check if path exists
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export const exists = async (path) => {
  const dbRef = ref(database, path);
  const snapshot = await get(dbRef);
  return snapshot.exists();
};

// ============================================
// WRITE OPERATIONS
// ============================================

/**
 * Push new data to a path
 * @param {string} path
 * @param {Object} data
 * @returns {Promise<string>} New key
 */
export const pushData = async (path, data) => {
  const dbRef = ref(database, path);
  const newRef = push(dbRef);
  await set(newRef, data);
  return newRef.key;
};

/**
 * Set data at a path
 * @param {string} path
 * @param {any} data
 * @returns {Promise<void>}
 */
export const setData = async (path, data) => {
  const dbRef = ref(database, path);
  await set(dbRef, data);
};

/**
 * Update data at a path
 * @param {string} path
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateData = async (path, updates) => {
  const dbRef = ref(database, path);
  await update(dbRef, updates);
};

/**
 * Remove data at a path
 * @param {string} path
 * @returns {Promise<void>}
 */
export const removeData = async (path) => {
  const dbRef = ref(database, path);
  await remove(dbRef);
};

/**
 * Run a transaction
 * @param {string} path
 * @param {Function} transactionUpdate
 * @returns {Promise<any>}
 */
export const transaction = async (path, transactionUpdate) => {
  const dbRef = ref(database, path);
  const result = await runTransaction(dbRef, transactionUpdate);
  return result.snapshot.val();
};

// ============================================
// CLIENT OPERATIONS
// ============================================

/**
 * Create a new client
 * @param {Object} clientData
 * @returns {Promise<string>} New client ID
 */
export const createClient = async (clientData) => {
  const clientsRef = getClientsRef();
  const newRef = push(clientsRef);
  const data = {
    ...clientData,
    clientId: newRef.key,
    createdAt: new Date().toISOString()
  };
  await set(newRef, data);
  return newRef.key;
};

/**
 * Update a client
 * @param {string} clientId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateClient = async (clientId, updates) => {
  await updateData(`clients/${clientId}`, updates);
};

/**
 * Delete a client
 * @param {string} clientId
 * @returns {Promise<void>}
 */
export const deleteClient = async (clientId) => {
  await removeData(`clients/${clientId}`);
};

// ============================================
// PROJECT OPERATIONS
// ============================================

/**
 * Create a new project
 * @param {string} clientId
 * @param {Object} projectData
 * @returns {Promise<string>} New project ID
 */
export const createProject = async (clientId, projectData) => {
  const projectsRef = ref(database, `clients/${clientId}/projects`);
  const newRef = push(projectsRef);
  const data = {
    ...projectData,
    projectId: newRef.key,
    createdAt: new Date().toISOString(),
    status: projectData.status || 'Pendiente'
  };
  await set(newRef, data);
  return newRef.key;
};

/**
 * Update a project
 * @param {string} clientId
 * @param {string} projectId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateProject = async (clientId, projectId, updates) => {
  await updateData(`clients/${clientId}/projects/${projectId}`, updates);
};

/**
 * Delete a project
 * @param {string} clientId
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export const deleteProject = async (clientId, projectId) => {
  await removeData(`clients/${clientId}/projects/${projectId}`);
};

// ============================================
// PRODUCT OPERATIONS
// ============================================

/**
 * Create a new product
 * @param {string} clientId
 * @param {string} projectId
 * @param {Object} productData
 * @returns {Promise<string>} New product ID
 */
export const createProduct = async (clientId, projectId, productData) => {
  const productsRef = ref(database, `clients/${clientId}/projects/${projectId}/products`);
  const newRef = push(productsRef);
  const data = {
    ...productData,
    productId: newRef.key,
    createdAt: new Date().toISOString(),
    status: productData.status || 'Pendiente'
  };
  await set(newRef, data);
  return newRef.key;
};

/**
 * Update a product
 * @param {string} clientId
 * @param {string} projectId
 * @param {string} productId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateProduct = async (clientId, projectId, productId, updates) => {
  await updateData(`clients/${clientId}/projects/${projectId}/products/${productId}`, updates);
};

/**
 * Delete a product
 * @param {string} clientId
 * @param {string} projectId
 * @param {string} productId
 * @returns {Promise<void>}
 */
export const deleteProduct = async (clientId, projectId, productId) => {
  await removeData(`clients/${clientId}/projects/${projectId}/products/${productId}`);
};

// ============================================
// TASK OPERATIONS
// ============================================

/**
 * Create a task (can be at project or product level)
 * @param {string} basePath - Path to parent (project or product)
 * @param {Object} taskData
 * @returns {Promise<string>} New task ID
 */
export const createTask = async (basePath, taskData) => {
  const tasksRef = ref(database, `${basePath}/tasks`);
  const newRef = push(tasksRef);
  const data = {
    ...taskData,
    taskId: newRef.key,
    createdAt: new Date().toISOString(),
    status: taskData.status || 'Pendiente'
  };
  await set(newRef, data);
  return newRef.key;
};

/**
 * Update a task
 * @param {string} taskPath - Full path to task
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateTask = async (taskPath, updates) => {
  await updateData(taskPath, updates);
};

/**
 * Delete a task
 * @param {string} taskPath - Full path to task
 * @returns {Promise<void>}
 */
export const deleteTask = async (taskPath) => {
  await removeData(taskPath);
};

// ============================================
// SUBTASK OPERATIONS
// ============================================

/**
 * Create a subtask
 * @param {string} taskPath - Path to parent task
 * @param {Object} subtaskData
 * @returns {Promise<string>} New subtask ID
 */
export const createSubtask = async (taskPath, subtaskData) => {
  const subtasksRef = ref(database, `${taskPath}/subtasks`);
  const newRef = push(subtasksRef);
  const data = {
    ...subtaskData,
    subtaskId: newRef.key,
    createdAt: new Date().toISOString(),
    status: subtaskData.status || 'Pendiente'
  };
  await set(newRef, data);
  return newRef.key;
};

/**
 * Update a subtask
 * @param {string} subtaskPath - Full path to subtask
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateSubtask = async (subtaskPath, updates) => {
  await updateData(subtaskPath, updates);
};

/**
 * Delete a subtask
 * @param {string} subtaskPath - Full path to subtask
 * @returns {Promise<void>}
 */
export const deleteSubtask = async (subtaskPath) => {
  await removeData(subtaskPath);
};

// ============================================
// ACTIVITY LOG OPERATIONS
// ============================================

/**
 * Add activity log entry
 * @param {string} clientId
 * @param {Object} logData
 * @returns {Promise<string>} New log ID
 */
export const addActivityLog = async (clientId, logData) => {
  const logsRef = ref(database, `clients/${clientId}/activity_logs`);
  const newRef = push(logsRef);
  const data = {
    ...logData,
    timestamp: serverTimestamp()
  };
  await set(newRef, data);
  return newRef.key;
};

/**
 * Get recent activity logs
 * @param {string} clientId
 * @param {number} [limit=20]
 * @returns {Promise<Object[]>}
 */
export const getActivityLogs = async (clientId, limit = 20) => {
  const logsRef = query(
    ref(database, `clients/${clientId}/activity_logs`),
    orderByChild('timestamp'),
    limitToLast(limit)
  );
  const snapshot = await get(logsRef);
  const data = snapshot.val() || {};
  return Object.entries(data)
    .map(([key, value]) => ({ ...value, logId: key }))
    .reverse();
};

// ============================================
// NOTIFICATION OPERATIONS
// ============================================

/**
 * Send notification to user
 * @param {string} toUid - Target user ID
 * @param {Object} notificationData
 * @returns {Promise<string>} New notification ID
 */
export const sendNotification = async (toUid, notificationData) => {
  const notificationsRef = ref(database, `notifications/${toUid}`);
  const newRef = push(notificationsRef);
  const data = {
    ...notificationData,
    read: false,
    createdAt: serverTimestamp()
  };
  await set(newRef, data);
  return newRef.key;
};

/**
 * Mark notification as read
 * @param {string} uid
 * @param {string} notificationId
 * @returns {Promise<void>}
 */
export const markNotificationRead = async (uid, notificationId) => {
  await updateData(`notifications/${uid}/${notificationId}`, { read: true });
};

/**
 * Delete notification
 * @param {string} uid
 * @param {string} notificationId
 * @returns {Promise<void>}
 */
export const deleteNotification = async (uid, notificationId) => {
  await removeData(`notifications/${uid}/${notificationId}`);
};

// ============================================
// USER OPERATIONS
// ============================================

/**
 * Get user profile
 * @param {string} uid
 * @returns {Promise<Object|null>}
 */
export const getUserProfile = async (uid) => {
  return await getData(`users/${uid}`);
};

/**
 * Update user profile
 * @param {string} uid
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateUserProfile = async (uid, updates) => {
  await updateData(`users/${uid}`, updates);
};
