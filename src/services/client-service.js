/**
 * Client Service - Business logic for client operations
 */

import { store } from '../state/store.js';
import * as fb from './firebase-service.js';
import {
  buildManagePrefixFromName,
  formatManageId,
  toISOString,
  logError
} from '../utils/helpers.js';

// ============================================
// CLIENT CRUD
// ============================================

/**
 * Create a new client
 * @param {string} name - Company name
 * @returns {Promise<string>} New client ID
 */
export const createClient = async (name) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para crear clientes');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('El nombre del cliente no puede estar vacío');
  }

  const managePrefix = buildManagePrefixFromName(trimmedName);
  const allClients = store.get('allClients');

  // Find next available manage number
  const existingIds = new Set(allClients.map(c => c?.manageId).filter(Boolean));
  let nextNumber = getNextManageNumber(allClients, managePrefix);
  let manageId = formatManageId(managePrefix, nextNumber);

  while (existingIds.has(manageId)) {
    nextNumber += 1;
    manageId = formatManageId(managePrefix, nextNumber);
  }

  const clientData = {
    name: trimmedName,
    createdAt: toISOString(),
    createdBy: currentUser.uid,
    manageId,
    managePrefix,
    manageNextNumber: 2
  };

  try {
    const clientId = await fb.createClient(clientData);

    // Log activity
    await logActivity(clientId, {
      action: 'create',
      entityType: 'client',
      description: `Cliente "${trimmedName}" creado`
    });

    return clientId;
  } catch (error) {
    logError('createClient', error);
    throw error;
  }
};

/**
 * Update a client
 * @param {string} clientId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateClient = async (clientId, updates) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para actualizar clientes');
  }

  try {
    await fb.updateClient(clientId, updates);

    if (updates.name) {
      await logActivity(clientId, {
        action: 'rename',
        entityType: 'client',
        description: `Cliente renombrado a "${updates.name}"`
      });
    }
  } catch (error) {
    logError('updateClient', error);
    throw error;
  }
};

/**
 * Delete a client
 * @param {string} clientId
 * @returns {Promise<void>}
 */
export const deleteClient = async (clientId) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para eliminar clientes');
  }

  const client = store.getClient(clientId);

  try {
    await fb.deleteClient(clientId);

    // Clear selection if this client was selected
    if (store.get('selectedClientId') === clientId) {
      store.clearSelection();
    }
  } catch (error) {
    logError('deleteClient', error);
    throw error;
  }
};

// ============================================
// PROJECT CRUD
// ============================================

/**
 * Create a new project
 * @param {string} clientId
 * @param {string} name
 * @returns {Promise<string>} New project ID
 */
export const createProject = async (clientId, name) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para crear proyectos');
  }

  const client = store.getClient(clientId);
  if (!client) {
    throw new Error('Cliente no encontrado');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('El nombre del proyecto no puede estar vacío');
  }

  // Generate manage ID
  const manageId = await generateManageId(clientId, 'project');

  const projectData = {
    name: trimmedName,
    manageId,
    status: 'Pendiente'
  };

  try {
    const projectId = await fb.createProject(clientId, projectData);

    await logActivity(clientId, {
      action: 'create',
      entityType: 'project',
      description: `Proyecto "${trimmedName}" creado`,
      path: `clients/${clientId}/projects/${projectId}`
    });

    return projectId;
  } catch (error) {
    logError('createProject', error);
    throw error;
  }
};

/**
 * Update a project
 * @param {string} clientId
 * @param {string} projectId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateProject = async (clientId, projectId, updates) => {
  try {
    await fb.updateProject(clientId, projectId, updates);

    if (updates.status) {
      await logActivity(clientId, {
        action: 'status_update',
        entityType: 'project',
        description: `Proyecto actualizado a "${updates.status}"`,
        path: `clients/${clientId}/projects/${projectId}`
      });
    }

    if (updates.name) {
      await logActivity(clientId, {
        action: 'rename',
        entityType: 'project',
        description: `Proyecto renombrado a "${updates.name}"`,
        path: `clients/${clientId}/projects/${projectId}`
      });
    }
  } catch (error) {
    logError('updateProject', error);
    throw error;
  }
};

/**
 * Delete a project
 * @param {string} clientId
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export const deleteProject = async (clientId, projectId) => {
  const project = store.getProject(clientId, projectId);

  try {
    await fb.deleteProject(clientId, projectId);

    await logActivity(clientId, {
      action: 'delete',
      entityType: 'project',
      description: `Proyecto "${project?.name || projectId}" eliminado`
    });

    if (store.get('selectedProjectId') === projectId) {
      store.selectClient(clientId);
    }
  } catch (error) {
    logError('deleteProject', error);
    throw error;
  }
};

// ============================================
// PRODUCT CRUD
// ============================================

/**
 * Create a new product
 * @param {string} clientId
 * @param {string} projectId
 * @param {string} name
 * @returns {Promise<string>} New product ID
 */
export const createProduct = async (clientId, projectId, name) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para crear productos');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('El nombre del producto no puede estar vacío');
  }

  const manageId = await generateManageId(clientId, 'product');

  const productData = {
    name: trimmedName,
    manageId,
    status: 'Pendiente'
  };

  try {
    const productId = await fb.createProduct(clientId, projectId, productData);

    await logActivity(clientId, {
      action: 'create',
      entityType: 'product',
      description: `Producto "${trimmedName}" creado`,
      path: `clients/${clientId}/projects/${projectId}/products/${productId}`
    });

    return productId;
  } catch (error) {
    logError('createProduct', error);
    throw error;
  }
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
  try {
    await fb.updateProduct(clientId, projectId, productId, updates);

    if (updates.status) {
      await logActivity(clientId, {
        action: 'status_update',
        entityType: 'product',
        description: `Producto actualizado a "${updates.status}"`,
        path: `clients/${clientId}/projects/${projectId}/products/${productId}`
      });
    }
  } catch (error) {
    logError('updateProduct', error);
    throw error;
  }
};

/**
 * Delete a product
 * @param {string} clientId
 * @param {string} projectId
 * @param {string} productId
 * @returns {Promise<void>}
 */
export const deleteProduct = async (clientId, projectId, productId) => {
  const product = store.getProduct(clientId, projectId, productId);

  try {
    await fb.deleteProduct(clientId, projectId, productId);

    await logActivity(clientId, {
      action: 'delete',
      entityType: 'product',
      description: `Producto "${product?.name || productId}" eliminado`
    });

    if (store.get('selectedProductId') === productId) {
      store.selectProject(projectId);
    }
  } catch (error) {
    logError('deleteProduct', error);
    throw error;
  }
};

// ============================================
// TASK CRUD
// ============================================

/**
 * Create a new task
 * @param {Object} context - { clientId, projectId, productId? }
 * @param {string} name
 * @param {Object} [options] - { assigneeUid, description, priority, dueDate }
 * @returns {Promise<string>} New task ID
 */
export const createTask = async (context, name, options = {}) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para crear tareas');
  }

  const { clientId, projectId, productId } = context;
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('El nombre de la tarea no puede estar vacío');
  }

  const manageId = await generateManageId(clientId, 'task');

  // Determine base path
  let basePath;
  if (productId) {
    basePath = `clients/${clientId}/projects/${projectId}/products/${productId}`;
  } else {
    basePath = `clients/${clientId}/projects/${projectId}`;
  }

  const taskData = {
    name: trimmedName,
    manageId,
    status: 'Pendiente',
    assigneeUid: options.assigneeUid || '',
    description: options.description || '',
    priority: options.priority || 'Media'
  };

  if (options.dueDate) {
    taskData.dueDate = options.dueDate;
  }

  try {
    const taskId = await fb.createTask(basePath, taskData);

    await logActivity(clientId, {
      action: 'create',
      entityType: 'task',
      description: `Tarea "${trimmedName}" creada`,
      path: `${basePath}/tasks/${taskId}`
    });

    // Send notification if assigned
    if (options.assigneeUid && options.assigneeUid !== currentUser.uid) {
      await sendAssignmentNotification(options.assigneeUid, {
        taskName: trimmedName,
        manageId,
        entityType: 'task',
        path: `${basePath}/tasks/${taskId}`
      });
    }

    return taskId;
  } catch (error) {
    logError('createTask', error);
    throw error;
  }
};

/**
 * Update a task
 * @param {string} taskPath - Full path to task
 * @param {string} clientId - For activity logging
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateTask = async (taskPath, clientId, updates) => {
  const currentUser = store.get('currentUser');

  try {
    await fb.updateTask(taskPath, updates);

    if (updates.status) {
      await logActivity(clientId, {
        action: 'status_update',
        entityType: 'task',
        description: `Tarea actualizada a "${updates.status}"`,
        path: taskPath
      });
    }

    if (updates.assigneeUid !== undefined) {
      await logActivity(clientId, {
        action: 'assignee_update',
        entityType: 'task',
        description: 'Asignación de tarea actualizada',
        path: taskPath,
        assigneeUid: updates.assigneeUid
      });

      // Send notification to new assignee
      if (updates.assigneeUid && updates.assigneeUid !== currentUser?.uid) {
        const taskData = await fb.getData(taskPath);
        await sendAssignmentNotification(updates.assigneeUid, {
          taskName: taskData?.name || 'Tarea',
          manageId: taskData?.manageId,
          entityType: 'task',
          path: taskPath
        });
      }
    }
  } catch (error) {
    logError('updateTask', error);
    throw error;
  }
};

/**
 * Delete a task
 * @param {string} taskPath - Full path to task
 * @param {string} clientId - For activity logging
 * @returns {Promise<void>}
 */
export const deleteTask = async (taskPath, clientId) => {
  try {
    const taskData = await fb.getData(taskPath);
    await fb.deleteTask(taskPath);

    await logActivity(clientId, {
      action: 'delete',
      entityType: 'task',
      description: `Tarea "${taskData?.name || 'desconocida'}" eliminada`
    });
  } catch (error) {
    logError('deleteTask', error);
    throw error;
  }
};

// ============================================
// SUBTASK CRUD
// ============================================

/**
 * Create a new subtask
 * @param {string} taskPath - Path to parent task
 * @param {string} clientId - For activity logging
 * @param {string} name
 * @param {Object} [options] - { assigneeUid }
 * @returns {Promise<string>} New subtask ID
 */
export const createSubtask = async (taskPath, clientId, name, options = {}) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para crear subtareas');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('El nombre de la subtarea no puede estar vacío');
  }

  const manageId = await generateManageId(clientId, 'subtask');

  const subtaskData = {
    name: trimmedName,
    manageId,
    status: 'Pendiente',
    assigneeUid: options.assigneeUid || ''
  };

  try {
    const subtaskId = await fb.createSubtask(taskPath, subtaskData);

    await logActivity(clientId, {
      action: 'create',
      entityType: 'subtask',
      description: `Subtarea "${trimmedName}" creada`,
      path: `${taskPath}/subtasks/${subtaskId}`
    });

    return subtaskId;
  } catch (error) {
    logError('createSubtask', error);
    throw error;
  }
};

/**
 * Update a subtask
 * @param {string} subtaskPath - Full path to subtask
 * @param {string} clientId - For activity logging
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateSubtask = async (subtaskPath, clientId, updates) => {
  try {
    await fb.updateSubtask(subtaskPath, updates);

    if (updates.status) {
      await logActivity(clientId, {
        action: 'status_update',
        entityType: 'subtask',
        description: `Subtarea actualizada a "${updates.status}"`,
        path: subtaskPath
      });
    }
  } catch (error) {
    logError('updateSubtask', error);
    throw error;
  }
};

/**
 * Delete a subtask
 * @param {string} subtaskPath - Full path to subtask
 * @param {string} clientId - For activity logging
 * @returns {Promise<void>}
 */
export const deleteSubtask = async (subtaskPath, clientId) => {
  try {
    const subtaskData = await fb.getData(subtaskPath);
    await fb.deleteSubtask(subtaskPath);

    await logActivity(clientId, {
      action: 'delete',
      entityType: 'subtask',
      description: `Subtarea "${subtaskData?.name || 'desconocida'}" eliminada`
    });
  } catch (error) {
    logError('deleteSubtask', error);
    throw error;
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get next manage number for a client
 * @param {Object[]} clients
 * @param {string} prefix
 * @returns {number}
 */
const getNextManageNumber = (clients, prefix) => {
  const matchingClients = clients.filter(c => c?.managePrefix === prefix);
  if (matchingClients.length === 0) return 1;

  const numbers = matchingClients
    .map(c => {
      const match = c.manageId?.match(/-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n));

  return Math.max(...numbers, 0) + 1;
};

/**
 * Generate manage ID using transaction
 * @param {string} clientId
 * @param {string} type - 'project', 'product', 'task', 'subtask'
 * @returns {Promise<string>}
 */
const generateManageId = async (clientId, type) => {
  const client = store.getClient(clientId);
  if (!client) throw new Error('Cliente no encontrado');

  const prefix = client.managePrefix || 'XX';

  // Use transaction to get next number
  const result = await fb.transaction(`clients/${clientId}/manageNextNumber`, (current) => {
    return (current || 1) + 1;
  });

  const number = result - 1; // Transaction returns the new value
  return formatManageId(prefix, number);
};

/**
 * Log activity to client's activity log
 * @param {string} clientId
 * @param {Object} logData
 * @returns {Promise<void>}
 */
const logActivity = async (clientId, logData) => {
  const currentUser = store.get('currentUser');
  const usersByUid = store.get('usersByUid');

  const actorName = usersByUid[currentUser?.uid]?.username || currentUser?.email || 'Usuario';

  try {
    await fb.addActivityLog(clientId, {
      actorUid: currentUser?.uid || '',
      actorName,
      ...logData
    });
  } catch (error) {
    // Don't throw - activity logging should not break main operation
    logError('logActivity', error);
  }
};

/**
 * Send assignment notification
 * @param {string} toUid
 * @param {Object} data
 * @returns {Promise<void>}
 */
const sendAssignmentNotification = async (toUid, data) => {
  const currentUser = store.get('currentUser');
  const usersByUid = store.get('usersByUid');

  const fromName = usersByUid[currentUser?.uid]?.username || currentUser?.email || 'Usuario';

  try {
    await fb.sendNotification(toUid, {
      title: 'Nueva asignación',
      taskName: data.taskName,
      manageId: data.manageId,
      entityType: data.entityType,
      path: data.path,
      fromUid: currentUser?.uid || '',
      fromName
    });
  } catch (error) {
    logError('sendAssignmentNotification', error);
  }
};

// ============================================
// DATA SUBSCRIPTION
// ============================================

/**
 * Initialize data subscriptions
 * @returns {Function} Cleanup function
 */
export const initializeSubscriptions = () => {
  const unsubscribers = [];

  // Subscribe to clients
  const unsubClients = fb.subscribeToClients((clients) => {
    store.setKey('allClients', clients);
    store.setKey('clientsLoading', false);
  }, (error) => {
    console.error('Clients subscription error:', error);
    store.setKey('clientsLoading', false);
  });
  unsubscribers.push(unsubClients);

  // Subscribe to users
  const unsubUsers = fb.subscribeToUsers((users) => {
    store.setKey('usersByUid', users);
  });
  unsubscribers.push(unsubUsers);

  store.setKey('listenersAttached', true);

  // Return cleanup function
  return () => {
    unsubscribers.forEach(unsub => unsub());
    store.setKey('listenersAttached', false);
  };
};
