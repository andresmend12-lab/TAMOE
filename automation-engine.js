/**
 * Automation Engine v2
 * Motor de ejecución de automatizaciones con soporte para condiciones
 *
 * Características:
 * - Evaluación de condiciones (AND/OR)
 * - Sistema de idempotencia para evitar duplicados
 * - Compatibilidad con automatizaciones v1 (sin condiciones)
 * - Logging detallado
 */

import { database } from './firebase.js';
import { ref, get, set, push, update, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// ============================================
// CONSTANTS
// ============================================

export const TRIGGER_TYPES = {
    PROJECT_CREATED: 'onProjectCreated',
    PRODUCT_CREATED: 'onProductCreated',
    TASK_CREATED: 'onTaskCreated',
    TASK_STATUS_CHANGED: 'onTaskStatusChanged'
};

// Mapeo de triggers legacy (v1) a v2
const LEGACY_TRIGGER_MAP = {
    'created': {
        'Project': TRIGGER_TYPES.PROJECT_CREATED,
        'Product': TRIGGER_TYPES.PRODUCT_CREATED,
        'Task': TRIGGER_TYPES.TASK_CREATED
    }
};

export const CONDITION_OPERATORS = {
    EQUALS: 'equals',
    NOT_EQUALS: 'notEquals',
    CONTAINS: 'contains',
    STARTS_WITH: 'startsWith',
    ENDS_WITH: 'endsWith',
    IN: 'in',
    NOT_IN: 'notIn',
    IS_EMPTY: 'isEmpty',
    IS_NOT_EMPTY: 'isNotEmpty',
    GREATER_THAN: 'greaterThan',
    LESS_THAN: 'lessThan',
    EXISTS: 'exists'
};

export const LOGICAL_OPERATORS = {
    AND: 'AND',
    OR: 'OR'
};

// Campos disponibles por tipo de trigger
export const TRIGGER_CONTEXT_FIELDS = {
    [TRIGGER_TYPES.PROJECT_CREATED]: [
        { field: 'clientId', label: 'ID Cliente', type: 'string' },
        { field: 'clientName', label: 'Nombre Cliente', type: 'string' },
        { field: 'projectId', label: 'ID Proyecto', type: 'string' },
        { field: 'projectName', label: 'Nombre Proyecto', type: 'string' },
        { field: 'projectStatus', label: 'Estado Proyecto', type: 'enum', options: ['Pendiente', 'En proceso', 'Finalizado'] },
        { field: 'createdByUid', label: 'Creado por (UID)', type: 'string' }
    ],
    [TRIGGER_TYPES.PRODUCT_CREATED]: [
        { field: 'clientId', label: 'ID Cliente', type: 'string' },
        { field: 'clientName', label: 'Nombre Cliente', type: 'string' },
        { field: 'projectId', label: 'ID Proyecto', type: 'string' },
        { field: 'projectName', label: 'Nombre Proyecto', type: 'string' },
        { field: 'productId', label: 'ID Producto', type: 'string' },
        { field: 'productName', label: 'Nombre Producto', type: 'string' },
        { field: 'productStatus', label: 'Estado Producto', type: 'enum', options: ['Pendiente', 'En proceso', 'Finalizado'] },
        { field: 'createdByUid', label: 'Creado por (UID)', type: 'string' }
    ],
    [TRIGGER_TYPES.TASK_CREATED]: [
        { field: 'clientId', label: 'ID Cliente', type: 'string' },
        { field: 'clientName', label: 'Nombre Cliente', type: 'string' },
        { field: 'projectId', label: 'ID Proyecto', type: 'string' },
        { field: 'projectName', label: 'Nombre Proyecto', type: 'string' },
        { field: 'productId', label: 'ID Producto', type: 'string' },
        { field: 'productName', label: 'Nombre Producto', type: 'string' },
        { field: 'taskId', label: 'ID Tarea', type: 'string' },
        { field: 'taskName', label: 'Nombre Tarea', type: 'string' },
        { field: 'taskStatus', label: 'Estado Tarea', type: 'enum', options: ['Pendiente', 'En proceso', 'Finalizado'] },
        { field: 'priority', label: 'Prioridad', type: 'enum', options: ['none', 'low', 'medium', 'high'] },
        { field: 'assigneeUid', label: 'Asignado a (UID)', type: 'string' },
        { field: 'createdByUid', label: 'Creado por (UID)', type: 'string' }
    ],
    [TRIGGER_TYPES.TASK_STATUS_CHANGED]: [
        { field: 'clientId', label: 'ID Cliente', type: 'string' },
        { field: 'projectId', label: 'ID Proyecto', type: 'string' },
        { field: 'productId', label: 'ID Producto', type: 'string' },
        { field: 'taskId', label: 'ID Tarea', type: 'string' },
        { field: 'taskName', label: 'Nombre Tarea', type: 'string' },
        { field: 'oldStatus', label: 'Estado Anterior', type: 'enum', options: ['Pendiente', 'En proceso', 'Finalizado'] },
        { field: 'newStatus', label: 'Estado Nuevo', type: 'enum', options: ['Pendiente', 'En proceso', 'Finalizado'] },
        { field: 'priority', label: 'Prioridad', type: 'enum', options: ['none', 'low', 'medium', 'high'] },
        { field: 'assigneeUid', label: 'Asignado a (UID)', type: 'string' }
    ]
};

// Operadores disponibles por tipo de campo
export const OPERATORS_BY_FIELD_TYPE = {
    string: [
        CONDITION_OPERATORS.EQUALS,
        CONDITION_OPERATORS.NOT_EQUALS,
        CONDITION_OPERATORS.CONTAINS,
        CONDITION_OPERATORS.STARTS_WITH,
        CONDITION_OPERATORS.ENDS_WITH,
        CONDITION_OPERATORS.IS_EMPTY,
        CONDITION_OPERATORS.IS_NOT_EMPTY
    ],
    enum: [
        CONDITION_OPERATORS.EQUALS,
        CONDITION_OPERATORS.NOT_EQUALS,
        CONDITION_OPERATORS.IN,
        CONDITION_OPERATORS.NOT_IN
    ],
    number: [
        CONDITION_OPERATORS.EQUALS,
        CONDITION_OPERATORS.NOT_EQUALS,
        CONDITION_OPERATORS.GREATER_THAN,
        CONDITION_OPERATORS.LESS_THAN
    ],
    boolean: [
        CONDITION_OPERATORS.EQUALS
    ]
};

// Labels para operadores (UI)
export const OPERATOR_LABELS = {
    [CONDITION_OPERATORS.EQUALS]: 'es igual a',
    [CONDITION_OPERATORS.NOT_EQUALS]: 'no es igual a',
    [CONDITION_OPERATORS.CONTAINS]: 'contiene',
    [CONDITION_OPERATORS.STARTS_WITH]: 'empieza con',
    [CONDITION_OPERATORS.ENDS_WITH]: 'termina con',
    [CONDITION_OPERATORS.IN]: 'es uno de',
    [CONDITION_OPERATORS.NOT_IN]: 'no es uno de',
    [CONDITION_OPERATORS.IS_EMPTY]: 'está vacío',
    [CONDITION_OPERATORS.IS_NOT_EMPTY]: 'no está vacío',
    [CONDITION_OPERATORS.GREATER_THAN]: 'es mayor que',
    [CONDITION_OPERATORS.LESS_THAN]: 'es menor que',
    [CONDITION_OPERATORS.EXISTS]: 'existe'
};

// ============================================
// CONDITION EVALUATION
// ============================================

/**
 * Evalúa una regla individual contra el contexto
 * @param {Object} rule - { field, op, value }
 * @param {Object} context - Datos del evento
 * @returns {boolean}
 */
export function evaluateRule(rule, context) {
    const { field, op, value } = rule;
    const contextValue = context[field];

    // Normalizar valores para comparación
    const normalize = (v) => {
        if (v === null || v === undefined) return '';
        return String(v).trim().toLowerCase();
    };

    const normalizedContext = normalize(contextValue);
    const normalizedValue = normalize(value);

    switch (op) {
        case CONDITION_OPERATORS.EQUALS:
            return normalizedContext === normalizedValue;

        case CONDITION_OPERATORS.NOT_EQUALS:
            return normalizedContext !== normalizedValue;

        case CONDITION_OPERATORS.CONTAINS:
            return normalizedContext.includes(normalizedValue);

        case CONDITION_OPERATORS.STARTS_WITH:
            return normalizedContext.startsWith(normalizedValue);

        case CONDITION_OPERATORS.ENDS_WITH:
            return normalizedContext.endsWith(normalizedValue);

        case CONDITION_OPERATORS.IN:
            if (!Array.isArray(value)) return false;
            return value.some(v => normalize(v) === normalizedContext);

        case CONDITION_OPERATORS.NOT_IN:
            if (!Array.isArray(value)) return true;
            return !value.some(v => normalize(v) === normalizedContext);

        case CONDITION_OPERATORS.IS_EMPTY:
            return contextValue === null || contextValue === undefined || contextValue === '';

        case CONDITION_OPERATORS.IS_NOT_EMPTY:
            return contextValue !== null && contextValue !== undefined && contextValue !== '';

        case CONDITION_OPERATORS.GREATER_THAN:
            return Number(contextValue) > Number(value);

        case CONDITION_OPERATORS.LESS_THAN:
            return Number(contextValue) < Number(value);

        case CONDITION_OPERATORS.EXISTS:
            return contextValue !== null && contextValue !== undefined;

        default:
            console.warn(`[AUTOMATION-ENGINE] Unknown operator: ${op}`);
            return false;
    }
}

/**
 * Evalúa un conjunto de condiciones
 * @param {Object|null} conditions - { operator: 'AND'|'OR', rules: [...] }
 * @param {Object} context - Datos del evento
 * @returns {boolean}
 */
export function evaluateConditions(conditions, context) {
    // Sin condiciones = siempre true (compatibilidad v1)
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
        return true;
    }

    const operator = conditions.operator || LOGICAL_OPERATORS.AND;
    const rules = conditions.rules;

    if (operator === LOGICAL_OPERATORS.AND) {
        return rules.every(rule => evaluateRule(rule, context));
    } else if (operator === LOGICAL_OPERATORS.OR) {
        return rules.some(rule => evaluateRule(rule, context));
    }

    // Default: AND
    return rules.every(rule => evaluateRule(rule, context));
}

// ============================================
// IDEMPOTENCY SYSTEM
// ============================================

/**
 * Genera una clave única para el evento (para idempotencia)
 * @param {string} triggerType
 * @param {Object} context
 * @returns {string}
 */
export function generateEventKey(triggerType, context) {
    switch (triggerType) {
        case TRIGGER_TYPES.PROJECT_CREATED:
            return `project_${context.projectId}`;
        case TRIGGER_TYPES.PRODUCT_CREATED:
            return `product_${context.productId}`;
        case TRIGGER_TYPES.TASK_CREATED:
            return `task_${context.taskId}`;
        case TRIGGER_TYPES.TASK_STATUS_CHANGED:
            return `task_status_${context.taskId}_${context.oldStatus}_${context.newStatus}`;
        default:
            // Fallback: usar timestamp + random
            return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Verifica si una automatización ya se ejecutó para un evento
 * @param {string} automationId
 * @param {string} eventKey
 * @returns {Promise<boolean>}
 */
export async function hasExecuted(automationId, eventKey) {
    try {
        const execRef = ref(database, `automationExecutions/${automationId}/${eventKey}`);
        const snapshot = await get(execRef);
        return snapshot.exists();
    } catch (error) {
        console.error('[AUTOMATION-ENGINE] Error checking execution:', error);
        return false; // En caso de error, permitir ejecución
    }
}

/**
 * Marca una automatización como ejecutada para un evento
 * @param {string} automationId
 * @param {string} eventKey
 * @param {Object} result - Resultado de la ejecución
 */
export async function markExecuted(automationId, eventKey, result = {}) {
    try {
        const execRef = ref(database, `automationExecutions/${automationId}/${eventKey}`);
        await set(execRef, {
            executedAt: new Date().toISOString(),
            timestamp: Date.now(),
            status: result.status || 'success',
            actionsExecuted: result.actionsExecuted || 0
        });
    } catch (error) {
        console.error('[AUTOMATION-ENGINE] Error marking execution:', error);
    }
}

// ============================================
// TRIGGER MATCHING
// ============================================

/**
 * Normaliza el trigger de una automatización (v1 → v2)
 * @param {Object} automation
 * @returns {string|null} - Trigger type normalizado
 */
export function normalizeTriggerType(automation) {
    // v2 format: trigger.type
    if (automation.trigger?.type) {
        return automation.trigger.type;
    }

    // v1 format: triggers array
    if (Array.isArray(automation.triggers) && automation.triggers.length > 0) {
        const t = automation.triggers[0];
        if (t.triggerType === 'created' && t.activityType) {
            return LEGACY_TRIGGER_MAP['created']?.[t.activityType] || null;
        }
        if (t.triggerType === 'statusChange' && t.activityType === 'Task') {
            return TRIGGER_TYPES.TASK_STATUS_CHANGED;
        }
    }

    return null;
}

/**
 * Verifica si una automatización coincide con el trigger
 * @param {Object} automation
 * @param {string} triggerType
 * @param {Object} context
 * @returns {boolean}
 */
export function matchesTrigger(automation, triggerType, context) {
    const automationTrigger = normalizeTriggerType(automation);

    if (automationTrigger !== triggerType) {
        return false;
    }

    // Para statusChange, verificar estados específicos (v1 compatibility)
    if (triggerType === TRIGGER_TYPES.TASK_STATUS_CHANGED && automation.triggers) {
        const t = automation.triggers[0];
        if (t.fromState && t.fromState !== context.oldStatus) return false;
        if (t.toState && t.toState !== context.newStatus) return false;
    }

    return true;
}

// ============================================
// SCOPE VALIDATION
// ============================================

/**
 * Verifica si el contexto está dentro del scope de la automatización
 * @param {Object} automation
 * @param {Object} context
 * @returns {boolean}
 */
export function isInScope(automation, context) {
    const scope = automation.scope;

    // Sin scope = global (aplica a todo)
    if (!scope) return true;

    // v2 scope format
    if (scope.type === 'global') return true;

    // v1 scope format
    if (scope.client) {
        if (scope.client === 'all') return true;
        if (scope.client !== context.clientId) return false;
    }

    if (scope.projects && Array.isArray(scope.projects) && scope.projects.length > 0) {
        if (!scope.projects.includes(context.projectId)) return false;
    }

    if (scope.products && Array.isArray(scope.products) && scope.products.length > 0) {
        const match = scope.products.some(p =>
            p.projectId === context.projectId && p.productId === context.productId
        );
        if (!match) return false;
    }

    return true;
}

// ============================================
// ACTION EXECUTION
// ============================================

/**
 * Ejecuta las acciones de una automatización
 * @param {Object} automation
 * @param {Object} context
 * @returns {Promise<Array>} - Resultados de cada acción
 */
export async function executeActions(automation, context) {
    const actions = automation.actions || [];
    const results = [];

    for (const action of actions) {
        try {
            const result = await executeAction(action, context, automation);
            results.push({ action: action.type, status: 'success', result });
        } catch (error) {
            console.error(`[AUTOMATION-ENGINE] Action failed:`, action.type, error);
            results.push({ action: action.type, status: 'error', error: error.message });
        }
    }

    return results;
}

/**
 * Ejecuta una acción individual
 * @param {Object} action
 * @param {Object} context
 * @param {Object} automation
 */
async function executeAction(action, context, automation) {
    const actionType = action.type;

    // Acciones de creación de entidades
    if (actionType.startsWith('createChild_')) {
        return await executeCreateChildAction(action, context, automation);
    }

    // Acción createTask (v2 format)
    if (actionType === 'createTask') {
        return await executeCreateTaskAction(action, context, automation);
    }

    // Acción notify
    if (actionType === 'notify') {
        return await executeNotifyAction(action, context, automation);
    }

    console.warn(`[AUTOMATION-ENGINE] Unknown action type: ${actionType}`);
    return { skipped: true, reason: 'Unknown action type' };
}

/**
 * Ejecuta acción createChild_* (v1 format)
 */
async function executeCreateChildAction(action, context, automation) {
    const childType = action.type.split('_')[1]?.toLowerCase();
    const childName = action.name || `Nuevo ${childType}`;

    let targetPath;
    const timestamp = new Date().toISOString();

    if (childType === 'tarea' || childType === 'task') {
        // Crear tarea en el producto/proyecto
        if (context.productId) {
            targetPath = `clients/${context.clientId}/projects/${context.projectId}/products/${context.productId}/tasks`;
        } else {
            targetPath = `clients/${context.clientId}/projects/${context.projectId}/tasks`;
        }

        const taskRef = push(ref(database, targetPath));
        const taskData = {
            name: childName,
            status: action.payload?.status || 'Pendiente',
            priority: action.payload?.priority || 'none',
            createdAt: timestamp,
            updatedAt: timestamp,
            taskId: taskRef.key,
            createdByAutomation: true,
            automationId: automation.id,
            automationName: automation.name
        };

        if (action.payload?.assigneeUid) {
            taskData.assigneeUid = action.payload.assigneeUid;
        }
        if (action.payload?.estimatedMinutes) {
            taskData.estimatedMinutes = action.payload.estimatedMinutes;
        }

        await set(taskRef, taskData);
        console.log(`[AUTOMATION-ENGINE] Created task: ${childName} at ${targetPath}`);
        return { created: 'task', path: `${targetPath}/${taskRef.key}`, name: childName };
    }

    if (childType === 'subtarea' || childType === 'subtask') {
        if (!context.taskId) {
            throw new Error('Cannot create subtask without taskId in context');
        }

        if (context.productId) {
            targetPath = `clients/${context.clientId}/projects/${context.projectId}/products/${context.productId}/tasks/${context.taskId}/subtasks`;
        } else {
            targetPath = `clients/${context.clientId}/projects/${context.projectId}/tasks/${context.taskId}/subtasks`;
        }

        const subtaskRef = push(ref(database, targetPath));
        const subtaskData = {
            name: childName,
            status: action.payload?.status || 'Pendiente',
            createdAt: timestamp,
            updatedAt: timestamp,
            subtaskId: subtaskRef.key,
            createdByAutomation: true,
            automationId: automation.id
        };

        await set(subtaskRef, subtaskData);
        console.log(`[AUTOMATION-ENGINE] Created subtask: ${childName}`);
        return { created: 'subtask', path: `${targetPath}/${subtaskRef.key}`, name: childName };
    }

    if (childType === 'producto' || childType === 'product') {
        targetPath = `clients/${context.clientId}/projects/${context.projectId}/products`;

        const productRef = push(ref(database, targetPath));
        const productData = {
            name: childName,
            status: 'Pendiente',
            createdAt: timestamp,
            updatedAt: timestamp,
            productId: productRef.key,
            createdByAutomation: true,
            automationId: automation.id
        };

        await set(productRef, productData);
        console.log(`[AUTOMATION-ENGINE] Created product: ${childName}`);
        return { created: 'product', path: `${targetPath}/${productRef.key}`, name: childName };
    }

    throw new Error(`Unknown child type: ${childType}`);
}

/**
 * Ejecuta acción createTask (v2 format con payload)
 */
async function executeCreateTaskAction(action, context, automation) {
    const payload = action.payload || {};
    const taskName = payload.name || 'Nueva Tarea';
    const timestamp = new Date().toISOString();

    let targetPath;
    if (context.productId) {
        targetPath = `clients/${context.clientId}/projects/${context.projectId}/products/${context.productId}/tasks`;
    } else {
        targetPath = `clients/${context.clientId}/projects/${context.projectId}/tasks`;
    }

    const taskRef = push(ref(database, targetPath));
    const taskData = {
        name: taskName,
        status: payload.status || 'Pendiente',
        priority: payload.priority || 'none',
        createdAt: timestamp,
        updatedAt: timestamp,
        taskId: taskRef.key,
        createdByAutomation: true,
        automationId: automation.id,
        automationName: automation.name
    };

    // Campos opcionales
    if (payload.assigneeUid) taskData.assigneeUid = payload.assigneeUid;
    if (payload.estimatedMinutes) taskData.estimatedMinutes = payload.estimatedMinutes;
    if (payload.dateOffsetDays !== undefined) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (payload.dateOffsetDays || 0));
        taskData.date = dueDate.toISOString().split('T')[0];
    }

    await set(taskRef, taskData);
    console.log(`[AUTOMATION-ENGINE] Created task (v2): ${taskName}`);
    return { created: 'task', path: `${targetPath}/${taskRef.key}`, name: taskName };
}

/**
 * Ejecuta acción notify
 */
async function executeNotifyAction(action, context, automation) {
    const recipients = action.recipients || [];
    const message = action.message || `Automatización "${automation.name}" ejecutada`;

    const notificationData = {
        title: `Automatización: ${automation.name}`,
        message: message,
        timestamp: Date.now(),
        read: false,
        type: 'automation',
        automationId: automation.id,
        automationName: automation.name,
        entityType: context.entityType || 'Unknown',
        entityName: context.entityName || '',
        entityPath: context.entityPath || ''
    };

    let sent = 0;
    for (const uid of recipients) {
        if (!uid) continue;
        try {
            const notifRef = push(ref(database, `notifications/${uid}`));
            await set(notifRef, notificationData);
            sent++;
        } catch (error) {
            console.error(`[AUTOMATION-ENGINE] Failed to notify ${uid}:`, error);
        }
    }

    console.log(`[AUTOMATION-ENGINE] Sent ${sent} notifications`);
    return { notified: sent, total: recipients.length };
}

// ============================================
// MAIN EXECUTION FUNCTION
// ============================================

/**
 * Ejecuta todas las automatizaciones que coincidan con el trigger
 * @param {string} triggerType - Tipo de trigger (usar TRIGGER_TYPES)
 * @param {Object} context - Contexto del evento
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Resumen de ejecución
 */
export async function runAutomations(triggerType, context, options = {}) {
    console.log(`[AUTOMATION-ENGINE] Running automations for trigger: ${triggerType}`);
    console.log(`[AUTOMATION-ENGINE] Context:`, context);

    const { skipIdempotency = false } = options;
    const eventKey = generateEventKey(triggerType, context);
    const results = {
        trigger: triggerType,
        eventKey,
        automationsChecked: 0,
        automationsMatched: 0,
        automationsExecuted: 0,
        automationsSkipped: 0,
        details: []
    };

    try {
        // Cargar todas las automatizaciones
        const automationsRef = ref(database, 'automations');
        const snapshot = await get(automationsRef);

        if (!snapshot.exists()) {
            console.log('[AUTOMATION-ENGINE] No automations found');
            return results;
        }

        const allAutomations = snapshot.val();

        for (const [automationId, automation] of Object.entries(allAutomations)) {
            // Ignorar projectTemplate (es un caso especial)
            if (automationId === 'projectTemplate') continue;

            results.automationsChecked++;

            const autoWithId = { id: automationId, ...automation };

            // 1. Verificar si está habilitada
            if (!automation.enabled) {
                results.details.push({ id: automationId, name: automation.name, status: 'disabled' });
                continue;
            }

            // 2. Verificar trigger
            if (!matchesTrigger(autoWithId, triggerType, context)) {
                continue;
            }

            // 3. Verificar scope
            if (!isInScope(autoWithId, context)) {
                results.details.push({ id: automationId, name: automation.name, status: 'out_of_scope' });
                continue;
            }

            results.automationsMatched++;

            // 4. Evaluar condiciones (v2)
            if (!evaluateConditions(automation.conditions, context)) {
                results.details.push({ id: automationId, name: automation.name, status: 'conditions_not_met' });
                results.automationsSkipped++;
                continue;
            }

            // 5. Verificar idempotencia
            if (!skipIdempotency) {
                const alreadyExecuted = await hasExecuted(automationId, eventKey);
                if (alreadyExecuted) {
                    console.log(`[AUTOMATION-ENGINE] Skipping ${automation.name} - already executed for ${eventKey}`);
                    results.details.push({ id: automationId, name: automation.name, status: 'already_executed' });
                    results.automationsSkipped++;
                    continue;
                }
            }

            // 6. Ejecutar acciones
            console.log(`[AUTOMATION-ENGINE] Executing: ${automation.name}`);
            const actionResults = await executeActions(autoWithId, context);

            // 7. Marcar como ejecutada
            if (!skipIdempotency) {
                await markExecuted(automationId, eventKey, {
                    status: 'success',
                    actionsExecuted: actionResults.length
                });
            }

            // 8. Actualizar lastRun en la automatización
            await update(ref(database, `automations/${automationId}`), {
                lastRun: Date.now()
            });

            results.automationsExecuted++;
            results.details.push({
                id: automationId,
                name: automation.name,
                status: 'executed',
                actions: actionResults
            });

            // Log de ejecución
            await logExecution(automationId, {
                trigger: triggerType,
                eventKey,
                context,
                actionResults,
                status: actionResults.some(r => r.status === 'error') ? 'partial_success' : 'success'
            });
        }

    } catch (error) {
        console.error('[AUTOMATION-ENGINE] Error running automations:', error);
        results.error = error.message;
    }

    console.log(`[AUTOMATION-ENGINE] Summary: checked=${results.automationsChecked}, matched=${results.automationsMatched}, executed=${results.automationsExecuted}`);
    return results;
}

/**
 * Log de ejecución de automatización
 */
async function logExecution(automationId, data) {
    try {
        const logRef = push(ref(database, `automation_logs/${automationId}`));
        await set(logRef, {
            ...data,
            timestamp: Date.now(),
            logId: logRef.key
        });
    } catch (error) {
        console.error('[AUTOMATION-ENGINE] Error logging execution:', error);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Construye el contexto para un trigger de proyecto creado
 */
export function buildProjectCreatedContext(clientId, clientName, projectId, projectData, createdByUid = '') {
    return {
        clientId,
        clientName: clientName || '',
        projectId,
        projectName: projectData?.name || '',
        projectStatus: projectData?.status || 'Pendiente',
        createdByUid,
        createdAt: projectData?.createdAt || new Date().toISOString(),
        entityType: 'Project',
        entityName: projectData?.name || '',
        entityPath: `clients/${clientId}/projects/${projectId}`
    };
}

/**
 * Construye el contexto para un trigger de producto creado
 */
export function buildProductCreatedContext(clientId, clientName, projectId, projectName, productId, productData, createdByUid = '') {
    return {
        clientId,
        clientName: clientName || '',
        projectId,
        projectName: projectName || '',
        productId,
        productName: productData?.name || '',
        productStatus: productData?.status || 'Pendiente',
        createdByUid,
        createdAt: productData?.createdAt || new Date().toISOString(),
        entityType: 'Product',
        entityName: productData?.name || '',
        entityPath: `clients/${clientId}/projects/${projectId}/products/${productId}`
    };
}

/**
 * Construye el contexto para un trigger de tarea creada
 */
export function buildTaskCreatedContext(clientId, clientName, projectId, projectName, productId, productName, taskId, taskData, createdByUid = '') {
    return {
        clientId,
        clientName: clientName || '',
        projectId,
        projectName: projectName || '',
        productId: productId || null,
        productName: productName || '',
        taskId,
        taskName: taskData?.name || '',
        taskStatus: taskData?.status || 'Pendiente',
        priority: taskData?.priority || 'none',
        assigneeUid: taskData?.assigneeUid || '',
        createdByUid,
        createdAt: taskData?.createdAt || new Date().toISOString(),
        entityType: 'Task',
        entityName: taskData?.name || '',
        entityPath: productId
            ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}`
            : `clients/${clientId}/projects/${projectId}/tasks/${taskId}`
    };
}

/**
 * Valida una regla de condición
 */
export function validateConditionRule(rule) {
    const errors = [];

    if (!rule.field) {
        errors.push('Campo requerido');
    }

    if (!rule.op) {
        errors.push('Operador requerido');
    }

    // Operadores que no requieren valor
    const noValueOps = [CONDITION_OPERATORS.IS_EMPTY, CONDITION_OPERATORS.IS_NOT_EMPTY, CONDITION_OPERATORS.EXISTS];

    if (!noValueOps.includes(rule.op)) {
        if (rule.op === CONDITION_OPERATORS.IN || rule.op === CONDITION_OPERATORS.NOT_IN) {
            if (!Array.isArray(rule.value) || rule.value.length === 0) {
                errors.push('Lista de valores requerida');
            }
        } else if (rule.value === undefined || rule.value === null || rule.value === '') {
            errors.push('Valor requerido');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Valida todas las condiciones de una automatización
 */
export function validateConditions(conditions) {
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
        return { valid: true, errors: [] };
    }

    const errors = [];
    conditions.rules.forEach((rule, index) => {
        const result = validateConditionRule(rule);
        if (!result.valid) {
            errors.push(`Regla ${index + 1}: ${result.errors.join(', ')}`);
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

export default {
    TRIGGER_TYPES,
    CONDITION_OPERATORS,
    LOGICAL_OPERATORS,
    TRIGGER_CONTEXT_FIELDS,
    OPERATORS_BY_FIELD_TYPE,
    OPERATOR_LABELS,
    evaluateRule,
    evaluateConditions,
    runAutomations,
    hasExecuted,
    markExecuted,
    validateConditionRule,
    validateConditions,
    buildProjectCreatedContext,
    buildProductCreatedContext,
    buildTaskCreatedContext
};
