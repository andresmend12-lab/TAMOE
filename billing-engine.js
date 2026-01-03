/**
 * Billing Engine
 * Motor de cálculo de facturación con tarifas por departamento
 *
 * Características:
 * - Tarifas por departamento (rate cards)
 * - Cálculo de coste estimado y real
 * - Agregación jerárquica (cliente → proyecto → producto → tarea)
 * - Exportación CSV
 * - Generación de facturas
 */

import { database } from './firebase.js';
import { ref, get, set, update, push, onValue } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// ============================================
// CONSTANTS
// ============================================

export const DEFAULT_CURRENCY = 'EUR';

export const DEFAULT_DEPARTMENTS = [
    { key: 'Científico', label: 'Científico', internalRate: 85, clientRate: 120 },
    { key: 'Creativo', label: 'Creativo', internalRate: 75, clientRate: 110 },
    { key: 'PM', label: 'Project Manager', internalRate: 65, clientRate: 95 },
    { key: 'Diseño', label: 'Diseño', internalRate: 70, clientRate: 100 },
    { key: 'Desarrollo', label: 'Desarrollo', internalRate: 80, clientRate: 115 },
    { key: 'Marketing', label: 'Marketing', internalRate: 60, clientRate: 90 },
    { key: 'Medical', label: 'Medical', internalRate: 90, clientRate: 130 },
    { key: 'Default', label: 'Sin departamento', internalRate: 50, clientRate: 75 }
];

// ============================================
// RATE MANAGEMENT
// ============================================

/**
 * Carga las tarifas desde RTDB
 * @returns {Promise<Object>} - { rates: {}, settings: {} }
 */
export async function loadBillingConfig() {
    try {
        const [ratesSnap, settingsSnap] = await Promise.all([
            get(ref(database, 'billing/rates')),
            get(ref(database, 'billing/settings'))
        ]);

        const rates = ratesSnap.exists() ? ratesSnap.val() : {};
        const settings = settingsSnap.exists() ? settingsSnap.val() : {
            defaultDepartmentKey: 'Default',
            defaultHourlyRate: 50,
            currency: DEFAULT_CURRENCY
        };

        return { rates, settings };
    } catch (error) {
        console.error('[BILLING] Error loading config:', error);
        return {
            rates: {},
            settings: {
                defaultDepartmentKey: 'Default',
                defaultHourlyRate: 50,
                currency: DEFAULT_CURRENCY
            }
        };
    }
}

/**
 * Guarda una tarifa por departamento con coste interno y precio cliente
 * @param {string} departmentKey
 * @param {number} internalRate - Coste interno €/hora
 * @param {number} clientRate - Precio cliente €/hora
 * @param {string} currency
 */
export async function saveRate(departmentKey, internalRate, clientRate = null, currency = DEFAULT_CURRENCY) {
    if (!departmentKey || internalRate < 0) {
        throw new Error('Datos de tarifa inválidos');
    }

    // Si solo se pasa un valor (retrocompatibilidad), usarlo para ambos
    const internalRateNum = Number(internalRate) || 0;
    const clientRateNum = clientRate !== null ? Number(clientRate) || 0 : internalRateNum * 1.5;

    const rateRef = ref(database, `billing/rates/${departmentKey}`);
    await set(rateRef, {
        internalRateEurPerHour: internalRateNum,
        clientRateEurPerHour: clientRateNum,
        // Mantener hourlyRate para retrocompatibilidad
        hourlyRate: internalRateNum,
        currency,
        updatedAt: new Date().toISOString()
    });
}

/**
 * Elimina una tarifa por departamento
 * @param {string} departmentKey
 */
export async function deleteRate(departmentKey) {
    const rateRef = ref(database, `billing/rates/${departmentKey}`);
    await set(rateRef, null);
}

/**
 * Guarda la configuración general de facturación
 * @param {Object} settings
 */
export async function saveBillingSettings(settings) {
    const settingsRef = ref(database, 'billing/settings');
    await update(settingsRef, {
        ...settings,
        updatedAt: new Date().toISOString()
    });
}

/**
 * Inicializa tarifas por defecto si no existen
 */
export async function initializeDefaultRates() {
    const { rates } = await loadBillingConfig();

    if (Object.keys(rates).length === 0) {
        const updates = {};
        DEFAULT_DEPARTMENTS.forEach(dept => {
            updates[`billing/rates/${dept.key}`] = {
                internalRateEurPerHour: dept.internalRate,
                clientRateEurPerHour: dept.clientRate,
                hourlyRate: dept.internalRate, // Retrocompatibilidad
                currency: DEFAULT_CURRENCY,
                updatedAt: new Date().toISOString()
            };
        });

        updates['billing/settings'] = {
            defaultDepartmentKey: 'Default',
            defaultInternalRate: 50,
            defaultClientRate: 75,
            defaultHourlyRate: 50, // Retrocompatibilidad
            currency: DEFAULT_CURRENCY,
            updatedAt: new Date().toISOString()
        };

        await update(ref(database), updates);
        console.log('[BILLING] Default rates initialized');
    }
}

// ============================================
// COST CALCULATION
// ============================================

/**
 * Obtiene las tarifas horarias para un usuario
 * @param {string} uid
 * @param {Object} usersMap - { uid: userData }
 * @param {Object} rates - { departmentKey: { internalRateEurPerHour, clientRateEurPerHour } }
 * @param {Object} settings - { defaultInternalRate, defaultClientRate }
 * @returns {Object} - { internalRate, clientRate, hourlyRate, department, hasRate }
 */
export function getHourlyRateForUid(uid, usersMap, rates, settings) {
    const defaultInternalRate = settings?.defaultInternalRate || settings?.defaultHourlyRate || 50;
    const defaultClientRate = settings?.defaultClientRate || defaultInternalRate * 1.5;

    if (!uid || !usersMap[uid]) {
        return {
            internalRate: defaultInternalRate,
            clientRate: defaultClientRate,
            hourlyRate: defaultInternalRate, // Retrocompatibilidad
            department: null,
            hasRate: false
        };
    }

    const user = usersMap[uid];
    const department = user.department || null;

    if (department && rates[department]) {
        const rate = rates[department];
        const internalRate = rate.internalRateEurPerHour || rate.hourlyRate || defaultInternalRate;
        const clientRate = rate.clientRateEurPerHour || internalRate * 1.5;
        return {
            internalRate,
            clientRate,
            hourlyRate: internalRate, // Retrocompatibilidad
            department,
            hasRate: true
        };
    }

    // Usar tarifa por defecto
    return {
        internalRate: defaultInternalRate,
        clientRate: defaultClientRate,
        hourlyRate: defaultInternalRate, // Retrocompatibilidad
        department: department || null,
        hasRate: false
    };
}

/**
 * Convierte minutos a horas
 * @param {number} minutes
 * @returns {number}
 */
export function minutesToHours(minutes) {
    return (Number(minutes) || 0) / 60;
}

/**
 * Formatea horas para mostrar (ej: "2h 30m" o "2.5h")
 * @param {number} minutes
 * @param {string} format - 'hm' o 'decimal'
 * @returns {string}
 */
export function formatDuration(minutes, format = 'hm') {
    const mins = Number(minutes) || 0;
    if (mins === 0) return '-';

    if (format === 'decimal') {
        return `${(mins / 60).toFixed(1)}h`;
    }

    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

/**
 * Formatea un monto en euros
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'EUR') {
    const value = Number(amount) || 0;
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Calcula los costes de una actividad (tarea/subtarea)
 * Incluye tanto coste interno como precio cliente
 * @param {Object} activity - { estimatedMinutes, spentMinutes, assigneeUid }
 * @param {Object} usersMap
 * @param {Object} rates
 * @param {Object} settings
 * @returns {Object}
 */
export function computeActivityCosts(activity, usersMap, rates, settings) {
    const estimatedMinutes = Number(activity.estimatedMinutes) || 0;
    const spentMinutes = Number(activity.spentMinutes) || 0;

    const { internalRate, clientRate, hourlyRate, department, hasRate } = getHourlyRateForUid(
        activity.assigneeUid,
        usersMap,
        rates,
        settings
    );

    const estimatedHours = minutesToHours(estimatedMinutes);
    const actualHours = minutesToHours(spentMinutes);

    // Costes internos
    const estimatedInternalCost = estimatedHours * internalRate;
    const actualInternalCost = actualHours * internalRate;

    // Precios cliente
    const estimatedClientCost = estimatedHours * clientRate;
    const actualClientCost = actualHours * clientRate;

    // Retrocompatibilidad
    const estimatedCost = estimatedInternalCost;
    const actualCost = actualInternalCost;

    return {
        estimatedMinutes,
        spentMinutes,
        estimatedHours,
        actualHours,
        // Costes internos
        estimatedInternalCost,
        actualInternalCost,
        internalRate,
        // Precios cliente
        estimatedClientCost,
        actualClientCost,
        clientRate,
        // Retrocompatibilidad
        estimatedCost,
        actualCost,
        hourlyRate,
        // Metadatos
        department,
        hasRate,
        difference: actualInternalCost - estimatedInternalCost,
        margin: actualClientCost - actualInternalCost
    };
}

/**
 * Verifica si una tarea tiene subtareas
 * @param {Object} task
 * @returns {boolean}
 */
function hasSubtasks(task) {
    return task.subtasks && Object.keys(task.subtasks).length > 0;
}

/**
 * Calcula costes agregados de un árbol de actividades
 * @param {Array} clients - Array de clientes con proyectos/productos/tareas
 * @param {Object} usersMap
 * @param {Object} rates
 * @param {Object} settings
 * @param {Object} filters - { clientId, projectId, productId, status, priority, assigneeUid, dateFrom, dateTo }
 * @returns {Object} - { items: [], totals: {}, byDepartment: {}, warnings: [] }
 */
export function aggregateBillingData(clients, usersMap, rates, settings, filters = {}) {
    const items = [];
    const byDepartment = {};
    const warnings = [];
    let totals = {
        estimatedMinutes: 0,
        spentMinutes: 0,
        // Costes internos
        estimatedInternalCost: 0,
        actualInternalCost: 0,
        // Precios cliente
        estimatedClientCost: 0,
        actualClientCost: 0,
        // Retrocompatibilidad
        estimatedCost: 0,
        actualCost: 0,
        taskCount: 0,
        subtaskCount: 0
    };

    const normalizeText = (v, fallback = '') => String(v || '').trim() || fallback;

    // Función auxiliar para agregar a departamento
    const addToDepartment = (dept, costs) => {
        const key = dept || 'Sin departamento';
        if (!byDepartment[key]) {
            byDepartment[key] = {
                department: key,
                estimatedMinutes: 0,
                spentMinutes: 0,
                estimatedInternalCost: 0,
                actualInternalCost: 0,
                estimatedClientCost: 0,
                actualClientCost: 0,
                estimatedCost: 0,
                actualCost: 0,
                count: 0
            };
        }
        byDepartment[key].estimatedMinutes += costs.estimatedMinutes;
        byDepartment[key].spentMinutes += costs.spentMinutes;
        byDepartment[key].estimatedInternalCost += costs.estimatedInternalCost || costs.estimatedCost || 0;
        byDepartment[key].actualInternalCost += costs.actualInternalCost || costs.actualCost || 0;
        byDepartment[key].estimatedClientCost += costs.estimatedClientCost || 0;
        byDepartment[key].actualClientCost += costs.actualClientCost || 0;
        byDepartment[key].estimatedCost += costs.estimatedCost;
        byDepartment[key].actualCost += costs.actualCost;
        byDepartment[key].count++;
    };

    // Función para verificar si pasa los filtros
    const passesFilters = (item, itemType) => {
        if (filters.clientId && item.clientId !== filters.clientId) return false;
        if (filters.projectId && item.projectId !== filters.projectId) return false;
        if (filters.productId && item.productId !== filters.productId) return false;
        if (filters.status && item.status !== filters.status) return false;
        if (filters.priority && item.priority !== filters.priority) return false;
        if (filters.assigneeUid && item.assigneeUid !== filters.assigneeUid) return false;

        // Filtros de fecha
        if (filters.dateFrom || filters.dateTo) {
            const itemDate = item.date ? new Date(item.date) : null;
            if (!itemDate) return false;
            if (filters.dateFrom && itemDate < new Date(filters.dateFrom)) return false;
            if (filters.dateTo && itemDate > new Date(filters.dateTo)) return false;
        }

        return true;
    };

    clients.forEach(client => {
        if (!client) return;
        const clientId = client.id;
        const clientName = normalizeText(client.name, 'Cliente');

        let clientTotals = {
            estimatedMinutes: 0,
            spentMinutes: 0,
            estimatedCost: 0,
            actualCost: 0
        };

        const projects = client.projects || {};
        Object.entries(projects).forEach(([projectId, project]) => {
            if (!project) return;
            const projectName = normalizeText(project.name, 'Proyecto');

            let projectTotals = {
                estimatedMinutes: 0,
                spentMinutes: 0,
                estimatedCost: 0,
                actualCost: 0
            };

            // Procesar tareas directas del proyecto
            const projectTasks = project.tasks || {};
            Object.entries(projectTasks).forEach(([taskId, task]) => {
                if (!task) return;
                processTask(task, taskId, clientId, clientName, projectId, projectName, null, null, projectTotals);
            });

            // Procesar productos
            const products = project.products || {};
            Object.entries(products).forEach(([productId, product]) => {
                if (!product) return;
                const productName = normalizeText(product.name, 'Producto');

                let productTotals = {
                    estimatedMinutes: 0,
                    spentMinutes: 0,
                    estimatedCost: 0,
                    actualCost: 0
                };

                const productTasks = product.tasks || {};
                Object.entries(productTasks).forEach(([taskId, task]) => {
                    if (!task) return;
                    processTask(task, taskId, clientId, clientName, projectId, projectName, productId, productName, productTotals);
                });

                // Agregar producto al listado si tiene costes
                if (productTotals.estimatedCost > 0 || productTotals.actualCost > 0) {
                    items.push({
                        type: 'product',
                        id: productId,
                        name: productName,
                        clientId,
                        clientName,
                        projectId,
                        projectName,
                        productId,
                        productName,
                        ...productTotals,
                        level: 2
                    });
                }

                // Sumar al proyecto
                projectTotals.estimatedMinutes += productTotals.estimatedMinutes;
                projectTotals.spentMinutes += productTotals.spentMinutes;
                projectTotals.estimatedCost += productTotals.estimatedCost;
                projectTotals.actualCost += productTotals.actualCost;
            });

            // Agregar proyecto al listado
            if (projectTotals.estimatedCost > 0 || projectTotals.actualCost > 0) {
                items.push({
                    type: 'project',
                    id: projectId,
                    name: projectName,
                    clientId,
                    clientName,
                    projectId,
                    projectName,
                    ...projectTotals,
                    level: 1
                });
            }

            // Sumar al cliente
            clientTotals.estimatedMinutes += projectTotals.estimatedMinutes;
            clientTotals.spentMinutes += projectTotals.spentMinutes;
            clientTotals.estimatedCost += projectTotals.estimatedCost;
            clientTotals.actualCost += projectTotals.actualCost;
        });

        // Agregar cliente al listado
        if (clientTotals.estimatedCost > 0 || clientTotals.actualCost > 0) {
            items.push({
                type: 'client',
                id: clientId,
                name: clientName,
                clientId,
                clientName,
                ...clientTotals,
                level: 0
            });
        }
    });

    // Función interna para procesar tareas
    function processTask(task, taskId, clientId, clientName, projectId, projectName, productId, productName, parentTotals) {
        const taskName = normalizeText(task.name, 'Tarea');
        const taskHasSubtasks = hasSubtasks(task);

        // Si la tarea tiene subtareas, solo sumamos las subtareas
        if (taskHasSubtasks) {
            Object.entries(task.subtasks).forEach(([subtaskId, subtask]) => {
                if (!subtask) return;

                const subtaskData = {
                    ...subtask,
                    clientId,
                    projectId,
                    productId,
                    status: subtask.status || 'Pendiente',
                    priority: subtask.priority || task.priority || 'none',
                    date: subtask.date || task.date
                };

                if (!passesFilters(subtaskData, 'subtask')) return;

                const costs = computeActivityCosts(subtask, usersMap, rates, settings);

                // Añadir a totales
                parentTotals.estimatedMinutes += costs.estimatedMinutes;
                parentTotals.spentMinutes += costs.spentMinutes;
                parentTotals.estimatedCost += costs.estimatedCost;
                parentTotals.actualCost += costs.actualCost;
                parentTotals.estimatedInternalCost = (parentTotals.estimatedInternalCost || 0) + (costs.estimatedInternalCost || 0);
                parentTotals.actualInternalCost = (parentTotals.actualInternalCost || 0) + (costs.actualInternalCost || 0);
                parentTotals.estimatedClientCost = (parentTotals.estimatedClientCost || 0) + (costs.estimatedClientCost || 0);
                parentTotals.actualClientCost = (parentTotals.actualClientCost || 0) + (costs.actualClientCost || 0);

                totals.estimatedMinutes += costs.estimatedMinutes;
                totals.spentMinutes += costs.spentMinutes;
                totals.estimatedCost += costs.estimatedCost;
                totals.actualCost += costs.actualCost;
                totals.estimatedInternalCost += costs.estimatedInternalCost || 0;
                totals.actualInternalCost += costs.actualInternalCost || 0;
                totals.estimatedClientCost += costs.estimatedClientCost || 0;
                totals.actualClientCost += costs.actualClientCost || 0;
                totals.subtaskCount++;

                addToDepartment(costs.department, costs);

                // Advertencias
                if (!costs.hasRate) {
                    warnings.push({
                        type: 'no_rate',
                        entityType: 'subtask',
                        entityName: normalizeText(subtask.name, 'Subtarea'),
                        taskName,
                        department: costs.department,
                        path: productId
                            ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}/subtasks/${subtaskId}`
                            : `clients/${clientId}/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`
                    });
                }
                if (!subtask.assigneeUid) {
                    warnings.push({
                        type: 'no_assignee',
                        entityType: 'subtask',
                        entityName: normalizeText(subtask.name, 'Subtarea'),
                        taskName
                    });
                }

                // Añadir subtarea al listado de items
                items.push({
                    type: 'subtask',
                    id: subtaskId,
                    name: normalizeText(subtask.name, 'Subtarea'),
                    parentTaskName: taskName,
                    clientId,
                    clientName,
                    projectId,
                    projectName,
                    productId,
                    productName,
                    status: subtask.status || 'Pendiente',
                    priority: subtask.priority || task.priority || 'none',
                    assigneeUid: subtask.assigneeUid || task.assigneeUid,
                    date: subtask.date || task.date,
                    manageId: subtask.manageId,
                    ...costs,
                    level: productId ? 4 : 3
                });
            });
        } else {
            // Tarea sin subtareas - sumar directamente
            const taskData = {
                ...task,
                clientId,
                projectId,
                productId,
                status: task.status || 'Pendiente',
                priority: task.priority || 'none'
            };

            if (!passesFilters(taskData, 'task')) return;

            const costs = computeActivityCosts(task, usersMap, rates, settings);

            parentTotals.estimatedMinutes += costs.estimatedMinutes;
            parentTotals.spentMinutes += costs.spentMinutes;
            parentTotals.estimatedCost += costs.estimatedCost;
            parentTotals.actualCost += costs.actualCost;
            parentTotals.estimatedInternalCost = (parentTotals.estimatedInternalCost || 0) + (costs.estimatedInternalCost || 0);
            parentTotals.actualInternalCost = (parentTotals.actualInternalCost || 0) + (costs.actualInternalCost || 0);
            parentTotals.estimatedClientCost = (parentTotals.estimatedClientCost || 0) + (costs.estimatedClientCost || 0);
            parentTotals.actualClientCost = (parentTotals.actualClientCost || 0) + (costs.actualClientCost || 0);

            totals.estimatedMinutes += costs.estimatedMinutes;
            totals.spentMinutes += costs.spentMinutes;
            totals.estimatedCost += costs.estimatedCost;
            totals.actualCost += costs.actualCost;
            totals.estimatedInternalCost += costs.estimatedInternalCost || 0;
            totals.actualInternalCost += costs.actualInternalCost || 0;
            totals.estimatedClientCost += costs.estimatedClientCost || 0;
            totals.actualClientCost += costs.actualClientCost || 0;
            totals.taskCount++;

            addToDepartment(costs.department, costs);

            // Advertencias
            if (!costs.hasRate) {
                warnings.push({
                    type: 'no_rate',
                    entityType: 'task',
                    entityName: taskName,
                    department: costs.department,
                    path: productId
                        ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}`
                        : `clients/${clientId}/projects/${projectId}/tasks/${taskId}`
                });
            }
            if (!task.assigneeUid) {
                warnings.push({
                    type: 'no_assignee',
                    entityType: 'task',
                    entityName: taskName
                });
            }

            items.push({
                type: 'task',
                id: taskId,
                name: taskName,
                clientId,
                clientName,
                projectId,
                projectName,
                productId,
                productName,
                status: task.status || 'Pendiente',
                priority: task.priority || 'none',
                assigneeUid: task.assigneeUid,
                date: task.date,
                manageId: task.manageId,
                ...costs,
                level: productId ? 3 : 2
            });
        }
    }

    return {
        items,
        totals,
        byDepartment: Object.values(byDepartment),
        warnings
    };
}

// ============================================
// INVOICE GENERATION
// ============================================

/**
 * Genera datos de factura
 * @param {Object} options - { clientId, dateFrom, dateTo, useActual, onlyCompleted }
 * @param {Array} clients
 * @param {Object} usersMap
 * @param {Object} rates
 * @param {Object} settings
 * @returns {Object}
 */
export function generateInvoiceData(options, clients, usersMap, rates, settings) {
    const { clientId, dateFrom, dateTo, useActual = true, onlyCompleted = false, useClientRate = true } = options;

    // Filtrar cliente
    const targetClients = clientId
        ? clients.filter(c => c.id === clientId)
        : clients;

    const filters = {
        clientId,
        dateFrom,
        dateTo,
        status: onlyCompleted ? 'Finalizado' : null
    };

    const billingData = aggregateBillingData(targetClients, usersMap, rates, settings, filters);

    // Filtrar solo tareas/subtareas para líneas de factura
    const lineItems = billingData.items.filter(item =>
        item.type === 'task' || item.type === 'subtask'
    );

    const client = clients.find(c => c.id === clientId);

    // Determinar qué tarifa usar: cliente o interna
    const getRateForLine = (item) => useClientRate ? (item.clientRate || item.hourlyRate) : (item.internalRate || item.hourlyRate);
    const getCostForLine = (item) => {
        if (useActual) {
            return useClientRate ? (item.actualClientCost || item.actualCost) : (item.actualInternalCost || item.actualCost);
        }
        return useClientRate ? (item.estimatedClientCost || item.estimatedCost) : (item.estimatedInternalCost || item.estimatedCost);
    };

    return {
        invoiceDate: new Date().toISOString(),
        client: {
            id: clientId,
            name: client?.name || 'Todos los clientes'
        },
        period: {
            from: dateFrom,
            to: dateTo
        },
        useActual,
        onlyCompleted,
        useClientRate,
        currency: settings.currency || DEFAULT_CURRENCY,
        lines: lineItems.map(item => ({
            type: item.type,
            id: item.id,
            name: item.name,
            parentTaskName: item.parentTaskName,
            projectName: item.projectName,
            productName: item.productName,
            department: item.department || 'Sin departamento',
            hours: useActual ? item.actualHours : item.estimatedHours,
            minutes: useActual ? item.spentMinutes : item.estimatedMinutes,
            internalRate: item.internalRate || item.hourlyRate,
            clientRate: item.clientRate || item.hourlyRate,
            hourlyRate: getRateForLine(item),
            internalCost: useActual ? (item.actualInternalCost || item.actualCost) : (item.estimatedInternalCost || item.estimatedCost),
            clientCost: useActual ? (item.actualClientCost || item.actualCost) : (item.estimatedClientCost || item.estimatedCost),
            subtotal: getCostForLine(item),
            manageId: item.manageId,
            selected: true // Para selección de líneas
        })),
        totals: {
            estimatedMinutes: billingData.totals.estimatedMinutes,
            spentMinutes: billingData.totals.spentMinutes,
            hours: useActual
                ? minutesToHours(billingData.totals.spentMinutes)
                : minutesToHours(billingData.totals.estimatedMinutes),
            estimatedInternalCost: billingData.totals.estimatedInternalCost,
            actualInternalCost: billingData.totals.actualInternalCost,
            estimatedClientCost: billingData.totals.estimatedClientCost,
            actualClientCost: billingData.totals.actualClientCost,
            amount: useClientRate
                ? (useActual ? billingData.totals.actualClientCost : billingData.totals.estimatedClientCost)
                : (useActual ? billingData.totals.actualInternalCost : billingData.totals.estimatedInternalCost),
            // Retrocompatibilidad
            estimatedCost: billingData.totals.estimatedCost,
            actualCost: billingData.totals.actualCost
        },
        byDepartment: billingData.byDepartment.map(dept => ({
            department: dept.department,
            hours: useActual
                ? minutesToHours(dept.spentMinutes)
                : minutesToHours(dept.estimatedMinutes),
            internalCost: useActual ? dept.actualInternalCost : dept.estimatedInternalCost,
            clientCost: useActual ? dept.actualClientCost : dept.estimatedClientCost,
            amount: useClientRate
                ? (useActual ? dept.actualClientCost : dept.estimatedClientCost)
                : (useActual ? dept.actualInternalCost : dept.estimatedInternalCost),
            // Retrocompatibilidad
            estimatedCost: dept.estimatedCost,
            actualCost: dept.actualCost
        })),
        rawTotals: billingData.totals,
        rawByDepartment: billingData.byDepartment
    };
}

// ============================================
// CSV EXPORT
// ============================================

/**
 * Escapa un valor para CSV
 * @param {*} value
 * @returns {string}
 */
function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(';') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Genera CSV de factura
 * @param {Object} invoiceData
 * @returns {string}
 */
export function generateInvoiceCSV(invoiceData) {
    const lines = [];
    const sep = ';';

    // Encabezado
    lines.push([
        'FACTURA',
        '',
        '',
        '',
        '',
        '',
        ''
    ].join(sep));

    lines.push([
        'Cliente',
        escapeCSV(invoiceData.client.name),
        '',
        'Fecha emisión',
        new Date(invoiceData.invoiceDate).toLocaleDateString('es-ES'),
        '',
        ''
    ].join(sep));

    lines.push([
        'Periodo',
        invoiceData.period.from || 'Sin límite',
        '-',
        invoiceData.period.to || 'Sin límite',
        '',
        'Moneda',
        invoiceData.currency
    ].join(sep));

    lines.push([
        'Tipo',
        invoiceData.useActual ? 'Tiempo real' : 'Tiempo estimado',
        '',
        invoiceData.onlyCompleted ? 'Solo finalizadas' : 'Todas las tareas',
        '',
        '',
        ''
    ].join(sep));

    lines.push(''); // Línea vacía

    // Cabeceras de líneas
    lines.push([
        'Tipo',
        'Proyecto',
        'Producto',
        'Tarea/Subtarea',
        'Departamento',
        'Horas',
        'Tarifa €/h',
        'Subtotal €'
    ].join(sep));

    // Líneas de detalle
    invoiceData.lines.forEach(line => {
        lines.push([
            escapeCSV(line.type === 'task' ? 'Tarea' : 'Subtarea'),
            escapeCSV(line.projectName || ''),
            escapeCSV(line.productName || ''),
            escapeCSV(line.parentTaskName ? `${line.parentTaskName} > ${line.name}` : line.name),
            escapeCSV(line.department),
            line.hours.toFixed(2),
            line.hourlyRate.toFixed(2),
            line.subtotal.toFixed(2)
        ].join(sep));
    });

    lines.push(''); // Línea vacía

    // Totales por departamento
    lines.push(['DESGLOSE POR DEPARTAMENTO', '', '', '', '', '', '', ''].join(sep));
    lines.push(['Departamento', '', '', '', '', 'Horas', '', 'Total €'].join(sep));
    invoiceData.byDepartment.forEach(dept => {
        lines.push([
            escapeCSV(dept.department),
            '',
            '',
            '',
            '',
            dept.hours.toFixed(2),
            '',
            dept.amount.toFixed(2)
        ].join(sep));
    });

    lines.push(''); // Línea vacía

    // Total general
    lines.push([
        'TOTAL',
        '',
        '',
        '',
        '',
        invoiceData.totals.hours.toFixed(2),
        '',
        invoiceData.totals.amount.toFixed(2)
    ].join(sep));

    return lines.join('\n');
}

/**
 * Genera CSV del desglose de facturación
 * @param {Object} billingData - resultado de aggregateBillingData
 * @param {Object} settings
 * @param {Object} options - { includeHierarchy: boolean }
 * @returns {string}
 */
export function generateBillingReportCSV(billingData, settings, options = {}) {
    const lines = [];
    const sep = ';';
    const currency = settings?.currency || DEFAULT_CURRENCY;
    const includeHierarchy = options.includeHierarchy || false;

    // Cabecera
    lines.push([
        'Tipo',
        'Cliente',
        'Proyecto',
        'Producto',
        'Tarea',
        'Asignado',
        'Departamento',
        'Estado',
        'Prioridad',
        'Fecha',
        'Minutos Est.',
        'Minutos Real',
        'Tarifa Interna €/h',
        'Tarifa Cliente €/h',
        `Coste Interno Est. ${currency}`,
        `Coste Interno Real ${currency}`,
        `Precio Cliente Est. ${currency}`,
        `Precio Cliente Real ${currency}`,
        `Diferencia ${currency}`
    ].join(sep));

    // Filtrar datos
    const itemsToExport = includeHierarchy
        ? billingData.items
        : billingData.items.filter(item => item.type === 'task' || item.type === 'subtask');

    // Datos
    itemsToExport.forEach(item => {
        lines.push([
            escapeCSV(item.type === 'task' ? 'Tarea' : (item.type === 'subtask' ? 'Subtarea' : item.type)),
            escapeCSV(item.clientName || ''),
            escapeCSV(item.projectName || ''),
            escapeCSV(item.productName || ''),
            escapeCSV(item.parentTaskName ? `${item.parentTaskName} > ${item.name}` : item.name),
            escapeCSV(item.assigneeUid || ''),
            escapeCSV(item.department || 'Sin departamento'),
            escapeCSV(item.status || ''),
            escapeCSV(item.priority || ''),
            escapeCSV(item.date || ''),
            (item.estimatedMinutes || 0).toString(),
            (item.spentMinutes || 0).toString(),
            (item.internalRate || item.hourlyRate || 0).toFixed(2),
            (item.clientRate || item.hourlyRate || 0).toFixed(2),
            (item.estimatedInternalCost || item.estimatedCost || 0).toFixed(2),
            (item.actualInternalCost || item.actualCost || 0).toFixed(2),
            (item.estimatedClientCost || 0).toFixed(2),
            (item.actualClientCost || 0).toFixed(2),
            (item.difference || 0).toFixed(2)
        ].join(sep));
    });

    return lines.join('\n');
}

/**
 * Genera JSON del desglose de facturación
 * @param {Object} billingData - resultado de aggregateBillingData
 * @param {Object} settings
 * @param {Object} options - { includeHierarchy: boolean }
 * @returns {string}
 */
export function generateBillingReportJSON(billingData, settings, options = {}) {
    const includeHierarchy = options.includeHierarchy || false;

    const itemsToExport = includeHierarchy
        ? billingData.items
        : billingData.items.filter(item => item.type === 'task' || item.type === 'subtask');

    const exportData = {
        exportDate: new Date().toISOString(),
        currency: settings?.currency || DEFAULT_CURRENCY,
        totals: billingData.totals,
        byDepartment: billingData.byDepartment,
        items: itemsToExport.map(item => ({
            type: item.type,
            id: item.id,
            name: item.name,
            clientId: item.clientId,
            clientName: item.clientName,
            projectId: item.projectId,
            projectName: item.projectName,
            productId: item.productId,
            productName: item.productName,
            parentTaskName: item.parentTaskName,
            assigneeUid: item.assigneeUid,
            department: item.department,
            status: item.status,
            priority: item.priority,
            date: item.date,
            estimatedMinutes: item.estimatedMinutes,
            spentMinutes: item.spentMinutes,
            internalRate: item.internalRate || item.hourlyRate,
            clientRate: item.clientRate || item.hourlyRate,
            estimatedInternalCost: item.estimatedInternalCost || item.estimatedCost,
            actualInternalCost: item.actualInternalCost || item.actualCost,
            estimatedClientCost: item.estimatedClientCost,
            actualClientCost: item.actualClientCost
        }))
    };

    return JSON.stringify(exportData, null, 2);
}

/**
 * Descarga un archivo JSON
 * @param {string} jsonContent
 * @param {string} filename
 */
export function downloadJSON(jsonContent, filename) {
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

/**
 * Descarga un archivo CSV
 * @param {string} csvContent
 * @param {string} filename
 */
export function downloadCSV(csvContent, filename) {
    const BOM = '\uFEFF'; // UTF-8 BOM para Excel
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

// ============================================
// INVOICE PERSISTENCE (OPTIONAL)
// ============================================

/**
 * Guarda un snapshot de factura generada
 * @param {Object} invoiceData
 * @returns {Promise<string>} - invoiceId
 */
export async function saveInvoiceSnapshot(invoiceData) {
    const invoicesRef = ref(database, 'billing/invoices');
    const newInvoiceRef = push(invoicesRef);

    await set(newInvoiceRef, {
        ...invoiceData,
        id: newInvoiceRef.key,
        savedAt: new Date().toISOString()
    });

    return newInvoiceRef.key;
}

/**
 * Carga facturas guardadas
 * @param {string} clientId - opcional, filtrar por cliente
 * @returns {Promise<Array>}
 */
export async function loadSavedInvoices(clientId = null) {
    const invoicesRef = ref(database, 'billing/invoices');
    const snapshot = await get(invoicesRef);

    if (!snapshot.exists()) return [];

    let invoices = Object.values(snapshot.val());

    if (clientId) {
        invoices = invoices.filter(inv => inv.client?.id === clientId);
    }

    return invoices.sort((a, b) =>
        new Date(b.savedAt || 0) - new Date(a.savedAt || 0)
    );
}

// ============================================
// EXPORTS
// ============================================

export default {
    DEFAULT_CURRENCY,
    DEFAULT_DEPARTMENTS,
    loadBillingConfig,
    saveRate,
    deleteRate,
    saveBillingSettings,
    initializeDefaultRates,
    getHourlyRateForUid,
    minutesToHours,
    formatDuration,
    formatCurrency,
    computeActivityCosts,
    aggregateBillingData,
    generateInvoiceData,
    generateInvoiceCSV,
    generateBillingReportCSV,
    generateBillingReportJSON,
    downloadCSV,
    downloadJSON,
    saveInvoiceSnapshot,
    loadSavedInvoices
};
