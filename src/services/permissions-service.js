/**
 * Permissions Service - Role-based access control for TAMOE
 */

import { store } from '../state/store.js';
import * as fb from './firebase-service.js';
import { logError } from '../utils/helpers.js';

// ============================================
// CONSTANTS
// ============================================

/**
 * Available roles in the system
 */
export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer'
};

/**
 * Available resources
 */
export const RESOURCES = {
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  PRODUCTS: 'products',
  TASKS: 'tasks',
  SUBTASKS: 'subtasks',
  USERS: 'users',
  AUTOMATIONS: 'automations',
  SETTINGS: 'settings'
};

/**
 * Available actions
 */
export const ACTIONS = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  ASSIGN: 'assign',
  MANAGE: 'manage'
};

/**
 * Default permissions for each role
 */
export const DEFAULT_PERMISSIONS = {
  [ROLES.ADMIN]: {
    [RESOURCES.CLIENTS]: { read: true, write: true, delete: true, manage: true },
    [RESOURCES.PROJECTS]: { read: true, write: true, delete: true, manage: true },
    [RESOURCES.PRODUCTS]: { read: true, write: true, delete: true, manage: true },
    [RESOURCES.TASKS]: { read: true, write: true, delete: true, assign: true },
    [RESOURCES.SUBTASKS]: { read: true, write: true, delete: true, assign: true },
    [RESOURCES.USERS]: { read: true, write: true, delete: true, manage: true },
    [RESOURCES.AUTOMATIONS]: { read: true, write: true, delete: true },
    [RESOURCES.SETTINGS]: { read: true, write: true }
  },
  [ROLES.EDITOR]: {
    [RESOURCES.CLIENTS]: { read: true, write: true, delete: false, manage: false },
    [RESOURCES.PROJECTS]: { read: true, write: true, delete: false, manage: false },
    [RESOURCES.PRODUCTS]: { read: true, write: true, delete: false, manage: false },
    [RESOURCES.TASKS]: { read: true, write: true, delete: true, assign: true },
    [RESOURCES.SUBTASKS]: { read: true, write: true, delete: true, assign: true },
    [RESOURCES.USERS]: { read: true, write: false, delete: false, manage: false },
    [RESOURCES.AUTOMATIONS]: { read: true, write: true, delete: false },
    [RESOURCES.SETTINGS]: { read: true, write: false }
  },
  [ROLES.VIEWER]: {
    [RESOURCES.CLIENTS]: { read: true, write: false, delete: false, manage: false },
    [RESOURCES.PROJECTS]: { read: true, write: false, delete: false, manage: false },
    [RESOURCES.PRODUCTS]: { read: true, write: false, delete: false, manage: false },
    [RESOURCES.TASKS]: { read: true, write: false, delete: false, assign: false },
    [RESOURCES.SUBTASKS]: { read: true, write: false, delete: false, assign: false },
    [RESOURCES.USERS]: { read: true, write: false, delete: false, manage: false },
    [RESOURCES.AUTOMATIONS]: { read: true, write: false, delete: false },
    [RESOURCES.SETTINGS]: { read: true, write: false }
  }
};

// ============================================
// PERMISSIONS SERVICE CLASS
// ============================================

class PermissionsService {
  constructor() {
    this.userId = null;
    this.role = null;
    this.permissions = null;
    this.loaded = false;
    this.loading = false;
  }

  /**
   * Load permissions for a user
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async load(userId) {
    if (this.loading) return;
    if (this.loaded && this.userId === userId) return;

    this.loading = true;
    this.userId = userId;

    try {
      const userData = await fb.getData(`users/${userId}`);

      if (userData) {
        this.role = userData.role || ROLES.VIEWER;
        this.permissions = userData.permissions || DEFAULT_PERMISSIONS[this.role];
      } else {
        this.role = ROLES.VIEWER;
        this.permissions = DEFAULT_PERMISSIONS[ROLES.VIEWER];
      }

      this.loaded = true;
    } catch (error) {
      logError('PermissionsService.load', error);
      // Default to viewer on error
      this.role = ROLES.VIEWER;
      this.permissions = DEFAULT_PERMISSIONS[ROLES.VIEWER];
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Reset permissions state
   */
  reset() {
    this.userId = null;
    this.role = null;
    this.permissions = null;
    this.loaded = false;
    this.loading = false;
  }

  /**
   * Check if user has permission for an action on a resource
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {boolean}
   */
  can(resource, action) {
    // Admin can do everything
    if (this.role === ROLES.ADMIN) return true;

    // Check specific permission
    const resourcePerms = this.permissions?.[resource];
    if (!resourcePerms) return false;

    return resourcePerms[action] === true;
  }

  /**
   * Check permission and throw error if not allowed
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @throws {Error} If permission denied
   */
  require(resource, action) {
    if (!this.can(resource, action)) {
      throw new Error(
        `Permiso denegado: No puedes ${this.getActionLabel(action)} en ${this.getResourceLabel(resource)}`
      );
    }
  }

  /**
   * Check if user is admin
   * @returns {boolean}
   */
  isAdmin() {
    return this.role === ROLES.ADMIN;
  }

  /**
   * Check if user is editor or above
   * @returns {boolean}
   */
  isEditor() {
    return this.role === ROLES.ADMIN || this.role === ROLES.EDITOR;
  }

  /**
   * Check if user is viewer only
   * @returns {boolean}
   */
  isViewer() {
    return this.role === ROLES.VIEWER;
  }

  /**
   * Get current role
   * @returns {string}
   */
  getRole() {
    return this.role;
  }

  /**
   * Get all permissions
   * @returns {Object}
   */
  getPermissions() {
    return { ...this.permissions };
  }

  /**
   * Get human-readable action label
   * @param {string} action
   * @returns {string}
   */
  getActionLabel(action) {
    const labels = {
      read: 'ver',
      write: 'editar',
      delete: 'eliminar',
      assign: 'asignar',
      manage: 'gestionar'
    };
    return labels[action] || action;
  }

  /**
   * Get human-readable resource label
   * @param {string} resource
   * @returns {string}
   */
  getResourceLabel(resource) {
    const labels = {
      clients: 'clientes',
      projects: 'proyectos',
      products: 'productos',
      tasks: 'tareas',
      subtasks: 'subtareas',
      users: 'usuarios',
      automations: 'automatizaciones',
      settings: 'configuración'
    };
    return labels[resource] || resource;
  }

  /**
   * Get role label
   * @param {string} role
   * @returns {string}
   */
  getRoleLabel(role) {
    const labels = {
      admin: 'Administrador',
      editor: 'Editor',
      viewer: 'Visualizador'
    };
    return labels[role] || role;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const permissions = new PermissionsService();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Initialize permissions for current user
 * @returns {Promise<void>}
 */
export const initializePermissions = async () => {
  const currentUser = store.get('currentUser');
  if (currentUser?.uid) {
    await permissions.load(currentUser.uid);
  }
};

/**
 * Check permission helper
 * @param {string} resource
 * @param {string} action
 * @returns {boolean}
 */
export const can = (resource, action) => {
  return permissions.can(resource, action);
};

/**
 * Require permission helper (throws on denied)
 * @param {string} resource
 * @param {string} action
 */
export const requirePermission = (resource, action) => {
  permissions.require(resource, action);
};

// ============================================
// ROLE MANAGEMENT (Admin only)
// ============================================

/**
 * Update user role (admin only)
 * @param {string} targetUserId - User to update
 * @param {string} newRole - New role
 * @returns {Promise<void>}
 */
export const updateUserRole = async (targetUserId, newRole) => {
  // Check admin permission
  permissions.require(RESOURCES.USERS, ACTIONS.MANAGE);

  // Validate role
  if (!Object.values(ROLES).includes(newRole)) {
    throw new Error(`Rol inválido: ${newRole}`);
  }

  // Prevent self-demotion for last admin
  if (targetUserId === permissions.userId && newRole !== ROLES.ADMIN) {
    // Check if there are other admins
    const users = store.get('usersByUid') || {};
    const adminCount = Object.values(users).filter(u => u.role === ROLES.ADMIN).length;

    if (adminCount <= 1) {
      throw new Error('No puedes quitarte el rol de administrador siendo el único admin');
    }
  }

  try {
    await fb.updateData(`users/${targetUserId}`, {
      role: newRole,
      permissions: DEFAULT_PERMISSIONS[newRole]
    });

    // Log the change
    await fb.setData(`security_logs/${Date.now()}`, {
      action: 'role_change',
      targetUserId,
      newRole,
      changedBy: permissions.userId,
      timestamp: Date.now()
    });
  } catch (error) {
    logError('updateUserRole', error);
    throw error;
  }
};

/**
 * Update specific permissions for a user (admin only)
 * @param {string} targetUserId - User to update
 * @param {Object} newPermissions - Permissions to update
 * @returns {Promise<void>}
 */
export const updateUserPermissions = async (targetUserId, newPermissions) => {
  // Check admin permission
  permissions.require(RESOURCES.USERS, ACTIONS.MANAGE);

  try {
    // Get current user data
    const userData = await fb.getData(`users/${targetUserId}`);
    const currentPermissions = userData?.permissions || DEFAULT_PERMISSIONS[ROLES.VIEWER];

    // Merge permissions
    const mergedPermissions = { ...currentPermissions };
    for (const [resource, actions] of Object.entries(newPermissions)) {
      mergedPermissions[resource] = {
        ...(mergedPermissions[resource] || {}),
        ...actions
      };
    }

    await fb.updateData(`users/${targetUserId}`, {
      permissions: mergedPermissions
    });

    // Log the change
    await fb.setData(`security_logs/${Date.now()}`, {
      action: 'permission_change',
      targetUserId,
      changes: newPermissions,
      changedBy: permissions.userId,
      timestamp: Date.now()
    });
  } catch (error) {
    logError('updateUserPermissions', error);
    throw error;
  }
};

/**
 * Get all users with their roles (admin only)
 * @returns {Promise<Object[]>}
 */
export const getUsersWithRoles = async () => {
  permissions.require(RESOURCES.USERS, ACTIONS.READ);

  const users = store.get('usersByUid') || {};

  return Object.entries(users).map(([uid, data]) => ({
    uid,
    email: data.email,
    username: data.username,
    department: data.department,
    role: data.role || ROLES.VIEWER,
    permissions: data.permissions || DEFAULT_PERMISSIONS[data.role || ROLES.VIEWER]
  }));
};

// ============================================
// UI HELPERS
// ============================================

/**
 * Get visibility class based on permission
 * @param {string} resource
 * @param {string} action
 * @returns {string} CSS class
 */
export const getVisibilityClass = (resource, action) => {
  return permissions.can(resource, action) ? '' : 'hidden';
};

/**
 * Get disabled state based on permission
 * @param {string} resource
 * @param {string} action
 * @returns {boolean}
 */
export const isDisabled = (resource, action) => {
  return !permissions.can(resource, action);
};

/**
 * Apply permission-based visibility to elements
 * Call this after DOM is loaded
 */
export const applyPermissionVisibility = () => {
  // Find elements with data-permission attribute
  // Format: data-permission="resource:action"
  const elements = document.querySelectorAll('[data-permission]');

  elements.forEach(el => {
    const permission = el.dataset.permission;
    if (!permission) return;

    const [resource, action] = permission.split(':');
    if (!permissions.can(resource, action)) {
      el.classList.add('hidden');
      el.setAttribute('disabled', 'true');
    }
  });

  // Find elements with data-role attribute
  // Format: data-role="admin" or data-role="admin,editor"
  const roleElements = document.querySelectorAll('[data-role]');

  roleElements.forEach(el => {
    const allowedRoles = el.dataset.role.split(',').map(r => r.trim());
    if (!allowedRoles.includes(permissions.role)) {
      el.classList.add('hidden');
      el.setAttribute('disabled', 'true');
    }
  });
};

// ============================================
// EXPORTS
// ============================================

export { PermissionsService };
