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
    { key: 'Científico', label: 'Científico', defaultRate: 85 },
    { key: 'Creativo', label: 'Creativo', defaultRate: 75 },
    { key: 'PM', label: 'Project Manager', defaultRate: 65 },
    { key: 'Diseño', label: 'Diseño', defaultRate: 70 },
    { key: 'Desarrollo', label: 'Desarrollo', defaultRate: 80 },
    { key: 'Marketing', label: 'Marketing', defaultRate: 60 },
    { key: 'Default', label: 'Sin departamento', defaultRate: 50 }
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
 * Guarda una tarifa por departamento
 * @param {string} departmentKey
 * @param {number} hourlyRate
 * @param {string} currency
 */
export async function saveRate(departmentKey, hourlyRate, currency = DEFAULT_CURRENCY) {
    if (!departmentKey || hourlyRate < 0) {
        throw new Error('Datos de tarifa inválidos');
    }

    const rateRef = ref(database, `billing/rates/${departmentKey}`);
    await set(rateRef, {
        hourlyRate: Number(hourlyRate),
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
                hourlyRate: dept.defaultRate,
                currency: DEFAULT_CURRENCY,
                updatedAt: new Date().toISOString()
            };
        });

        updates['billing/settings'] = {
            defaultDepartmentKey: 'Default',
            defaultHourlyRate: 50,
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
 * Obtiene la tarifa horaria para un usuario
 * @param {string} uid
 * @param {Object} usersMap - { uid: userData }
 * @param {Object} rates - { departmentKey: { hourlyRate } }
 * @param {Object} settings - { defaultHourlyRate }
 * @returns {Object} - { hourlyRate, department, hasRate }
 */
export function getHourlyRateForUid(uid, usersMap, rates, settings) {
    if (!uid || !usersMap[uid]) {
        return {
            hourlyRate: settings?.defaultHourlyRate || 50,
            department: null,
            hasRate: false
        };
    }

    const user = usersMap[uid];
    const department = user.department || null;

    if (department && rates[department]) {
        return {
            hourlyRate: rates[department].hourlyRate || settings?.defaultHourlyRate || 50,
            department,
            hasRate: true
        };
    }

    // Usar tarifa por defecto
    return {
        hourlyRate: settings?.defaultHourlyRate || 50,
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
 * @param {Object} activity - { estimatedMinutes, spentMinutes, assigneeUid }
 * @param {Object} usersMap
 * @param {Object} rates
 * @param {Object} settings
 * @returns {Object}
 */
export function computeActivityCosts(activity, usersMap, rates, settings) {
    const estimatedMinutes = Number(activity.estimatedMinutes) || 0;
    const spentMinutes = Number(activity.spentMinutes) || 0;

    const { hourlyRate, department, hasRate } = getHourlyRateForUid(
        activity.assigneeUid,
        usersMap,
        rates,
        settings
    );

    const estimatedHours = minutesToHours(estimatedMinutes);
    const actualHours = minutesToHours(spentMinutes);

    const estimatedCost = estimatedHours * hourlyRate;
    const actualCost = actualHours * hourlyRate;

    return {
        estimatedMinutes,
        spentMinutes,
        estimatedHours,
        actualHours,
        estimatedCost,
        actualCost,
        hourlyRate,
        department,
        hasRate,
        difference: actualCost - estimatedCost
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
                estimatedCost: 0,
                actualCost: 0,
                count: 0
            };
        }
        byDepartment[key].estimatedMinutes += costs.estimatedMinutes;
        byDepartment[key].spentMinutes += costs.spentMinutes;
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
                totals.estimatedMinutes += costs.estimatedMinutes;
                totals.spentMinutes += costs.spentMinutes;
                totals.estimatedCost += costs.estimatedCost;
                totals.actualCost += costs.actualCost;
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
            totals.estimatedMinutes += costs.estimatedMinutes;
            totals.spentMinutes += costs.spentMinutes;
            totals.estimatedCost += costs.estimatedCost;
            totals.actualCost += costs.actualCost;
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
    const { clientId, dateFrom, dateTo, useActual = true, onlyCompleted = false } = options;

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
        currency: settings.currency || DEFAULT_CURRENCY,
        lines: lineItems.map(item => ({
            type: item.type,
            name: item.name,
            parentTaskName: item.parentTaskName,
            projectName: item.projectName,
            productName: item.productName,
            department: item.department || 'Sin departamento',
            hours: useActual ? item.actualHours : item.estimatedHours,
            minutes: useActual ? item.spentMinutes : item.estimatedMinutes,
            hourlyRate: item.hourlyRate,
            subtotal: useActual ? item.actualCost : item.estimatedCost,
            manageId: item.manageId
        })),
        totals: {
            hours: useActual
                ? minutesToHours(billingData.totals.spentMinutes)
                : minutesToHours(billingData.totals.estimatedMinutes),
            amount: useActual
                ? billingData.totals.actualCost
                : billingData.totals.estimatedCost
        },
        byDepartment: billingData.byDepartment.map(dept => ({
            department: dept.department,
            hours: useActual
                ? minutesToHours(dept.spentMinutes)
                : minutesToHours(dept.estimatedMinutes),
            amount: useActual ? dept.actualCost : dept.estimatedCost
        }))
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
 * @returns {string}
 */
export function generateBillingReportCSV(billingData, settings) {
    const lines = [];
    const sep = ';';
    const currency = settings?.currency || DEFAULT_CURRENCY;

    // Cabecera
    lines.push([
        'Tipo',
        'Cliente',
        'Proyecto',
        'Producto',
        'Tarea',
        'Departamento',
        'Estado',
        'Prioridad',
        'Horas Est.',
        'Horas Real',
        'Tarifa €/h',
        `Coste Est. ${currency}`,
        `Coste Real ${currency}`,
        `Diferencia ${currency}`
    ].join(sep));

    // Datos
    billingData.items
        .filter(item => item.type === 'task' || item.type === 'subtask')
        .forEach(item => {
            lines.push([
                escapeCSV(item.type === 'task' ? 'Tarea' : 'Subtarea'),
                escapeCSV(item.clientName),
                escapeCSV(item.projectName),
                escapeCSV(item.productName || ''),
                escapeCSV(item.parentTaskName ? `${item.parentTaskName} > ${item.name}` : item.name),
                escapeCSV(item.department || 'Sin departamento'),
                escapeCSV(item.status),
                escapeCSV(item.priority),
                item.estimatedHours.toFixed(2),
                item.actualHours.toFixed(2),
                item.hourlyRate.toFixed(2),
                item.estimatedCost.toFixed(2),
                item.actualCost.toFixed(2),
                item.difference.toFixed(2)
            ].join(sep));
        });

    return lines.join('\n');
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
    downloadCSV,
    saveInvoiceSnapshot,
    loadSavedInvoices
};
