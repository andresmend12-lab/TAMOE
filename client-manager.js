import { auth, database } from './firebase.js';
import { ref, push, onValue, query, set, update, remove, runTransaction, serverTimestamp, get } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { createDurationInput } from './src/utils/duration.js';
import { recomputeRollup as recomputeRollupShared, propagateRollupHierarchy } from './src/utils/rollup.js';

/**
 * Helper único para actualizar campos de actividades (tareas/subtareas) en RTDB
 * Unifica la lógica de guardado entre "Mis tareas" y "Detail por ID"
 * @param {string} dbPath - Path completo de Firebase RTDB (ej: "clients/xyz/projects/abc/tasks/123")
 * @param {Object} patch - Campos a actualizar
 * @returns {Promise<void>}
 */
async function updateActivityFields(dbPath, patch) {
    if (!dbPath || typeof dbPath !== 'string') {
        throw new Error('dbPath inválido o vacío');
    }
    const updates = {
        ...patch,
        updatedAt: new Date().toISOString()
    };
    await update(ref(database, dbPath), updates);
}

/**
 * Wrapper local de recomputeRollup desde el módulo compartido
 */
async function recomputeRollup(parentDbPath, childrenKey) {
    return recomputeRollupShared(parentDbPath, childrenKey);
}

/**
 * Recomputa y actualiza el rollup de tiempo estimado de una tarea (legacy wrapper)
 * @deprecated Usar recomputeRollup(parentTaskPath, 'subtasks') en su lugar
 * @param {string} parentTaskPath - Path RTDB de la tarea padre
 * @returns {Promise<number>} - Total de minutos rollup
 */
async function recomputeParentTaskRollup(parentTaskPath) {
    return recomputeRollup(parentTaskPath, 'subtasks');
}

/**
 * Detecta si un nodo tarea tiene subtareas
 * @param {Object} taskOrItem - Objeto tarea o item con subtasks/entityRef
 * @returns {boolean} - true si tiene subtareas con claves válidas
 */
function hasSubtasks(taskOrItem) {
    if (!taskOrItem) return false;
    // Primero intentar acceder a subtasks directamente
    const subtasks = taskOrItem.subtasks || (taskOrItem.entityRef?.subtasks);
    if (!subtasks || typeof subtasks !== 'object') return false;
    return Object.keys(subtasks).length > 0;
}

/**
 * Convierte horas a minutos
 * @param {number} hours - Horas en formato decimal
 * @returns {number} - Minutos totales
 */
function hoursToMinutes(hours) {
    if (hours == null || isNaN(hours)) return 0;
    return Math.round(parseFloat(hours) * 60);
}

/**
 * Agregación recursiva de tiempos SOLO desde tareas hoja (sin subtareas) y subtareas
 * Para niveles superiores (cliente/proyecto/producto) y tareas con subtareas
 * NO cuenta tiempos manuales de tareas que tienen subtareas (esos se ignoran)
 * @param {Object} item - Nodo a agregar
 * @param {string} type - Tipo de nodo ('client', 'project', 'product', 'task', 'subtask')
 * @returns {{ estimated: number, spent: number }} - Suma de minutos de descendientes válidos
 */
function aggregateLeafTimes(item, type) {
    let estimated = 0;
    let spent = 0;

    if (!item) return { estimated, spent };

    /**
     * Obtiene minutos estimados de un nodo
     */
    const getEstimatedMinutes = (node) => {
        if (node.estimatedMinutes != null) return Number(node.estimatedMinutes) || 0;
        if (node.estimatedHours != null) return hoursToMinutes(parseFloat(node.estimatedHours));
        return 0;
    };

    /**
     * Obtiene minutos empleados de un nodo
     */
    const getSpentMinutes = (node) => {
        if (node.spentMinutes != null) return Number(node.spentMinutes) || 0;
        if (node.actualHours != null) return hoursToMinutes(parseFloat(node.actualHours));
        return 0;
    };

    /**
     * Agrega tiempos desde tareas (solo hojas) y subtareas
     */
    const aggregateFromTasks = (tasks) => {
        if (!tasks || typeof tasks !== 'object') return;
        Object.values(tasks).forEach(task => {
            if (!task) return;
            const taskHasSubtasks = task.subtasks && Object.keys(task.subtasks).length > 0;

            if (taskHasSubtasks) {
                // Tarea con subtareas: SOLO sumar tiempos de las subtareas, ignorar tiempos manuales de la tarea
                Object.values(task.subtasks).forEach(subtask => {
                    if (!subtask) return;
                    estimated += getEstimatedMinutes(subtask);
                    spent += getSpentMinutes(subtask);
                });
            } else {
                // Tarea hoja (sin subtareas): sumar sus tiempos
                estimated += getEstimatedMinutes(task);
                spent += getSpentMinutes(task);
            }
        });
    };

    switch (type) {
        case 'client':
            // Recorrer proyectos
            if (item.projects) {
                Object.values(item.projects).forEach(project => {
                    if (!project) return;
                    // Tareas directas del proyecto
                    aggregateFromTasks(project.tasks);
                    // Productos del proyecto
                    if (project.products) {
                        Object.values(project.products).forEach(product => {
                            if (!product) return;
                            aggregateFromTasks(product.tasks);
                        });
                    }
                });
            }
            break;

        case 'project':
            // Tareas directas del proyecto
            aggregateFromTasks(item.tasks);
            // Productos del proyecto
            if (item.products) {
                Object.values(item.products).forEach(product => {
                    if (!product) return;
                    aggregateFromTasks(product.tasks);
                });
            }
            break;

        case 'product':
            aggregateFromTasks(item.tasks);
            break;

        case 'task':
            // Si la tarea tiene subtareas, sumar solo de subtareas
            if (item.subtasks && Object.keys(item.subtasks).length > 0) {
                Object.values(item.subtasks).forEach(subtask => {
                    if (!subtask) return;
                    estimated += getEstimatedMinutes(subtask);
                    spent += getSpentMinutes(subtask);
                });
            }
            // Si no tiene subtareas, no agregamos nada (la tarea misma es editable)
            break;

        case 'subtask':
        default:
            // Subtareas no tienen hijos, no se agrega nada
            break;
    }

    return { estimated, spent };
}

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const addClientBtn = document.getElementById('add-client-btn');
    const addProjectBtn = document.getElementById('add-project-btn');
    const addProductBtn = document.getElementById('add-product-btn');
    const addTaskBtn = document.getElementById('add-task-btn');
    const clientListNav = document.getElementById('client-list-nav');
    const projectListNav = document.getElementById('project-list-nav');
    const productListNav = document.getElementById('product-list-nav');
    const clientListSection = document.getElementById('client-list-section');
    const projectListSection = document.getElementById('project-list-section');
    const productListSection = document.getElementById('product-list-section');
    const noClientsMessage = document.getElementById('no-clients-message');
    const noProjectsMessage = document.getElementById('no-projects-message');
    const noProductsMessage = document.getElementById('no-products-message');
    const backToClientsBtn = document.getElementById('back-to-clients-btn');
    const backToProjectsBtn = document.getElementById('back-to-projects-btn');
    const clientNameHeader = document.getElementById('client-name-header');
    const productClientNameHeader = document.getElementById('product-client-name-header');
    const projectNameHeader = document.getElementById('project-name-header');
    const projectDetail = document.getElementById('project-detail');
    const projectDetailName = document.getElementById('project-detail-name');
    const projectDetailSub = document.getElementById('project-detail-sub');
    const taskList = document.getElementById('task-list');
    const noTasksMessage = document.getElementById('no-tasks-message');
    const subtaskSection = document.getElementById('subtask-section');
    const subtaskList = document.getElementById('subtask-list');
    const noSubtasksMessage = document.getElementById('no-subtasks-message');
    const addSubtaskBtn = document.getElementById('add-subtask-btn');
    const treeBody = document.getElementById('tree-body');
    const treeExpandToggle = document.getElementById('tree-expand-toggle');
    const treeExpandIcon = document.getElementById('tree-expand-icon');
    const treeExpandLabel = document.getElementById('tree-expand-label');
    const treeView = document.getElementById('tree-view');
    const clientSearchInput = document.getElementById('client-search-input');
    const searchRoot = document.getElementById('search-root');
    const searchResultsPanel = document.getElementById('search-results');
    const searchResultsList = document.getElementById('search-results-list');
    const searchResultsEmpty = document.getElementById('search-results-empty');
    const tamoeHomeButton = document.getElementById('tamoe-home');
    const activityPathEls = Array.from(document.querySelectorAll('[data-activity-path]'));
    const statusMetricBlocked = document.getElementById('status-metric-blocked');
    const statusMetricPendingTasks = document.getElementById('status-metric-pending-tasks');
    const statusMetricInProgressTasks = document.getElementById('status-metric-inprogress-tasks');
    const statusMetricUnassigned = document.getElementById('status-metric-unassigned');
    const statusMetricRecent = document.getElementById('status-metric-recent');
    const statusScopeTitle = document.getElementById('status-scope-title');
    const statusScopeSubtitle = document.getElementById('status-scope-subtitle');
    const statusAttentionList = document.getElementById('status-attention-list');
    const statusAttentionEmpty = document.getElementById('status-attention-empty');
    const statusAttentionCount = document.getElementById('status-attention-count');
    const statusBlockedList = document.getElementById('status-blocked-list');
    const statusBlockedEmpty = document.getElementById('status-blocked-empty');
    const statusBlockedCount = document.getElementById('status-blocked-count');
    const statusUnassignedList = document.getElementById('status-unassigned-list');
    const statusUnassignedEmpty = document.getElementById('status-unassigned-empty');
    const statusUnassignedCount = document.getElementById('status-unassigned-count');
    const statusFilterType = document.getElementById('status-filter-type');
    const statusFilterClient = document.getElementById('status-filter-client');
    const statusFilterStatus = document.getElementById('status-filter-status');
    const statusFilterAssignee = document.getElementById('status-filter-assignee');
    const statusFilterSearch = document.getElementById('status-filter-search');
    const activitySortContainers = Array.from(document.querySelectorAll('[data-activity-sort]'));
    const myTasksList = document.getElementById('my-tasks-list');
    const myTasksEmpty = document.getElementById('my-tasks-empty');
    const myTasksSummary = document.getElementById('my-tasks-summary');
    const myTasksFilterStatus = document.getElementById('my-tasks-filter-status');
    const myTasksFilterClient = document.getElementById('my-tasks-filter-client');
    const myTasksFilterType = document.getElementById('my-tasks-filter-type');
    const myTasksFilterPriority = document.getElementById('my-tasks-filter-priority');
    const myTasksFilterDate = document.getElementById('my-tasks-filter-date');
    const myTasksFilterSearch = document.getElementById('my-tasks-filter-search');
    const myTasksKpiInProgress = document.getElementById('my-tasks-kpi-inprogress');
    const myTasksKpiPending = document.getElementById('my-tasks-kpi-pending');
    const myTasksKpiBlocked = document.getElementById('my-tasks-kpi-blocked');
    const myTasksKpiRecent = document.getElementById('my-tasks-kpi-recent');
    const myTasksInProgressList = document.getElementById('my-tasks-inprogress-list');
    const myTasksInProgressEmpty = document.getElementById('my-tasks-inprogress-empty');
    const myTasksInProgressCount = document.getElementById('my-tasks-inprogress-count');
    const myTasksBlockedList = document.getElementById('my-tasks-blocked-list');
    const myTasksBlockedEmpty = document.getElementById('my-tasks-blocked-empty');
    const myTasksBlockedCount = document.getElementById('my-tasks-blocked-count');
    const myTasksRecentList = document.getElementById('my-tasks-recent-list');
    const myTasksRecentEmpty = document.getElementById('my-tasks-recent-empty');
    const myTasksRecentCount = document.getElementById('my-tasks-recent-count');
    const calendarViewLabel = document.getElementById('calendar-view-label');
    const calendarMonthLabel = document.getElementById('calendar-month');
    const calendarWeekdays = document.getElementById('calendar-weekdays');
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarDayList = document.getElementById('calendar-day-list');
    const calendarEmpty = document.getElementById('calendar-empty');
    const calendarPrevBtn = document.getElementById('calendar-prev');
    const calendarNextBtn = document.getElementById('calendar-next');
    const calendarTodayBtn = document.getElementById('calendar-today');
    const calendarViewButtons = Array.from(document.querySelectorAll('[data-calendar-view]'));

    // Timeline/Cronograma elements
    const timelineContainer = document.getElementById('timeline-container');
    const timelineEmpty = document.getElementById('timeline-empty');
    const timelineViewLabel = document.getElementById('timeline-view-label');
    const timelineRangeLabel = document.getElementById('timeline-range-label');
    const timelinePrevBtn = document.getElementById('timeline-prev');
    const timelineNextBtn = document.getElementById('timeline-next');
    const timelineTodayBtn = document.getElementById('timeline-today');
    const timelineViewButtons = Array.from(document.querySelectorAll('[data-timeline-view]'));
    const timelineFilterClient = document.getElementById('timeline-filter-client');
    const timelineFilterProject = document.getElementById('timeline-filter-project');
    const timelineFilterPriority = document.getElementById('timeline-filter-priority');
    const timelineFilterType = document.getElementById('timeline-filter-type');
    const timelineFilterAssignee = document.getElementById('timeline-filter-assignee');

    const projectAutomationToggle = document.getElementById('project-automation-toggle');
    const projectAutomationPanel = document.getElementById('project-automation-panel');
    const projectAutomationList = document.getElementById('project-automation-list');
    const projectAutomationEmpty = document.getElementById('project-automation-empty');

    // Project Template elements
    const projectTemplateEnabled = document.getElementById('project-template-enabled');
    const projectTemplateStatus = document.getElementById('project-template-status');
    const projectTemplateConfig = document.getElementById('project-template-config');
    const templateTasksList = document.getElementById('template-tasks-list');
    const templateTasksEmpty = document.getElementById('template-tasks-empty');
    const addTemplateTaskBtn = document.getElementById('add-template-task-btn');
    const saveTemplateBtn = document.getElementById('save-template-btn');
    const templateSaveStatus = document.getElementById('template-save-status');

    // Modals & forms
    const addClientModal = document.getElementById('add-client-modal');
    const addProjectModal = document.getElementById('add-project-modal');
    const addProductModal = document.getElementById('add-product-modal');
    const addTaskModal = document.getElementById('add-task-modal');
    const addSubtaskModal = document.getElementById('add-subtask-modal');

    const addClientForm = document.getElementById('add-client-form');
    const addProjectForm = document.getElementById('add-project-form');
    const addProductForm = document.getElementById('add-product-form');
    const addTaskForm = document.getElementById('add-task-form');
    const addSubtaskForm = document.getElementById('add-subtask-form');

    const closeModalBtn = document.getElementById('close-modal-btn');
    const closeProjectModalBtn = document.getElementById('close-project-modal-btn');
    const closeProductModalBtn = document.getElementById('close-product-modal-btn');
    const closeTaskModalBtn = document.getElementById('close-task-modal-btn');
    const closeSubtaskModalBtn = document.getElementById('close-subtask-modal-btn');

    const cancelAddClientBtn = document.getElementById('cancel-add-client');
    const cancelAddProjectBtn = document.getElementById('cancel-add-project');
    const cancelAddProductBtn = document.getElementById('cancel-add-product');
    const cancelAddTaskBtn = document.getElementById('cancel-add-task');
    const cancelAddSubtaskBtn = document.getElementById('cancel-add-subtask');

    const companyNameInput = document.getElementById('company-name');
    const projectNameInput = document.getElementById('project-name');
    const productNameInput = document.getElementById('product-name');
    const taskNameInput = document.getElementById('task-name');
    const subtaskNameInput = document.getElementById('subtask-name');

    const saveClientBtn = addClientForm ? addClientForm.querySelector('button[type="submit"]') : null;
    const saveProjectBtn = addProjectForm ? addProjectForm.querySelector('button[type="submit"]') : null;
    const saveProductBtn = addProductForm ? addProductForm.querySelector('button[type="submit"]') : null;
    const saveTaskBtn = addTaskForm ? addTaskForm.querySelector('button[type="submit"]') : null;
    const saveSubtaskBtn = addSubtaskForm ? addSubtaskForm.querySelector('button[type="submit"]') : null;

    let allClients = [];
    let currentUser = null;
    let clientsRef = null;
    let usersByUid = {};
    let usersUnsubscribe = null;
    let listenersAttached = false;
    let selectedClientId = null;
    let selectedProjectId = null;
    let selectedProductId = null;
    let selectedTaskId = null;
    let selectedSubtaskId = null;
    let sidebarAutoOpenKeys = new Set();
    let taskCreationContext = null;
    let productCreationContext = null;
    let clientSearchQuery = '';
    let clientsLoading = false;
    let calendarItems = [];
    let calendarState = { view: 'month', date: new Date() };

    // Timeline/Cronograma state
    let timelineItems = [];
    let timelineState = { view: 'week', date: new Date() };
    const timelineFilters = { client: 'all', project: 'all', priority: 'all', type: 'all', assignee: 'all' };
    let timelineFiltersInitialized = false;
    let timelineCollapsedGroups = new Set(); // IDs de grupos colapsados

    let availableProjectAutomations = [];
    let selectedProjectAutomationIds = new Set();
    let projectAutomationLoading = false;
    const projectAutomationCache = new Map();
    const statusFilters = { type: 'all', client: 'all', status: 'all', assignee: 'all', query: '' };
    let statusFiltersInitialized = false;
    const myTasksFilters = { status: 'all', client: 'all', type: 'all', priority: 'all', dateFilter: 'all', query: '' };
    let myTasksFiltersInitialized = false;

    // Constantes de prioridad
    const PRIORITY_VALUES = ['none', 'low', 'medium', 'high'];
    const PRIORITY_LABELS = {
        'none': 'Sin prioridad',
        'low': 'Baja',
        'medium': 'Media',
        'high': 'Alta'
    };
    const PRIORITY_COLORS = {
        'none': 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300',
        'low': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        'medium': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
        'high': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    };

    // Clases para chip/pill de prioridad (elegante, con colores R/N/A/V)
    const priorityChipClass = (p) => {
        const base = 'inline-flex items-center justify-center px-3 h-9 w-full rounded-full text-xs font-semibold border transition-colors select-none cursor-pointer';
        // Sin prioridad = verde sutil con relleno suave
        if (p === 'none') return `${base} border-emerald-500/50 bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/25`;
        // Baja = amarillo con relleno suave
        if (p === 'low') return `${base} border-yellow-500/50 bg-yellow-500/15 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-500/25`;
        // Media = naranja con relleno suave
        if (p === 'medium') return `${base} border-orange-500/50 bg-orange-500/15 dark:bg-orange-500/20 text-orange-800 dark:text-orange-200 hover:bg-orange-500/25`;
        // Alta = rojo con relleno suave
        return `${base} border-red-500/50 bg-red-500/15 dark:bg-red-500/20 text-red-800 dark:text-red-200 hover:bg-red-500/25`;
    };
    const PRIORITY_SORT_ORDER = { 'high': 3, 'medium': 2, 'low': 1, 'none': 0 };

    // Helper para obtener fecha local en formato YYYY-MM-DD
    const getTodayLocalYYYYMMDD = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Helper para sumar días a una fecha
    const addDaysToDateString = (dateStr, days) => {
        const date = new Date(dateStr + 'T00:00:00');
        date.setDate(date.getDate() + days);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Helper para verificar si una fecha está en el mes actual
    const isInCurrentMonth = (dateStr) => {
        if (!dateStr) return false;
        const now = new Date();
        const date = new Date(dateStr + 'T00:00:00');
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    };

    // Project Template state
    let projectTemplateState = {
        enabled: false,
        tasks: []
    };
    const DEFAULT_PROJECT_TEMPLATE = {
        id: 'default_project_template',
        name: 'Proyecto estándar',
        tasks: [
            { name: 'Kick-off y brief', status: 'Pendiente', estimatedMinutes: 0 },
            { name: 'Producción de contenidos', status: 'Pendiente', estimatedMinutes: 0 },
            { name: 'Revisión y validación', status: 'Pendiente', estimatedMinutes: 0 },
            { name: 'Entrega y cierre', status: 'Pendiente', estimatedMinutes: 0 }
        ]
    };

    // User dropdown
    const userMenuToggle = document.getElementById('user-menu-toggle');
    const userMenu = document.getElementById('user-menu');
    const toggleUserMenu = () => {
        if (!userMenu) return;
        closeAllActionMenus();
        userMenu.classList.toggle('hidden');
    };

    // helpers to show/hide elements
    const showEl = el => el && el.classList.remove('hidden');
    const hideEl = el => el && el.classList.add('hidden');

    const SORT_STORAGE_KEY = 'tamoe.activitySortMode';
    const SORT_LABELS = {
        'created-desc': 'Fecha de creación (más reciente)',
        'created-asc': 'Fecha de creación (más antigua)',
        'recent-desc': 'Recientes (actualizado recientemente)',
        'recent-asc': 'Recientes (actualizado hace más tiempo)',
        'alpha-asc': 'Nombre (A–Z)',
        'alpha-desc': 'Nombre (Z–A)',
        'date-asc': 'Fecha ejecución (próxima primero)',
        'date-desc': 'Fecha ejecución (lejana primero)',
        'priority-desc': 'Prioridad (Alta→Baja)',
        'priority-asc': 'Prioridad (Baja→Alta)',
    };
    const DEFAULT_SORT_MODE = 'created-desc';
    const SORT_MODES = new Set(Object.keys(SORT_LABELS));
    let currentSortMode = DEFAULT_SORT_MODE;

    const parseTimestamp = (value) => {
        if (!value) return null;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof value === 'object') {
            if (typeof value.toMillis === 'function') return value.toMillis();
            if (typeof value.seconds === 'number') return value.seconds * 1000;
            if (typeof value.timestamp === 'number') return value.timestamp;
        }
        return null;
    };

    const normalizeSortMode = (value) => (SORT_MODES.has(value) ? value : DEFAULT_SORT_MODE);

    const loadSortMode = () => {
        try {
            return normalizeSortMode(localStorage.getItem(SORT_STORAGE_KEY));
        } catch (error) {
            return DEFAULT_SORT_MODE;
        }
    };

    const persistSortMode = (value) => {
        try {
            localStorage.setItem(SORT_STORAGE_KEY, value);
        } catch (error) {
            // Ignore storage failures.
        }
    };

    const updateSortMenuChecks = (container) => {
        if (!container) return;
        const menu = container.querySelector('.action-menu');
        if (!menu) return;
        menu.querySelectorAll('button[data-sort]').forEach((btn) => {
            const isActive = btn.dataset.sort === currentSortMode;
            const check = btn.querySelector('.material-symbols-outlined.check');
            if (check) check.classList.toggle('opacity-0', !isActive);
        });
    };

    const syncSortSelectors = () => {
        activitySortContainers.forEach((container) => {
            updateSortMenuChecks(container);
            const button = container.querySelector('button[data-sort-toggle]');
            if (!button) return;
            const label = SORT_LABELS[currentSortMode] || 'Ordenar';
            button.setAttribute('aria-label', `Ordenar: ${label}`);
            button.title = `Ordenar: ${label}`;
        });
    };

    const getSortName = (item) => String(item?.name || '').trim();
    const getSortCreatedAt = (item) => parseTimestamp(item?.createdAt);
    const getSortUpdatedAt = (item) => parseTimestamp(item?.updatedAt) || parseTimestamp(item?.createdAt);
    const getSortDate = (item) => String(item?.date || '').trim();
    const getSortPriority = (item) => PRIORITY_SORT_ORDER[item?.priority] ?? 0;

    const compareActivities = (a, b, mode = currentSortMode) => {
        const nameCompare = getSortName(a).localeCompare(getSortName(b), 'es', { sensitivity: 'base' });

        if (mode === 'alpha-asc') return nameCompare;
        if (mode === 'alpha-desc') return -nameCompare;

        // Ordenación por prioridad
        if (mode === 'priority-desc' || mode === 'priority-asc') {
            const prioA = getSortPriority(a);
            const prioB = getSortPriority(b);
            if (prioA !== prioB) {
                return mode === 'priority-desc' ? prioB - prioA : prioA - prioB;
            }
            // Empate: fallback a createdAt desc
            const timeA = getSortCreatedAt(a);
            const timeB = getSortCreatedAt(b);
            if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
                return timeB - timeA;
            }
            return nameCompare;
        }

        // Ordenación por fecha de ejecución
        if (mode === 'date-asc' || mode === 'date-desc') {
            const dateA = getSortDate(a);
            const dateB = getSortDate(b);
            const hasA = Boolean(dateA);
            const hasB = Boolean(dateB);

            // Items sin fecha van al final
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            if (!hasA && !hasB) return nameCompare;

            // Comparar fechas como strings (YYYY-MM-DD es comparable alfabéticamente)
            const cmp = dateA.localeCompare(dateB);
            if (cmp !== 0) {
                return mode === 'date-asc' ? cmp : -cmp;
            }
            return nameCompare;
        }

        // Determinar si usar createdAt o updatedAt según el modo
        const isRecentMode = mode === 'recent-desc' || mode === 'recent-asc';
        const timeA = isRecentMode ? getSortUpdatedAt(a) : getSortCreatedAt(a);
        const timeB = isRecentMode ? getSortUpdatedAt(b) : getSortCreatedAt(b);
        const hasA = Number.isFinite(timeA);
        const hasB = Number.isFinite(timeB);

        if (hasA && hasB) {
            let direction = -1; // default: más reciente primero
            if (mode === 'created-asc') direction = 1;
            if (mode === 'recent-asc') direction = 1;
            const timeDiff = (timeA - timeB) * direction;
            if (timeDiff !== 0) return timeDiff;
        } else if (hasA !== hasB) {
            return hasA ? -1 : 1;
        }

        return nameCompare;
    };

    const sortActivities = (items, mode = currentSortMode) => {
        const list = Array.isArray(items) ? [...items] : [];
        list.sort((a, b) => compareActivities(a, b, mode));
        return list;
    };

    const refreshSortedViews = () => {
        renderClients();
        if (selectedClientId && projectListSection && !projectListSection.classList.contains('hidden')) {
            renderProjects(selectedClientId);
        }
        if (selectedClientId && selectedProjectId && productListSection && !productListSection.classList.contains('hidden')) {
            renderProducts(selectedClientId, selectedProjectId);
        }
        if (selectedClientId && selectedProjectId) {
            renderTasks(selectedClientId, selectedProjectId, selectedProductId);
            if (selectedTaskId) {
                renderSubtasks(selectedClientId, selectedProjectId, selectedProductId, selectedTaskId);
            }
        }
        renderTree();
        renderStatusDashboard();
        renderMyTasks();
    };

    const setSortMode = (nextMode, { persist = true, rerender = true } = {}) => {
        const normalized = normalizeSortMode(nextMode);
        currentSortMode = normalized;
        if (persist) persistSortMode(normalized);
        syncSortSelectors();
        if (rerender) refreshSortedViews();
    };

    // Menú extendido para "Mis tareas" con filtros de prioridad y fecha + ordenación
    const createMyTasksSortFilterMenu = ({ value, onChange, onFilterChange }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative flex items-center justify-end';

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.sortToggle = 'true';
        button.className = 'size-9 rounded-lg border border-border-dark bg-white dark:bg-surface-dark text-text-muted hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex items-center justify-center';
        button.setAttribute('aria-label', 'Filtros y ordenación');
        button.title = 'Filtros y ordenación';
        button.innerHTML = '<span class="material-symbols-outlined text-[18px]">tune</span>';

        const menu = document.createElement('div');
        menu.className = 'action-menu hidden absolute right-0 top-full mt-2 w-72 bg-white dark:bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-hidden z-40 text-gray-900 dark:text-white max-h-[400px] overflow-y-auto';

        // === SECCIÓN FILTROS ===
        const filtersSection = document.createElement('div');
        filtersSection.className = 'border-b border-border-dark pb-2 mb-2';

        const filtersTitle = document.createElement('div');
        filtersTitle.className = 'px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider';
        filtersTitle.textContent = 'Filtros';
        filtersSection.appendChild(filtersTitle);

        // Filtro Prioridad
        const priorityFilterWrapper = document.createElement('div');
        priorityFilterWrapper.className = 'px-4 py-2';

        const priorityFilterLabel = document.createElement('label');
        priorityFilterLabel.className = 'text-xs text-text-muted block mb-1';
        priorityFilterLabel.textContent = 'Prioridad';

        const priorityFilterSelect = document.createElement('select');
        priorityFilterSelect.id = 'my-tasks-filter-priority';
        priorityFilterSelect.className = 'w-full h-8 rounded border border-border-dark bg-white dark:bg-surface-dark text-sm text-gray-900 dark:text-white px-2 focus:border-primary focus:ring-1 focus:ring-primary';

        const priorityOptions = [
            { value: 'all', label: 'Todas' },
            { value: 'high', label: 'Alta' },
            { value: 'medium', label: 'Media' },
            { value: 'low', label: 'Baja' },
            { value: 'none', label: 'Sin prioridad' }
        ];
        priorityOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === myTasksFilters.priority) option.selected = true;
            priorityFilterSelect.appendChild(option);
        });

        priorityFilterSelect.addEventListener('change', () => {
            myTasksFilters.priority = priorityFilterSelect.value;
            onFilterChange?.();
        });

        priorityFilterWrapper.append(priorityFilterLabel, priorityFilterSelect);
        filtersSection.appendChild(priorityFilterWrapper);

        // Filtro Fecha de ejecución
        const dateFilterWrapper = document.createElement('div');
        dateFilterWrapper.className = 'px-4 py-2';

        const dateFilterLabel = document.createElement('label');
        dateFilterLabel.className = 'text-xs text-text-muted block mb-1';
        dateFilterLabel.textContent = 'Fecha de ejecución';

        const dateFilterSelect = document.createElement('select');
        dateFilterSelect.id = 'my-tasks-filter-date';
        dateFilterSelect.className = 'w-full h-8 rounded border border-border-dark bg-white dark:bg-surface-dark text-sm text-gray-900 dark:text-white px-2 focus:border-primary focus:ring-1 focus:ring-primary';

        const dateOptions = [
            { value: 'all', label: 'Todas' },
            { value: 'no-date', label: 'Sin fecha' },
            { value: 'today', label: 'Hoy' },
            { value: 'next-7-days', label: 'Próximos 7 días' },
            { value: 'this-month', label: 'Este mes' }
        ];
        dateOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === myTasksFilters.dateFilter) option.selected = true;
            dateFilterSelect.appendChild(option);
        });

        dateFilterSelect.addEventListener('change', () => {
            myTasksFilters.dateFilter = dateFilterSelect.value;
            onFilterChange?.();
        });

        dateFilterWrapper.append(dateFilterLabel, dateFilterSelect);
        filtersSection.appendChild(dateFilterWrapper);

        menu.appendChild(filtersSection);

        // === SECCIÓN ORDENACIÓN ===
        const sortTitle = document.createElement('div');
        sortTitle.className = 'px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider';
        sortTitle.textContent = 'Ordenación';
        menu.appendChild(sortTitle);

        const sortOptions = [
            { key: 'created-desc', label: 'Creación (reciente)', icon: 'schedule' },
            { key: 'created-asc', label: 'Creación (antigua)', icon: 'history' },
            { key: 'alpha-asc', label: 'Nombre (A–Z)', icon: 'sort_by_alpha' },
            { key: 'alpha-desc', label: 'Nombre (Z–A)', icon: 'sort_by_alpha' },
            { key: 'date-asc', label: 'Fecha (próxima)', icon: 'event' },
            { key: 'date-desc', label: 'Fecha (lejana)', icon: 'event' },
            { key: 'priority-desc', label: 'Prioridad (Alta→Baja)', icon: 'priority_high' },
            { key: 'priority-asc', label: 'Prioridad (Baja→Alta)', icon: 'low_priority' },
        ];

        const updateChecks = () => {
            Array.from(menu.querySelectorAll('button[data-sort]')).forEach((btn) => {
                const isActive = btn.dataset.sort === value;
                const check = btn.querySelector('.material-symbols-outlined.check');
                if (check) check.classList.toggle('opacity-0', !isActive);
            });
        };

        sortOptions.forEach((option) => {
            const optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.dataset.sort = option.key;
            optBtn.className = 'w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 text-left';
            optBtn.innerHTML = `
                <span class="inline-flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px]">${option.icon}</span>
                    ${option.label}
                </span>
                <span class="material-symbols-outlined check text-[18px] text-text-muted ${option.key === value ? '' : 'opacity-0'}">check</span>
            `;
            optBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                menu.classList.add('hidden');
                value = option.key;
                onChange?.(option.key);
                updateChecks();
            });
            menu.appendChild(optBtn);
        });

        menu.addEventListener('click', event => event.stopPropagation());

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            userMenu?.classList.add('hidden');
            closeAllActionMenus(menu);
            updateChecks();
            // Sincronizar selects con estado actual
            priorityFilterSelect.value = myTasksFilters.priority || 'all';
            dateFilterSelect.value = myTasksFilters.dateFilter || 'all';
            menu.classList.toggle('hidden');
        });

        wrapper.append(button, menu);
        return wrapper;
    };

    const mountActivitySortMenus = () => {
        if (!activitySortContainers.length) return;
        activitySortContainers.forEach((container) => {
            if (!container) return;
            if (container.dataset.sortMounted === 'true') {
                updateSortMenuChecks(container);
                return;
            }
            container.dataset.sortMounted = 'true';
            container.innerHTML = '';

            // Para "Mis tareas", usar menú extendido con filtros
            if (container.id === 'activity-sort-my-tasks') {
                const menu = createMyTasksSortFilterMenu({
                    value: currentSortMode,
                    onChange: (mode) => setSortMode(mode),
                    onFilterChange: () => renderMyTasks(),
                });
                container.appendChild(menu);
                return;
            }

            const size = container.id === 'activity-sort-status' ? 'lg' : 'md';
            const menu = createSortMenu({
                value: currentSortMode,
                onChange: (mode) => setSortMode(mode),
                size,
            });
            container.appendChild(menu);
        });
        syncSortSelectors();
    };

    setSortMode(loadSortMode(), { persist: false, rerender: false });

    const updateActivityPath = () => {
        if (!activityPathEls.length) return;

        const setPath = (text) => {
            for (const el of activityPathEls) {
                el.textContent = text;
                el.title = text || '';
            }
        };

        if (!selectedClientId) {
            setPath('Todas las actividades');
            return;
        }

        const client = allClients.find(c => c.id === selectedClientId);
        const clientName = client?.name || selectedClientId;
        const clientManage = client?.manageId ? ` (${client.manageId})` : '';

        if (!selectedProjectId) {
            const text = `${clientName}${clientManage}`;
            setPath(text);
            return;
        }

        const project = client?.projects?.[selectedProjectId];
        const projectName = project?.name || selectedProjectId;
        const projectManage = project?.manageId ? ` (${project.manageId})` : '';

        if (!selectedProductId) {
            const text = `${clientName}${clientManage} / ${projectName}${projectManage}`;
            setPath(text);
            return;
        }

        const product = project?.products?.[selectedProductId];
        const productName = product?.name || selectedProductId;
        const productManage = product?.manageId ? ` (${product.manageId})` : '';

        const text = `${clientName}${clientManage} / ${projectName}${projectManage} / ${productName}${productManage}`;
        setPath(text);
    };

    const renderStatusDashboard = () => {
        try {
            if (
                !statusAttentionList &&
                !statusMetricBlocked &&
                !statusMetricPendingTasks &&
                !statusMetricInProgressTasks &&
                !statusMetricUnassigned &&
                !statusMetricRecent
            ) {
                return;
            }

            const safeClients = Array.isArray(allClients) ? allClients : [];
            const normalizeText = (value, fallback = '') => {
                const text = String(value || '').trim();
                return text || fallback;
            };

            const parseActivityTimestamp = parseTimestamp;

            const RECENT_WINDOW_DAYS = 14;
            const recentCutoff = Date.now() - (RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
            const attentionItems = [];
            let blockedCount = 0;
            let pendingCount = 0;
            let inProgressCount = 0;
            let unassignedCount = 0;
            let recentCount = 0;

            const buildContext = (clientName, projectName, productName) => (
                [clientName, projectName, productName].filter(Boolean).join(' \u2022 ') || '-'
            );

            const registerItem = ({
                type,
                name,
                manageId,
                status,
                assigneeUid,
                supportsAssignee,
                path,
                clientId,
                clientName,
                projectName,
                productName,
                activityValue,
                createdAt
            }) => {
                const normalizedStatus = normalizeStatus(status);
                const activityDate = parseActivityTimestamp(activityValue) || 0;
                const assignee = String(assigneeUid || '').trim();
                const isUnassigned = Boolean(supportsAssignee) && !assignee;
                const isBlocked = normalizedStatus === 'Bloqueada';
                const isInProgress = normalizedStatus === 'En proceso';
                const isPending = normalizedStatus === 'Pendiente';
                const isRecent = activityDate >= recentCutoff;

                if (isBlocked) blockedCount += 1;
                if (isInProgress) inProgressCount += 1;
                if (isPending) pendingCount += 1;
                if (isUnassigned) unassignedCount += 1;
                if (isRecent) recentCount += 1;

                let group = null;
                if (isBlocked) group = 'blocked';
                else if (isInProgress) group = 'in_progress';
                else if (isUnassigned) group = 'unassigned';
                else if (isPending && isRecent) group = 'recent';

                if (!group) return;

                attentionItems.push({
                    type,
                    name,
                    manageId,
                    status: normalizedStatus,
                    assigneeUid: assignee,
                    supportsAssignee: Boolean(supportsAssignee),
                    path,
                    clientId,
                    clientName,
                    projectName,
                    productName,
                    context: buildContext(clientName, projectName, productName),
                    createdAt: createdAt || '',
                    activityDate,
                    group,
                });
            };

            safeClients.forEach((client) => {
                if (!client) return;
                const clientId = client.id;
                const clientName = normalizeText(client.name, client.id || 'Cliente');
                const projects = client.projects || {};

                Object.entries(projects).forEach(([projectId, project]) => {
                    if (!project) return;
                    const projectName = normalizeText(project.name, projectId || 'Proyecto');
                    registerItem({
                        type: 'project',
                        name: projectName,
                        manageId: normalizeText(project.manageId),
                        status: project.status,
                        assigneeUid: '',
                        supportsAssignee: false,
                        path: `clients/${clientId}/projects/${projectId}`,
                        clientId,
                        clientName,
                        projectName,
                        productName: '',
                        activityValue: project.updatedAt || project.createdAt || '',
                        createdAt: project.createdAt || '',
                    });

                    Object.entries(project.tasks || {}).forEach(([taskId, task]) => {
                        if (!task) return;
                        const taskName = normalizeText(task.name, 'Tarea');
                        const taskPath = `clients/${clientId}/projects/${projectId}/tasks/${taskId}`;
                        registerItem({
                            type: 'task',
                            name: taskName,
                            manageId: normalizeText(task.manageId),
                            status: task.status,
                            assigneeUid: task.assigneeUid,
                            supportsAssignee: true,
                            path: taskPath,
                            clientId,
                            clientName,
                            projectName,
                            productName: '',
                            activityValue: task.updatedAt || task.createdAt || '',
                            createdAt: task.createdAt || '',
                        });

                        Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                            if (!subtask) return;
                            registerItem({
                                type: 'subtask',
                                name: normalizeText(subtask.name, 'Subtarea'),
                                manageId: normalizeText(subtask.manageId),
                                status: subtask.status,
                                assigneeUid: subtask.assigneeUid,
                                supportsAssignee: true,
                                path: `${taskPath}/subtasks/${subtaskId}`,
                                clientId,
                                clientName,
                                projectName,
                                productName: '',
                                activityValue: subtask.updatedAt || subtask.createdAt || '',
                                createdAt: subtask.createdAt || '',
                            });
                        });
                    });

                    Object.entries(project.products || {}).forEach(([productId, product]) => {
                        if (!product) return;
                        const productName = normalizeText(product.name, productId || 'Producto');
                        const productPath = `clients/${clientId}/projects/${projectId}/products/${productId}`;
                        registerItem({
                            type: 'product',
                            name: productName,
                            manageId: normalizeText(product.manageId),
                            status: product.status,
                            assigneeUid: '',
                            supportsAssignee: false,
                            path: productPath,
                            clientId,
                            clientName,
                            projectName,
                            productName,
                            activityValue: product.updatedAt || product.createdAt || '',
                            createdAt: product.createdAt || '',
                        });

                        Object.entries(product.tasks || {}).forEach(([taskId, task]) => {
                            if (!task) return;
                            const taskName = normalizeText(task.name, 'Tarea');
                            const taskPath = `${productPath}/tasks/${taskId}`;
                            registerItem({
                                type: 'task',
                                name: taskName,
                                manageId: normalizeText(task.manageId),
                                status: task.status,
                                assigneeUid: task.assigneeUid,
                                supportsAssignee: true,
                                path: taskPath,
                                clientId,
                                clientName,
                                projectName,
                                productName,
                                activityValue: task.updatedAt || task.createdAt || '',
                                createdAt: task.createdAt || '',
                            });

                            Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                                if (!subtask) return;
                                registerItem({
                                    type: 'subtask',
                                    name: normalizeText(subtask.name, 'Subtarea'),
                                    manageId: normalizeText(subtask.manageId),
                                    status: subtask.status,
                                    assigneeUid: subtask.assigneeUid,
                                    supportsAssignee: true,
                                    path: `${taskPath}/subtasks/${subtaskId}`,
                                    clientId,
                                    clientName,
                                    projectName,
                                    productName,
                                    activityValue: subtask.updatedAt || subtask.createdAt || '',
                                    createdAt: subtask.createdAt || '',
                                });
                            });
                        });
                    });
                });
            });

            if (statusMetricBlocked) statusMetricBlocked.textContent = String(blockedCount);
            if (statusMetricPendingTasks) statusMetricPendingTasks.textContent = String(pendingCount);
            if (statusMetricInProgressTasks) statusMetricInProgressTasks.textContent = String(inProgressCount);
            if (statusMetricUnassigned) statusMetricUnassigned.textContent = String(unassignedCount);
            if (statusMetricRecent) statusMetricRecent.textContent = String(recentCount);

            if (statusFilterClient) {
                const previous = statusFilterClient.value || statusFilters.client;
                statusFilterClient.innerHTML = '';
                const defaultOption = document.createElement('option');
                defaultOption.value = 'all';
                defaultOption.textContent = 'Cliente: Todos';
                statusFilterClient.appendChild(defaultOption);

                safeClients
                    .slice()
                    .sort((a, b) => normalizeText(a?.name, a?.id).localeCompare(normalizeText(b?.name, b?.id)))
                    .forEach((client) => {
                        if (!client) return;
                        const option = document.createElement('option');
                        option.value = client.id;
                        option.textContent = normalizeText(client.name, client.id || 'Cliente');
                        statusFilterClient.appendChild(option);
                    });

                const hasPrevious = Array.from(statusFilterClient.options).some(option => option.value === previous);
                statusFilterClient.value = hasPrevious ? previous : 'all';
                statusFilters.client = statusFilterClient.value;
            }

            const applyFilterState = () => {
                if (statusFilterType) statusFilters.type = statusFilterType.value || 'all';
                if (statusFilterClient) statusFilters.client = statusFilterClient.value || 'all';
                if (statusFilterStatus) statusFilters.status = statusFilterStatus.value || 'all';
                if (statusFilterAssignee) statusFilters.assignee = statusFilterAssignee.value || 'all';
                if (statusFilterSearch) statusFilters.query = String(statusFilterSearch.value || '').trim().toLowerCase();
            };

            if (!statusFiltersInitialized) {
                const refresh = () => {
                    applyFilterState();
                    renderStatusDashboard();
                };
                if (statusFilterType) statusFilterType.addEventListener('change', refresh);
                if (statusFilterClient) statusFilterClient.addEventListener('change', refresh);
                if (statusFilterStatus) statusFilterStatus.addEventListener('change', refresh);
                if (statusFilterAssignee) statusFilterAssignee.addEventListener('change', refresh);
                if (statusFilterSearch) statusFilterSearch.addEventListener('input', refresh);
                statusFiltersInitialized = true;
            }

            applyFilterState();

            const filtered = attentionItems.filter((item) => {
                if (statusFilters.type !== 'all' && item.type !== statusFilters.type) return false;
                if (statusFilters.client !== 'all' && item.clientId !== statusFilters.client) return false;
                if (statusFilters.status !== 'all' && item.status !== statusFilters.status) return false;
                if (statusFilters.assignee === 'assigned' && (!item.supportsAssignee || !item.assigneeUid)) return false;
                if (statusFilters.assignee === 'unassigned' && (!item.supportsAssignee || item.assigneeUid)) return false;
                if (statusFilters.query) {
                    const haystack = [
                        item.name,
                        item.manageId,
                        item.clientName,
                        item.projectName,
                        item.productName
                    ].filter(Boolean).join(' ').toLowerCase();
                    if (!haystack.includes(statusFilters.query)) return false;
                }
                return true;
            });

            const groupRank = { blocked: 0, in_progress: 1, unassigned: 2, recent: 3 };
            const sortedAttention = [...filtered].sort((a, b) => {
                const rankA = groupRank[a.group] ?? 99;
                const rankB = groupRank[b.group] ?? 99;
                if (rankA !== rankB) return rankA - rankB;
                return compareActivities(a, b);
            });

            const typeIcons = {
                project: 'folder',
                product: 'category',
                task: 'check_circle',
                subtask: 'subdirectory_arrow_right',
            };

            const buildRow = (item, compact = false) => {
                const row = document.createElement('div');
                row.className = `flex flex-col gap-3 rounded-lg border border-border-dark bg-white dark:bg-surface-dark ${compact ? 'p-3' : 'p-4'}`;

                const header = document.createElement('div');
                header.className = 'flex flex-col gap-1';

                const titleRow = document.createElement('div');
                titleRow.className = 'flex items-start gap-2 min-w-0';

                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined text-[18px] text-primary';
                icon.textContent = typeIcons[item.type] || 'folder';

                const titleWrap = document.createElement('div');
                titleWrap.className = 'min-w-0 flex flex-wrap items-center gap-2';

                const titleEl = document.createElement(item.manageId ? 'button' : 'span');
                if (item.manageId) titleEl.type = 'button';
                titleEl.className = item.manageId
                    ? 'text-left font-semibold text-gray-900 dark:text-white hover:underline truncate'
                    : 'font-semibold text-gray-900 dark:text-white truncate';
                titleEl.textContent = item.name || '-';
                if (item.manageId) {
                    titleEl.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openDetailPage(item.manageId);
                    });
                }

                titleWrap.appendChild(titleEl);
                if (item.manageId) {
                    const idTag = createIdChip(item.manageId);
                    idTag.classList.add('text-[11px]', 'font-mono');
                    titleWrap.appendChild(idTag);
                }

                titleRow.append(icon, titleWrap);

                const context = document.createElement('p');
                context.className = 'text-text-muted text-xs';
                context.textContent = item.context || '-';

                header.append(titleRow, context);

                const controls = document.createElement('div');
                controls.className = 'flex flex-wrap items-center gap-3';
                if (item.path) {
                    const statusControl = createStatusControl({
                        status: item.status,
                        onChange: async (nextStatus) => {
                            await updateStatusAtPath(item.path, nextStatus);
                            renderStatusDashboard();
                            renderTree();
                        }
                    });
                    controls.appendChild(statusControl);
                }

                if (item.supportsAssignee && item.path) {
                    const assigneeControl = createAssigneeControl({
                        assigneeUid: item.assigneeUid,
                        onChange: async (nextUid) => {
                            await updateAssigneeAtPath(item.path, nextUid);
                            renderStatusDashboard();
                            renderTree();
                        }
                    });
                    controls.appendChild(assigneeControl);
                }

                row.append(header, controls);
                return row;
            };

            const renderList = (items, listEl, emptyEl, countEl, labelSuffix = '') => {
                if (!listEl) return;
                listEl.innerHTML = '';
                if (countEl) countEl.textContent = labelSuffix ? `${items.length} ${labelSuffix}` : String(items.length);
                if (!items.length) {
                    if (emptyEl) emptyEl.classList.remove('hidden');
                    return;
                }
                if (emptyEl) emptyEl.classList.add('hidden');
                items.forEach((item) => listEl.appendChild(buildRow(item, listEl !== statusAttentionList)));
            };

            renderList(sortedAttention, statusAttentionList, statusAttentionEmpty, statusAttentionCount, 'elementos');

            const blockedItems = sortActivities(filtered.filter((item) => item.status === 'Bloqueada'));
            renderList(blockedItems, statusBlockedList, statusBlockedEmpty, statusBlockedCount);

            const unassignedItems = sortActivities(filtered.filter((item) => item.supportsAssignee && !item.assigneeUid));
            renderList(unassignedItems, statusUnassignedList, statusUnassignedEmpty, statusUnassignedCount);
        } catch (error) {
            console.error('Error rendering status dashboard:', error);
        }
    };

    const stripWrappingQuotes = (value) => {
        let text = String(value ?? '').trim();
        if (!text) return '';
        const pairs = { '"': '"', "'": "'", '“': '”', '‘': '’', '«': '»' };
        while (text.length >= 2) {
            const first = text[0];
            const last = text[text.length - 1];
            if (pairs[first] === last) text = text.slice(1, -1).trim();
            else break;
        }
        return text;
    };

    const getUserDisplayNameByUid = (uid) => {
        const safeUid = String(uid || '').trim();
        if (!safeUid) return '';
        const user = usersByUid?.[safeUid];
        const candidate = user?.username || user?.email || safeUid;
        return stripWrappingQuotes(candidate) || safeUid;
    };

    const getUserDepartmentByUid = (uid) => {
        const safeUid = String(uid || '').trim();
        if (!safeUid) return '';
        const user = usersByUid?.[safeUid];
        return user?.department || '';
    };

    const getUserPhotoByUid = (uid) => {
        const safeUid = String(uid || '').trim();
        if (!safeUid) return '';
        const user = usersByUid?.[safeUid];
        return user?.profile_picture || '';
    };

    const getInitials = (value) => {
        const text = String(value || '').trim();
        if (!text) return '?';
        const parts = text.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            const firstName = parts[0];
            const firstSurname = parts.length >= 3 ? parts[parts.length - 2] : parts[1];
            return `${firstName[0] || ''}${firstSurname[0] || ''}`.toUpperCase() || '?';
        }
        if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
        return parts[0][0].toUpperCase();
    };

    const getTreeDetailsElements = () => treeBody ? Array.from(treeBody.querySelectorAll('details')) : [];

    const updateTreeExpandToggle = () => {
        if (!treeExpandToggle) return;
        const details = getTreeDetailsElements();
        const hasItems = details.length > 0;
        treeExpandToggle.disabled = !hasItems;
        treeExpandToggle.classList.toggle('opacity-50', !hasItems);
        treeExpandToggle.classList.toggle('cursor-not-allowed', !hasItems);

        const allOpen = hasItems && details.every(d => d.open);
        if (treeExpandIcon) treeExpandIcon.textContent = allOpen ? 'unfold_less' : 'unfold_more';
        if (treeExpandLabel) treeExpandLabel.textContent = allOpen ? 'Contraer todo' : 'Expandir todo';
    };

    const openDetailPage = (manageId) => {
        if (!manageId) return;
        const url = `${window.location.origin}/${encodeURIComponent(manageId)}`;
        window.open(url, '_blank', 'noopener');
    };

    const openDetailViewForManageId = (manageIdValue) => {
        const manageId = String(manageIdValue || '').trim();
        if (!manageId) return false;

        const detailView = document.getElementById('detail-view');
        const detailFrame = document.getElementById('detail-frame');
        if (detailView && detailFrame) {
            document.getElementById('tab-projects')?.click();
            detailView.classList.remove('hidden');
            detailFrame.src = `detail.html?mid=${encodeURIComponent(manageId)}`;
            document.getElementById('tree-view')?.classList.add('hidden');
            document.getElementById('project-detail')?.classList.add('hidden');
            document.getElementById('dashboard-tabs')?.classList.add('hidden');
            if (window.location.protocol !== 'file:') {
                const targetPath = `/${encodeURIComponent(manageId)}`;
                if (window.location.pathname !== targetPath) {
                    try {
                        window.history.pushState({}, '', targetPath);
                    } catch (error) {
                        // Ignore history update failures.
                    }
                }
            }
            document.title = `Detalle ${manageId} | Tamoe`;
            return true;
        }

        const encoded = encodeURIComponent(manageId);
        const origin = window.location.origin;
        const target = origin && origin !== 'null'
            ? `${origin}/${encoded}`
            : `maindashboard.html?mid=${encoded}`;
        window.location.assign(target);
        return true;
    };

    const createIdChip = (manageId) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'manage-chip text-[11px] text-text-muted shrink-0 hover:text-gray-900 dark:hover:text-white hover:underline';
        chip.textContent = manageId || '';
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openDetailPage(manageId);
        });
        return chip;
    };

    const normalizeStatus = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return 'Pendiente';
        if (raw === 'pendiente') return 'Pendiente';
        if (raw === 'en curso' || raw === 'encurso') return 'En proceso';
        if (raw === 'en proceso' || raw === 'enproceso' || raw === 'en_proceso') return 'En proceso';
        if (raw === 'finalizado' || raw === 'finalizada') return 'Finalizado';
        return 'Pendiente';
    };

    const hasEntityShape = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        return (
            Object.prototype.hasOwnProperty.call(value, 'name') ||
            Object.prototype.hasOwnProperty.call(value, 'status') ||
            Object.prototype.hasOwnProperty.call(value, 'createdAt') ||
            Object.prototype.hasOwnProperty.call(value, 'manageId')
        );
    };

    const unwrapEntity = (value) => {
        if (hasEntityShape(value)) return { id: null, value };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { id: null, value };

        const entries = Object.entries(value)
            .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
        if (entries.length === 1 && hasEntityShape(entries[0][1])) {
            return { id: entries[0][0], value: entries[0][1] };
        }
        return { id: null, value };
    };

    const normalizeEntityMap = (map) => {
        const normalized = {};
        Object.entries(map || {}).forEach(([id, value]) => {
            if (!value || typeof value !== 'object') return;
            const { id: nestedId, value: entity } = unwrapEntity(value);
            const finalId = nestedId || id;
            if (!normalized[finalId]) normalized[finalId] = entity;
        });
        return normalized;
    };

    const ensureStatus = (entity) => {
        if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return;
        if (!entity.status) entity.status = 'Pendiente';
    };

    const normalizeTasksMap = (tasks) => {
        const normalized = normalizeEntityMap(tasks);
        Object.values(normalized).forEach((task) => {
            ensureStatus(task);
            const subtasks = normalizeEntityMap(task.subtasks);
            Object.values(subtasks).forEach(ensureStatus);
            task.subtasks = subtasks;
        });
        return normalized;
    };

    const normalizeProductsMap = (products) => {
        const normalized = normalizeEntityMap(products);
        Object.values(normalized).forEach((product) => {
            ensureStatus(product);
            product.tasks = normalizeTasksMap(product.tasks);
        });
        return normalized;
    };

    const normalizeProjectsMap = (projects) => {
        const normalized = normalizeEntityMap(projects);
        Object.values(normalized).forEach((project) => {
            ensureStatus(project);
            project.tasks = normalizeTasksMap(project.tasks);
            project.products = normalizeProductsMap(project.products);
        });
        return normalized;
    };

    const normalizeClientData = (clients) => clients.map((client) => {
        const next = { ...client };
        next.projects = normalizeProjectsMap(client.projects);
        return next;
    });

    const STATUS_OPTIONS = ['Pendiente', 'En proceso', 'Finalizado'];
    const STATUS_STYLES = {
        'Pendiente': 'bg-slate-200/80 text-slate-800 border-slate-300 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/30',
        'En proceso': 'bg-blue-200/80 text-blue-900 border-blue-300 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30',
        'Finalizado': 'bg-emerald-200/80 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30',
    };

    const applyStatusChipStyle = (button, label, statusValue) => {
        if (!button || !label) return;
        const normalized = normalizeStatus(statusValue);
        const style = STATUS_STYLES[normalized] || STATUS_STYLES['Pendiente'];
        label.textContent = normalized;
        button.className = `status-chip inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-normal border whitespace-nowrap ${style}`;
    };

    const renderMyTasks = () => {
        if (!myTasksList || !myTasksEmpty || !myTasksSummary) return;
        myTasksList.innerHTML = '';
        if (myTasksInProgressList) myTasksInProgressList.innerHTML = '';
        if (myTasksBlockedList) myTasksBlockedList.innerHTML = '';
        if (myTasksRecentList) myTasksRecentList.innerHTML = '';

        const setMiniCount = (el, value) => {
            if (el) el.textContent = String(value);
        };
        const setKpiValue = (el, value) => {
            if (el) el.textContent = String(value);
        };
        const toggleMiniEmpty = (listEl, emptyEl, hasItems) => {
            if (!listEl || !emptyEl) return;
            emptyEl.classList.toggle('hidden', hasItems);
        };

        const uid = String(currentUser?.uid || '').trim();
        if (!uid) {
            myTasksSummary.textContent = '0 asignadas';
            myTasksEmpty.textContent = 'Inicia sesion para ver tus tareas.';
            myTasksEmpty.classList.remove('hidden');
            setKpiValue(myTasksKpiInProgress, 0);
            setKpiValue(myTasksKpiPending, 0);
            setKpiValue(myTasksKpiBlocked, 0);
            setKpiValue(myTasksKpiRecent, 0);
            setMiniCount(myTasksInProgressCount, 0);
            setMiniCount(myTasksBlockedCount, 0);
            setMiniCount(myTasksRecentCount, 0);
            toggleMiniEmpty(myTasksInProgressList, myTasksInProgressEmpty, false);
            toggleMiniEmpty(myTasksBlockedList, myTasksBlockedEmpty, false);
            toggleMiniEmpty(myTasksRecentList, myTasksRecentEmpty, false);
            return;
        }

        const assignments = [];
        const normalizeText = (value, fallback = '') => {
            const text = String(value || '').trim();
            return text || fallback;
        };
        const buildContext = (clientName, projectName, productName) => (
            [clientName, projectName, productName].map(part => part || '-').join(' \u2022 ')
        );
        const isAssignedToUser = (assigneeUid) => String(assigneeUid || '').trim() === uid;
        const getMyTaskTime = (item) => {
            const updated = parseTimestamp(item.updatedAt);
            if (Number.isFinite(updated)) return updated;
            const created = parseTimestamp(item.createdAt);
            return Number.isFinite(created) ? created : 0;
        };
        const compareByRecent = (a, b) => {
            const diff = getMyTaskTime(b) - getMyTaskTime(a);
            if (diff !== 0) return diff;
            return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
        };

        const pushAssignment = (entry) => {
            assignments.push(entry);
        };

        allClients.forEach((client) => {
            if (!client) return;
            const clientId = client.id || '';
            const clientName = normalizeText(client.name, clientId || 'Cliente');
            const projects = client.projects || {};

            Object.entries(projects).forEach(([projectId, project]) => {
                if (!project) return;
                const projectName = normalizeText(project.name, projectId || 'Proyecto');

                Object.entries(project.tasks || {}).forEach(([taskId, task]) => {
                    if (!task) return;
                    if (isAssignedToUser(task.assigneeUid)) {
                        const taskPath = `clients/${clientId}/projects/${projectId}/tasks/${taskId}`;
                        const parentProjectPath = `clients/${clientId}/projects/${projectId}`;
                        const taskHasSubtasks = hasSubtasks(task);

                        pushAssignment({
                            type: 'task',
                            name: normalizeText(task.name, 'Tarea'),
                            status: normalizeStatus(task.status),
                            manageId: normalizeText(task.manageId),
                            createdAt: task.createdAt || '',
                            updatedAt: task.updatedAt || '',
                            // Campos de tiempo (estimado/empleado) - CRITICAL para mostrar en UI
                            estimatedMinutes: task.estimatedMinutes ?? null,
                            estimatedMinutesRollup: task.estimatedMinutesRollup ?? null, // suma de subtareas
                            estimatedHours: task.estimatedHours ?? null, // legacy fallback
                            spentMinutes: task.spentMinutes ?? null,
                            spentMinutesRollup: task.spentMinutesRollup ?? null, // suma de subtareas empleado
                            actualHours: task.actualHours ?? null, // legacy fallback
                            // Nuevo: flag para bloquear edición de tiempos
                            hasSubtasks: taskHasSubtasks,
                            subtasks: task.subtasks || null, // Para calcular acumulados
                            // Campo de fecha para "Mis tareas"
                            date: task.date || task.workDate || null,
                            // Campo de prioridad
                            priority: task.priority || 'none',
                            context: buildContext(clientName, projectName, 'Sin producto'),
                            clientId,
                            clientName,
                            path: taskPath,
                            parentProjectDbPath: parentProjectPath, // Para rollup jerárquico
                            entityRef: task,
                        });
                    }
                    Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                        if (!subtask) return;
                        if (isAssignedToUser(subtask.assigneeUid)) {
                            const subtaskPath = `clients/${clientId}/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`;
                            const parentTaskPath = `clients/${clientId}/projects/${projectId}/tasks/${taskId}`;

                            pushAssignment({
                                type: 'subtask',
                                name: normalizeText(subtask.name, 'Subtarea'),
                                status: normalizeStatus(subtask.status),
                                manageId: normalizeText(subtask.manageId),
                                createdAt: subtask.createdAt || '',
                                updatedAt: subtask.updatedAt || '',
                                // Campos de tiempo (estimado/empleado) - CRITICAL para mostrar en UI
                                estimatedMinutes: subtask.estimatedMinutes ?? null,
                                estimatedHours: subtask.estimatedHours ?? null, // legacy fallback
                                spentMinutes: subtask.spentMinutes ?? null,
                                actualHours: subtask.actualHours ?? null, // legacy fallback
                                // Campo de fecha para "Mis tareas"
                                date: subtask.date || subtask.workDate || null,
                                // Campo de prioridad
                                priority: subtask.priority || 'none',
                                context: buildContext(clientName, projectName, 'Sin producto'),
                                clientId,
                                clientName,
                                path: subtaskPath,
                                parentTaskPath, // Para poder recomputar rollup del padre
                                parentName: normalizeText(task.name, 'Tarea'),
                                entityRef: subtask,
                            });
                        }
                    });
                });

                Object.entries(project.products || {}).forEach(([productId, product]) => {
                    if (!product) return;
                    const productName = normalizeText(product.name, productId || 'Producto');

                    Object.entries(product.tasks || {}).forEach(([taskId, task]) => {
                        if (!task) return;
                        if (isAssignedToUser(task.assigneeUid)) {
                            const taskPath = `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}`;
                            const parentProductPath = `clients/${clientId}/projects/${projectId}/products/${productId}`;
                            const taskHasSubtasks = hasSubtasks(task);

                            pushAssignment({
                                type: 'task',
                                name: normalizeText(task.name, 'Tarea'),
                                status: normalizeStatus(task.status),
                                manageId: normalizeText(task.manageId),
                                createdAt: task.createdAt || '',
                                updatedAt: task.updatedAt || '',
                                // Campos de tiempo (estimado/empleado) - CRITICAL para mostrar en UI
                                estimatedMinutes: task.estimatedMinutes ?? null,
                                estimatedMinutesRollup: task.estimatedMinutesRollup ?? null, // suma de subtareas
                                estimatedHours: task.estimatedHours ?? null, // legacy fallback
                                spentMinutes: task.spentMinutes ?? null,
                                spentMinutesRollup: task.spentMinutesRollup ?? null, // suma de subtareas empleado
                                actualHours: task.actualHours ?? null, // legacy fallback
                                // Nuevo: flag para bloquear edición de tiempos
                                hasSubtasks: taskHasSubtasks,
                                subtasks: task.subtasks || null, // Para calcular acumulados
                                // Campo de fecha para "Mis tareas"
                                date: task.date || task.workDate || null,
                                // Campo de prioridad
                                priority: task.priority || 'none',
                                context: buildContext(clientName, projectName, productName),
                                clientId,
                                clientName,
                                path: taskPath,
                                parentProductDbPath: parentProductPath, // Para rollup jerárquico
                                entityRef: task,
                            });
                        }
                        Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                            if (!subtask) return;
                            if (isAssignedToUser(subtask.assigneeUid)) {
                                const subtaskPath = `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}/subtasks/${subtaskId}`;
                                const parentTaskPath = `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}`;

                                pushAssignment({
                                    type: 'subtask',
                                    name: normalizeText(subtask.name, 'Subtarea'),
                                    status: normalizeStatus(subtask.status),
                                    manageId: normalizeText(subtask.manageId),
                                    createdAt: subtask.createdAt || '',
                                    updatedAt: subtask.updatedAt || '',
                                    // Campos de tiempo (estimado/empleado) - CRITICAL para mostrar en UI
                                    estimatedMinutes: subtask.estimatedMinutes ?? null,
                                    estimatedHours: subtask.estimatedHours ?? null, // legacy fallback
                                    spentMinutes: subtask.spentMinutes ?? null,
                                    actualHours: subtask.actualHours ?? null, // legacy fallback
                                    // Campo de fecha para "Mis tareas"
                                    date: subtask.date || subtask.workDate || null,
                                    // Campo de prioridad
                                    priority: subtask.priority || 'none',
                                    context: buildContext(clientName, projectName, productName),
                                    clientId,
                                    clientName,
                                    path: subtaskPath,
                                    parentTaskPath, // Para poder recomputar rollup del padre
                                    parentName: normalizeText(task.name, 'Tarea'),
                                    entityRef: subtask,
                                });
                            }
                        });
                    });
                });
            });
        });

        const refreshMyTasksFilters = () => {
            if (myTasksFilterStatus) myTasksFilters.status = myTasksFilterStatus.value || 'all';
            if (myTasksFilterClient) myTasksFilters.client = myTasksFilterClient.value || 'all';
            if (myTasksFilterType) myTasksFilters.type = myTasksFilterType.value || 'all';
            if (myTasksFilterPriority) myTasksFilters.priority = myTasksFilterPriority.value || 'all';
            if (myTasksFilterDate) myTasksFilters.dateFilter = myTasksFilterDate.value || 'all';
            if (myTasksFilterSearch) myTasksFilters.query = String(myTasksFilterSearch.value || '').trim().toLowerCase();
        };

        const initMyTasksFilters = () => {
            if (myTasksFiltersInitialized) return;
            const refresh = () => {
                refreshMyTasksFilters();
                renderMyTasks();
            };
            if (myTasksFilterStatus) myTasksFilterStatus.addEventListener('change', refresh);
            if (myTasksFilterClient) myTasksFilterClient.addEventListener('change', refresh);
            if (myTasksFilterType) myTasksFilterType.addEventListener('change', refresh);
            if (myTasksFilterPriority) myTasksFilterPriority.addEventListener('change', refresh);
            if (myTasksFilterDate) myTasksFilterDate.addEventListener('change', refresh);
            if (myTasksFilterSearch) myTasksFilterSearch.addEventListener('input', refresh);
            myTasksFiltersInitialized = true;
        };

        const updateMyTasksClientFilter = (items) => {
            if (!myTasksFilterClient) return;
            const previous = myTasksFilterClient.value || myTasksFilters.client;
            myTasksFilterClient.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.value = 'all';
            defaultOption.textContent = 'Cliente: Todos';
            myTasksFilterClient.appendChild(defaultOption);

            const clientMap = new Map();
            items.forEach((item) => {
                if (!item.clientId) return;
                clientMap.set(item.clientId, item.clientName || item.clientId);
            });

            Array.from(clientMap.entries())
                .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'es', { sensitivity: 'base' }))
                .forEach(([id, name]) => {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = name;
                    myTasksFilterClient.appendChild(option);
                });

            const hasPrevious = Array.from(myTasksFilterClient.options).some(option => option.value === previous);
            myTasksFilterClient.value = hasPrevious ? previous : 'all';
            myTasksFilters.client = myTasksFilterClient.value;
        };

        updateMyTasksClientFilter(assignments);
        initMyTasksFilters();
        refreshMyTasksFilters();

        const filteredAssignments = assignments.filter((item) => {
            if (myTasksFilters.status !== 'all' && item.status !== myTasksFilters.status) return false;
            if (myTasksFilters.client !== 'all' && item.clientId !== myTasksFilters.client) return false;
            if (myTasksFilters.type !== 'all' && item.type !== myTasksFilters.type) return false;

            // Filtro por prioridad
            if (myTasksFilters.priority !== 'all') {
                const itemPriority = item.priority || 'none';
                if (itemPriority !== myTasksFilters.priority) return false;
            }

            // Filtro por fecha
            if (myTasksFilters.dateFilter !== 'all') {
                const itemDate = item.date || '';
                const today = getTodayLocalYYYYMMDD();
                const next7Days = addDaysToDateString(today, 7);

                switch (myTasksFilters.dateFilter) {
                    case 'no-date':
                        if (itemDate) return false;
                        break;
                    case 'today':
                        if (itemDate !== today) return false;
                        break;
                    case 'next-7-days':
                        if (!itemDate || itemDate < today || itemDate >= next7Days) return false;
                        break;
                    case 'this-month':
                        if (!isInCurrentMonth(itemDate)) return false;
                        break;
                }
            }

            if (myTasksFilters.query) {
                const haystack = [
                    item.name,
                    item.manageId,
                    item.context,
                    item.parentName,
                ].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(myTasksFilters.query)) return false;
            }
            return true;
        });

        const hasActiveFilters = (
            myTasksFilters.status !== 'all' ||
            myTasksFilters.client !== 'all' ||
            myTasksFilters.type !== 'all' ||
            myTasksFilters.priority !== 'all' ||
            myTasksFilters.dateFilter !== 'all' ||
            myTasksFilters.query
        );

        myTasksSummary.textContent = hasActiveFilters
            ? `${filteredAssignments.length} de ${assignments.length} asignadas`
            : (assignments.length === 1 ? '1 asignada' : `${assignments.length} asignadas`);

        const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const isRecent = (item) => {
            const timestamp = getMyTaskTime(item);
            if (!timestamp) return false;
            return (now - timestamp) <= RECENT_WINDOW_MS;
        };

        const inProgressItems = filteredAssignments.filter(item => item.status === 'En proceso');
        const pendingItems = filteredAssignments.filter(item => item.status === 'Pendiente');
        const recentItems = filteredAssignments.filter(item => item.status === 'Finalizado' && isRecent(item));

        setKpiValue(myTasksKpiInProgress, inProgressItems.length);
        setKpiValue(myTasksKpiPending, pendingItems.length);
        setKpiValue(myTasksKpiRecent, recentItems.length);

        const MINI_LIST_LIMIT = 4;
        const buildMiniRow = (item) => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2 rounded-lg border border-border-dark bg-white dark:bg-surface-dark px-3 py-2';

            const info = document.createElement('div');
            info.className = 'min-w-0 flex flex-col gap-1';

            const name = document.createElement('p');
            name.className = 'text-sm font-semibold text-gray-900 dark:text-white truncate';
            name.textContent = item.name;

            const context = document.createElement('p');
            context.className = 'text-[11px] text-text-muted truncate';
            context.textContent = item.context;

            info.append(name, context);

            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'text-xs font-semibold text-primary hover:underline';
            openBtn.textContent = 'Abrir';
            openBtn.disabled = !item.manageId;
            if (!item.manageId) {
                openBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (item.manageId) openDetailPage(item.manageId);
            });

            row.append(info, openBtn);
            return row;
        };

        const renderMiniList = (items, listEl, emptyEl, countEl) => {
            if (!listEl || !emptyEl) return;
            listEl.innerHTML = '';
            const sorted = [...items].sort(compareByRecent).slice(0, MINI_LIST_LIMIT);
            sorted.forEach(item => listEl.appendChild(buildMiniRow(item)));
            const hasItems = sorted.length > 0;
            toggleMiniEmpty(listEl, emptyEl, hasItems);
            setMiniCount(countEl, items.length);
        };

        // Commented out redundant mini lists (removed from UI)
        // renderMiniList(inProgressItems, myTasksInProgressList, myTasksInProgressEmpty, myTasksInProgressCount);
        // renderMiniList(blockedItems, myTasksBlockedList, myTasksBlockedEmpty, myTasksBlockedCount);
        // renderMiniList(recentItems, myTasksRecentList, myTasksRecentEmpty, myTasksRecentCount);

        if (!filteredAssignments.length) {
            myTasksEmpty.textContent = hasActiveFilters
                ? 'No hay tareas para los filtros seleccionados.'
                : 'No tienes tareas asignadas.';
            myTasksEmpty.classList.remove('hidden');
            return;
        }

        myTasksEmpty.classList.add('hidden');

        const grouped = {
            'En proceso': [],
            'Pendiente': [],
            'Finalizado': [],
        };

        filteredAssignments.forEach((item) => {
            if (grouped[item.status]) grouped[item.status].push(item);
        });

        // Ordenar cada grupo usando el modo de ordenación global
        Object.keys(grouped).forEach((status) => {
            grouped[status] = sortActivities(grouped[status], currentSortMode);
        });

        const applyStatusChange = async (item, nextStatus) => {
            await updateStatusAtPath(item.path, nextStatus, { source: 'my_tasks' });
            item.status = nextStatus;
            if (item.entityRef) item.entityRef.status = nextStatus;
            renderMyTasks();
        };

        const runQuickStatusChange = async (item, nextStatus) => {
            try {
                await applyStatusChange(item, nextStatus);
            } catch (error) {
                console.error('Error updating status:', error);
                alert(`No se pudo actualizar el estado: ${error.message}`);
            }
        };

        const buildActionButton = (label, handler, options = {}) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = options.primary
                ? 'h-8 px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition-colors'
                : 'h-8 px-3 rounded-lg border border-border-dark bg-white dark:bg-surface-dark text-text-muted hover:text-gray-900 dark:hover:text-white text-xs font-semibold transition-colors';
            button.textContent = label;
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handler();
            });
            return button;
        };

        const buildMyTaskRow = (item) => {
            const card = document.createElement('div');
            card.className = 'rounded-lg border border-border-dark bg-white dark:bg-surface-dark py-3 px-4';

            // Main layout: flex con gap reducido para acercar bloques
            const mainRow = document.createElement('div');
            mainRow.className = 'flex flex-wrap items-center gap-3';

            // ===== BLOQUE IZQUIERDO: Tipo + Estado (2 líneas, centrado) =====
            const leftCol = document.createElement('div');
            leftCol.className = 'w-[140px] shrink-0 flex flex-col items-center justify-center gap-1.5';

            // Línea 1: Badge tipo (Tarea/Subtarea) - ancho fijo, centrado
            const badge = document.createElement('span');
            const isSubtask = item.type === 'subtask';
            badge.className = isSubtask
                ? 'h-7 w-[110px] rounded-md text-xs font-semibold inline-flex items-center justify-center bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
                : 'h-7 w-[110px] rounded-md text-xs font-semibold inline-flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
            badge.textContent = isSubtask ? 'Subtarea' : 'Tarea';

            // Línea 2: Control de estado - ancho fijo para centrar
            const statusControl = createStatusControl({
                status: item.status,
                onChange: async (nextStatus) => {
                    await applyStatusChange(item, nextStatus);
                },
            });
            statusControl.classList.add('h-7', 'w-[110px]');

            leftCol.append(badge, statusControl);

            // ===== COLUMNA CENTRAL: Nombre + Contexto (flex-1 para ocupar espacio) =====
            const centerCol = document.createElement('div');
            centerCol.className = 'min-w-0 flex-1 flex flex-col gap-1';

            // Hacer el nombre clickable
            const titleRow = document.createElement('div');
            titleRow.className = 'flex items-center gap-2 flex-wrap min-w-0';

            const titleLink = document.createElement('button');
            titleLink.type = 'button';
            titleLink.className = 'text-gray-900 dark:text-white font-semibold truncate hover:text-primary dark:hover:text-primary transition-colors cursor-pointer text-left';
            titleLink.textContent = item.name;
            titleLink.disabled = !item.manageId;
            if (!item.manageId) {
                titleLink.classList.add('cursor-not-allowed', 'opacity-60');
                titleLink.classList.remove('hover:text-primary');
            }
            titleLink.addEventListener('click', () => {
                if (item.manageId) openDetailPage(item.manageId);
            });

            titleRow.appendChild(titleLink);

            if (item.manageId) {
                const chip = createIdChip(item.manageId);
                chip.classList.add('text-[11px]', 'font-mono');
                titleRow.appendChild(chip);
            }

            const context = document.createElement('p');
            context.className = 'text-xs text-text-muted truncate';
            context.textContent = item.context;

            centerCol.append(titleRow, context);

            // ===== BLOQUE DERECHO: Prioridad + Fecha + Tiempo (grid 3 columnas IGUALES) =====
            const rightCol = document.createElement('div');
            rightCol.className = 'ml-auto grid grid-cols-3 gap-3 shrink-0';

            // Ancho uniforme para los 3 controles
            const CONTROL_WIDTH = 'w-[120px]';

            // --- Columna 1: Prioridad ---
            const priorityCol = document.createElement('div');
            priorityCol.className = 'flex flex-col items-center gap-1';

            const priorityLabel = document.createElement('span');
            priorityLabel.className = 'text-xs font-semibold text-text-muted text-center';
            priorityLabel.textContent = 'Prioridad';

            const priorityWrapper = document.createElement('div');
            priorityWrapper.className = `relative ${CONTROL_WIDTH}`;

            let currentPriority = item.priority || 'none';

            const priorityChip = document.createElement('button');
            priorityChip.type = 'button';
            priorityChip.className = priorityChipClass(currentPriority);
            priorityChip.textContent = PRIORITY_LABELS[currentPriority];
            priorityChip.title = 'Cambiar prioridad';

            // Menú contextual de prioridad
            const priorityMenu = document.createElement('div');
            priorityMenu.className = 'hidden absolute left-0 top-full mt-1 w-36 bg-white dark:bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-hidden z-50';

            const updatePriorityChip = (p) => {
                priorityChip.className = priorityChipClass(p);
                priorityChip.textContent = PRIORITY_LABELS[p];
            };

            PRIORITY_VALUES.forEach(val => {
                const optBtn = document.createElement('button');
                optBtn.type = 'button';
                optBtn.className = 'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 text-left';

                // Dot de color según prioridad
                const dotColor = val === 'none' ? 'bg-emerald-500' : val === 'low' ? 'bg-yellow-500' : val === 'medium' ? 'bg-orange-500' : 'bg-red-500';
                optBtn.innerHTML = `
                    <span class="inline-flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full ${dotColor}"></span>
                        ${PRIORITY_LABELS[val]}
                    </span>
                    <span class="material-symbols-outlined text-[16px] text-text-muted ${val === currentPriority ? '' : 'opacity-0'}">check</span>
                `;

                optBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    priorityMenu.classList.add('hidden');

                    if (val === currentPriority) return;

                    const oldPriority = currentPriority;
                    currentPriority = val;
                    item.priority = val;
                    if (item.entityRef) item.entityRef.priority = val;
                    updatePriorityChip(val);

                    // Actualizar checks en el menú
                    priorityMenu.querySelectorAll('button').forEach((btn, idx) => {
                        const check = btn.querySelector('.material-symbols-outlined');
                        if (check) check.classList.toggle('opacity-0', PRIORITY_VALUES[idx] !== val);
                    });

                    if (!item.path) return;

                    try {
                        await updateActivityFields(item.path, { priority: val });
                    } catch (error) {
                        console.error('Error al guardar prioridad:', error);
                        // Revertir
                        currentPriority = oldPriority;
                        item.priority = oldPriority;
                        if (item.entityRef) item.entityRef.priority = oldPriority;
                        updatePriorityChip(oldPriority);
                    }
                });

                priorityMenu.appendChild(optBtn);
            });

            // Toggle menú prioridad
            priorityChip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeAllActionMenus(priorityMenu);
                priorityMenu.classList.toggle('hidden');
            });

            // Cerrar menú al hacer click fuera
            document.addEventListener('click', (e) => {
                if (!priorityWrapper.contains(e.target)) {
                    priorityMenu.classList.add('hidden');
                }
            });

            priorityWrapper.append(priorityChip, priorityMenu);
            priorityCol.append(priorityLabel, priorityWrapper);

            // --- Columna 2: Fecha ---
            const dateCol = document.createElement('div');
            dateCol.className = 'flex flex-col items-center gap-1';

            const dateLabel = document.createElement('button');
            dateLabel.type = 'button';
            dateLabel.className = 'text-xs font-semibold text-text-muted text-center whitespace-nowrap cursor-pointer hover:text-red-500 hover:underline transition-colors';
            dateLabel.textContent = 'Fecha';
            dateLabel.title = item.date ? 'Clic para quitar fecha' : 'Fecha de ejecución';

            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = `h-9 ${CONTROL_WIDTH} bg-background dark:bg-surface-dark border border-border-light dark:border-border-dark rounded px-2 text-sm text-center focus:border-primary focus:ring-1 focus:ring-primary`;
            dateInput.value = item.date || '';

            // Status para fecha
            const dateStatus = document.createElement('div');
            dateStatus.className = 'text-[10px] h-3 transition-opacity opacity-0';

            const saveDateToDb = async (newDate) => {
                if (!item.path) return;
                dateStatus.textContent = 'Guardando...';
                dateStatus.className = 'text-[10px] h-3 text-blue-600 dark:text-blue-400 opacity-100';
                try {
                    await updateActivityFields(item.path, { date: newDate || null });
                    item.date = newDate || null;
                    if (item.entityRef) item.entityRef.date = newDate || null;
                    dateLabel.title = newDate ? 'Clic para quitar fecha' : 'Fecha de ejecución';
                    dateStatus.textContent = '✓ Guardado';
                    dateStatus.className = 'text-[10px] h-3 text-green-600 dark:text-green-400 opacity-100';
                    setTimeout(() => { dateStatus.className = 'text-[10px] h-3 opacity-0'; }, 2000);
                } catch (error) {
                    console.error('Error al guardar fecha:', error);
                    dateStatus.textContent = '✗ Error';
                    dateStatus.className = 'text-[10px] h-3 text-red-600 dark:text-red-400 opacity-100';
                    setTimeout(() => { dateStatus.className = 'text-[10px] h-3 opacity-0'; }, 4000);
                }
            };

            dateInput.addEventListener('change', () => saveDateToDb(dateInput.value));

            // Clic en "Fecha" para limpiar (con confirmación si hay fecha)
            dateLabel.addEventListener('click', (e) => {
                e.preventDefault();
                if (item.date) {
                    if (confirm('¿Quitar fecha?')) {
                        dateInput.value = '';
                        saveDateToDb(null);
                    }
                }
            });

            dateCol.append(dateLabel, dateInput, dateStatus);

            // --- Columna 3: Tiempo Estimado ---
            const timeCol = document.createElement('div');
            timeCol.className = 'flex flex-col items-center gap-1';

            const timeLabel = document.createElement('label');
            timeLabel.className = 'text-xs font-semibold text-text-muted text-center whitespace-nowrap';
            timeLabel.textContent = 'Tiempo';

            // Helper para formatear minutos
            const formatMinutes = (mins) => {
                if (mins === 0) return '0m';
                const hours = Math.floor(mins / 60);
                const minutes = mins % 60;
                if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
                if (hours > 0) return `${hours}h`;
                return `${minutes}m`;
            };

            // Contenedor para input/display + indicador de estado
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'flex flex-col items-center gap-1';

            // NUEVA LÓGICA: Detectar si es tarea con subtareas → NO editable
            const isTaskWithSubtasks = item.type === 'task' && item.hasSubtasks === true;

            if (isTaskWithSubtasks) {
                // TAREA CON SUBTAREAS: Mostrar solo acumulado de subtareas (READ-ONLY), SIN texto adicional
                const aggregated = aggregateLeafTimes(item, 'task');
                const totalEstimated = aggregated.estimated;

                // Display de tiempo estimado (read-only) - ancho uniforme
                const readOnlyDisplay = document.createElement('div');
                readOnlyDisplay.className = `h-9 ${CONTROL_WIDTH} bg-gray-100 dark:bg-gray-700/50 border border-border-light dark:border-border-dark rounded px-3 text-sm text-center flex items-center justify-center text-text-muted`;
                readOnlyDisplay.textContent = formatMinutes(totalEstimated);
                readOnlyDisplay.title = `Acumulado de ${Object.keys(item.subtasks || {}).length} subtarea(s)`;

                inputWrapper.appendChild(readOnlyDisplay);
                // NO añadir rollupInfo ni spentInfo según requisito
            } else {
                // TAREA SIN SUBTAREAS o SUBTAREA: Input editable
                // Parsear estimatedMinutes (fuente de verdad) o estimatedHours legacy como fallback
                const getEstimatedMinutes = (item) => {
                    if (item.estimatedMinutes != null) return parseInt(item.estimatedMinutes) || 0;
                    if (item.estimatedHours != null) return Math.round((parseFloat(item.estimatedHours) || 0) * 60);
                    return 0;
                };

                const manualMinutes = getEstimatedMinutes(item);

                const durationInput = createDurationInput({
                    valueMinutes: manualMinutes,
                    placeholder: 'Ej: 1h 30m',
                    className: `h-9 ${CONTROL_WIDTH} text-center focus:border-primary focus:ring-1 focus:ring-primary`,
                    onCommit: async (minutes) => {
                        if (!item.path) {
                            console.error('No se puede actualizar: item.path no disponible', { item });
                            alert('Error: No se puede guardar (ruta de Firebase no disponible)');
                            durationInput.setDurationValue(getEstimatedMinutes(item));
                            return;
                        }

                        let statusIndicator = inputWrapper.querySelector('[data-save-status]');
                        if (!statusIndicator) {
                            statusIndicator = document.createElement('div');
                            statusIndicator.setAttribute('data-save-status', '');
                            statusIndicator.className = 'text-[10px] h-3 transition-opacity';
                            inputWrapper.appendChild(statusIndicator);
                        }

                        statusIndicator.textContent = 'Guardando...';
                        statusIndicator.className = 'text-[10px] h-3 text-blue-600 dark:text-blue-400 opacity-100';

                        try {
                            await updateActivityFields(item.path, { estimatedMinutes: minutes });

                            item.estimatedMinutes = minutes;
                            if (item.entityRef) {
                                item.entityRef.estimatedMinutes = minutes;
                                item.entityRef.updatedAt = new Date().toISOString();
                            }

                            try {
                                await propagateRollupHierarchy(item.path);
                            } catch (rollupError) {
                                console.error('Error al propagar rollup (no crítico):', rollupError);
                            }

                            statusIndicator.textContent = '✓ Guardado';
                            statusIndicator.className = 'text-[10px] h-3 text-green-600 dark:text-green-400 opacity-100';
                            setTimeout(() => { statusIndicator.className = 'text-[10px] h-3 opacity-0'; }, 2000);
                        } catch (error) {
                            console.error('Error al actualizar tiempo estimado:', error);
                            statusIndicator.textContent = '✗ Error';
                            statusIndicator.className = 'text-[10px] h-3 text-red-600 dark:text-red-400 opacity-100';
                            durationInput.setDurationValue(getEstimatedMinutes(item));
                            setTimeout(() => { statusIndicator.className = 'text-[10px] h-3 opacity-0'; }, 4000);
                        }
                    }
                });

                inputWrapper.appendChild(durationInput);

                // Para subtareas, mostrar tiempo empleado si existe
                if (item.type === 'subtask') {
                    const getSpentMinutes = (item) => {
                        if (item.spentMinutes != null) return parseInt(item.spentMinutes) || 0;
                        if (item.actualHours != null) return Math.round((parseFloat(item.actualHours) || 0) * 60);
                        return 0;
                    };
                    const spentMins = getSpentMinutes(item);
                    if (spentMins > 0) {
                        const spentInfo = document.createElement('div');
                        spentInfo.className = 'text-xs text-text-muted text-center mt-1';
                        spentInfo.textContent = `Empleado: ${formatMinutes(spentMins)}`;
                        inputWrapper.appendChild(spentInfo);
                    }
                }

                // Para tareas sin subtareas, mostrar total si hay valor
                if (item.type === 'task' && manualMinutes > 0) {
                    const totalInfo = document.createElement('div');
                    totalInfo.className = 'text-xs text-text-muted text-center mt-1';
                    totalInfo.textContent = `Total: ${formatMinutes(manualMinutes)}`;
                    inputWrapper.appendChild(totalInfo);
                }
            }

            timeCol.append(timeLabel, inputWrapper);

            // Añadir las 3 columnas al bloque derecho (grid)
            rightCol.append(priorityCol, dateCol, timeCol);

            mainRow.append(leftCol, centerCol, rightCol);
            card.appendChild(mainRow);

            return card;
        };

        const appendGroup = (label, items, emptyLabel, forceEmpty = false) => {
            if (!items.length && !forceEmpty) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'flex flex-col gap-3';

            const header = document.createElement('div');
            header.className = 'flex items-center justify-between';

            const title = document.createElement('h4');
            title.className = 'text-xs font-semibold text-text-muted uppercase tracking-wide';
            title.textContent = label;

            const count = document.createElement('span');
            count.className = 'text-text-muted text-xs font-semibold';
            count.textContent = String(items.length);

            header.append(title, count);
            wrapper.appendChild(header);

            const list = document.createElement('div');
            list.className = 'flex flex-col gap-3';
            items.forEach(item => list.appendChild(buildMyTaskRow(item)));
            wrapper.appendChild(list);

            if (!items.length && emptyLabel) {
                const empty = document.createElement('p');
                empty.className = 'text-text-muted text-sm';
                empty.textContent = emptyLabel;
                wrapper.appendChild(empty);
            }

            myTasksList.appendChild(wrapper);
        };

        const finalStatusFilter = myTasksFilters.status === 'Finalizado';
        const finalizedList = finalStatusFilter
            ? grouped['Finalizado']
            : grouped['Finalizado'].filter(isRecent).slice(0, 10);
        const showFinalGroupEmpty = !finalStatusFilter && grouped['Finalizado'].length > 0 && finalizedList.length === 0;

        appendGroup('En curso', grouped['En proceso'], 'Sin tareas en curso.');
        appendGroup('Pendientes', grouped['Pendiente'], 'Sin tareas pendientes.');
        appendGroup(
            finalStatusFilter ? 'Finalizadas' : 'Finalizadas recientes',
            finalizedList,
            'Sin finalizadas recientes.',
            finalStatusFilter || showFinalGroupEmpty
        );
    };

    const CALENDAR_STATUS_DOT = {
        'Pendiente': 'bg-amber-400',
        'En proceso': 'bg-blue-400',
        'Finalizado': 'bg-emerald-400'
    };
    const CALENDAR_TYPE_LABELS = { task: 'Tarea', subtask: 'Subtarea' };
    const CALENDAR_PRIORITY_DOT = {
        'none': '',
        'low': 'bg-blue-400',
        'medium': 'bg-yellow-400',
        'high': 'bg-red-500'
    };

    const hasCalendar = () => (
        calendarMonthLabel &&
        calendarGrid &&
        calendarPrevBtn &&
        calendarNextBtn &&
        calendarTodayBtn
    );

    const parseWorkDate = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const parts = raw.split('-');
        if (parts.length === 3) {
            const year = Number(parts[0]);
            const month = Number(parts[1]);
            const day = Number(parts[2]);
            if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
                return new Date(year, month - 1, day);
            }
        }
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    };

    const toDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const addDays = (date, amount) => {
        const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        copy.setDate(copy.getDate() + amount);
        return copy;
    };

    const startOfWeek = (date) => {
        const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = (copy.getDay() + 6) % 7;
        copy.setDate(copy.getDate() - day);
        return copy;
    };

    const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
    const weekShortFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
    const weekLongFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const dayFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    const buildCalendarItems = () => {
        const items = [];
        const normalizeText = (value, fallback = '') => {
            const text = String(value || '').trim();
            return text || fallback;
        };
        const buildPath = (...parts) => parts.filter(Boolean).join(' / ');

        const pushItem = ({ type, name, manageId, status, workDate, dateField, priority, path }) => {
            // Usar dateField (campo 'date') primero, luego workDate como fallback
            const date = parseWorkDate(dateField) || parseWorkDate(workDate);
            if (!date) return;
            items.push({
                type,
                typeLabel: CALENDAR_TYPE_LABELS[type] || 'Tarea',
                name: normalizeText(name, 'Tarea'),
                manageId: String(manageId || '').trim(),
                priority: priority || 'none',
                status: normalizeStatus(status),
                date,
                dateKey: toDateKey(date),
                path: normalizeText(path, '-')
            });
        };

        allClients.forEach((client) => {
            if (!client) return;
            const clientName = normalizeText(client.name, client.id || 'Cliente');
            const projects = client.projects || {};

            Object.entries(projects).forEach(([projectId, project]) => {
                if (!project) return;
                const projectName = normalizeText(project.name, projectId || 'Proyecto');

                Object.entries(project.tasks || {}).forEach(([taskId, task]) => {
                    if (!task) return;
                    const taskName = normalizeText(task.name, 'Tarea');
                    const taskPath = buildPath(clientName, projectName);
                    pushItem({
                        type: 'task',
                        name: taskName,
                        manageId: task.manageId,
                        status: task.status,
                        workDate: task.workDate,
                        dateField: task.date,
                        priority: task.priority,
                        path: taskPath
                    });

                    Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                        if (!subtask) return;
                        const subtaskName = normalizeText(subtask.name, 'Subtarea');
                        pushItem({
                            type: 'subtask',
                            name: subtaskName,
                            manageId: subtask.manageId,
                            status: subtask.status,
                            workDate: subtask.workDate,
                            dateField: subtask.date,
                            priority: subtask.priority,
                            path: buildPath(clientName, projectName, taskName)
                        });
                    });
                });

                Object.entries(project.products || {}).forEach(([productId, product]) => {
                    if (!product) return;
                    const productName = normalizeText(product.name, productId || 'Producto');

                    Object.entries(product.tasks || {}).forEach(([taskId, task]) => {
                        if (!task) return;
                        const taskName = normalizeText(task.name, 'Tarea');
                        const taskPath = buildPath(clientName, projectName, productName);
                        pushItem({
                            type: 'task',
                            name: taskName,
                            manageId: task.manageId,
                            status: task.status,
                            workDate: task.workDate,
                            dateField: task.date,
                            priority: task.priority,
                            path: taskPath
                        });

                        Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                            if (!subtask) return;
                            const subtaskName = normalizeText(subtask.name, 'Subtarea');
                            pushItem({
                                type: 'subtask',
                                name: subtaskName,
                                manageId: subtask.manageId,
                                status: subtask.status,
                                workDate: subtask.workDate,
                                dateField: subtask.date,
                                priority: subtask.priority,
                                path: buildPath(clientName, projectName, productName, taskName)
                            });
                        });
                    });
                });
            });
        });

        return items;
    };

    const buildEventsByDate = () => {
        const map = new Map();
        calendarItems.forEach((item) => {
            if (!item.dateKey) return;
            if (!map.has(item.dateKey)) map.set(item.dateKey, []);
            map.get(item.dateKey).push(item);
        });
        map.forEach((list) => {
            list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        });
        return map;
    };

    const updateCalendarWeekdays = () => {
        if (!calendarWeekdays) return;
        calendarWeekdays.innerHTML = '';
        const labels = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
        labels.forEach((label) => {
            const span = document.createElement('span');
            span.className = 'text-center';
            span.textContent = label;
            calendarWeekdays.appendChild(span);
        });
    };

    const updateCalendarHeader = () => {
        if (!calendarMonthLabel) return;
        const viewDate = calendarState.date;
        if (calendarState.view === 'month') {
            const label = monthFormatter.format(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
            calendarMonthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
            if (calendarViewLabel) calendarViewLabel.textContent = 'Mes';
            return;
        }

        if (calendarState.view === 'week') {
            const start = startOfWeek(viewDate);
            const end = addDays(start, 6);
            calendarMonthLabel.textContent = `${weekShortFormatter.format(start)} - ${weekLongFormatter.format(end)}`;
            if (calendarViewLabel) calendarViewLabel.textContent = 'Semana';
            return;
        }

        calendarMonthLabel.textContent = dayFormatter.format(viewDate);
        if (calendarViewLabel) calendarViewLabel.textContent = 'D\u00EDa';
    };

    const updateCalendarViewButtons = () => {
        if (!calendarViewButtons.length) return;
        calendarViewButtons.forEach((btn) => {
            const isActive = String(btn.dataset.calendarView || '') === calendarState.view;
            btn.classList.toggle('bg-primary', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('border-primary', isActive);
            btn.classList.toggle('bg-white', !isActive);
            btn.classList.toggle('dark:bg-surface-darker', !isActive);
            btn.classList.toggle('text-text-muted', !isActive);
        });
    };

    const createCalendarEventButton = (event, { compact = false } = {}) => {
        const button = document.createElement('button');
        button.type = 'button';

        // Añadir borde de color según prioridad
        const priorityBorderClass = {
            'none': 'border-border-dark',
            'low': 'border-blue-400',
            'medium': 'border-yellow-400',
            'high': 'border-red-500 border-l-4'
        }[event.priority || 'none'] || 'border-border-dark';

        button.className = compact
            ? `flex items-center gap-2 rounded-md border ${priorityBorderClass} bg-white/80 dark:bg-surface-dark/80 px-2 py-1 text-[11px] text-gray-900 dark:text-white truncate`
            : `flex items-start gap-3 rounded-lg border ${priorityBorderClass} bg-white dark:bg-surface-darker px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-white/5 transition-colors`;
        button.title = event.name || '';

        const dot = document.createElement('span');
        const dotClass = CALENDAR_STATUS_DOT[event.status] || 'bg-gray-300';
        dot.className = `mt-1 size-2 rounded-full ${dotClass} shrink-0`;

        if (compact) {
            // En modo compacto, añadir indicador de prioridad si es alta
            if (event.priority === 'high') {
                const priorityIcon = document.createElement('span');
                priorityIcon.className = 'text-red-500 text-[10px]';
                priorityIcon.textContent = '!';
                button.append(priorityIcon);
            }
            const label = document.createElement('span');
            label.className = 'truncate';
            label.textContent = event.name || '';
            button.append(dot, label);
        } else {
            const textWrap = document.createElement('div');
            textWrap.className = 'min-w-0 flex-1';

            const metaRow = document.createElement('div');
            metaRow.className = 'flex items-center gap-2';

            const meta = document.createElement('p');
            meta.className = 'text-[11px] uppercase tracking-[0.2em] text-text-muted';
            meta.textContent = event.typeLabel || 'Tarea';

            // Badge de prioridad si no es 'none'
            if (event.priority && event.priority !== 'none') {
                const priorityBadge = document.createElement('span');
                const badgeColors = {
                    'low': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                    'medium': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
                    'high': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                };
                priorityBadge.className = `text-[9px] px-1 py-0.5 rounded font-medium ${badgeColors[event.priority] || ''}`;
                priorityBadge.textContent = PRIORITY_LABELS[event.priority] || '';
                metaRow.append(meta, priorityBadge);
            } else {
                metaRow.appendChild(meta);
            }

            const title = document.createElement('p');
            title.className = 'text-sm font-semibold text-gray-900 dark:text-white truncate';
            title.textContent = event.name || '';

            const path = document.createElement('p');
            path.className = 'text-xs text-text-muted truncate';
            path.textContent = event.path || '-';

            textWrap.append(metaRow, title, path);
            button.append(dot, textWrap);
        }

        const manageId = String(event.manageId || '').trim();
        if (manageId) {
            button.addEventListener('click', () => {
                openDetailViewForManageId(manageId);
            });
        } else {
            button.disabled = true;
            button.classList.add('opacity-60', 'cursor-default');
        }

        return button;
    };

    const renderMonthView = (eventsByDate) => {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '';
        calendarGrid.className = 'grid grid-cols-7 gap-2 text-sm';

        const viewDate = new Date(calendarState.date.getFullYear(), calendarState.date.getMonth(), 1);
        const startDay = (viewDate.getDay() + 6) % 7;
        const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
        const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
        const today = new Date();

        let hasEvents = false;

        for (let i = 0; i < totalCells; i += 1) {
            const cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), i - startDay + 1);
            const isCurrentMonth = cellDate.getMonth() === viewDate.getMonth();
            const dateKey = toDateKey(cellDate);
            const events = isCurrentMonth ? (eventsByDate.get(dateKey) || []) : [];

            const cell = document.createElement('div');
            cell.className = 'min-h-[96px] rounded-lg border border-border-dark bg-white dark:bg-surface-darker p-2 flex flex-col gap-1';

            if (!isCurrentMonth) {
                cell.classList.add('opacity-40');
            }

            const dayLabel = document.createElement('div');
            dayLabel.className = 'text-xs font-semibold text-gray-900 dark:text-white';
            dayLabel.textContent = String(cellDate.getDate());

            const isToday = cellDate.getDate() === today.getDate()
                && cellDate.getMonth() === today.getMonth()
                && cellDate.getFullYear() === today.getFullYear();
            if (isToday) {
                dayLabel.classList.add('text-primary');
                cell.classList.add('ring-2', 'ring-primary/50');
            }

            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const maxEvents = 2;
            events.slice(0, maxEvents).forEach((event) => {
                list.appendChild(createCalendarEventButton(event, { compact: true }));
            });
            if (events.length > maxEvents) {
                const more = document.createElement('span');
                more.className = 'text-[10px] text-text-muted';
                more.textContent = `+${events.length - maxEvents} mas`;
                list.appendChild(more);
            }
            if (events.length) hasEvents = true;

            cell.append(dayLabel, list);
            calendarGrid.appendChild(cell);
        }

        if (calendarEmpty) {
            calendarEmpty.classList.toggle('hidden', hasEvents);
        }
    };

    const renderWeekView = (eventsByDate) => {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '';
        calendarGrid.className = 'grid grid-cols-7 gap-3 text-sm';

        const start = startOfWeek(calendarState.date);
        let hasEvents = false;

        for (let i = 0; i < 7; i += 1) {
            const cellDate = addDays(start, i);
            const dateKey = toDateKey(cellDate);
            const events = eventsByDate.get(dateKey) || [];

            const cell = document.createElement('div');
            cell.className = 'rounded-lg border border-border-dark bg-white dark:bg-surface-darker p-3 flex flex-col gap-2 min-h-[180px]';

            const header = document.createElement('div');
            header.className = 'flex items-center justify-between gap-2';

            const label = document.createElement('span');
            label.className = 'text-xs font-semibold text-gray-900 dark:text-white';
            label.textContent = weekShortFormatter.format(cellDate);

            header.appendChild(label);

            const list = document.createElement('div');
            list.className = 'flex flex-col gap-2';
            events.forEach((event) => {
                list.appendChild(createCalendarEventButton(event));
            });
            if (events.length) hasEvents = true;

            cell.append(header, list);
            calendarGrid.appendChild(cell);
        }

        if (calendarEmpty) {
            calendarEmpty.classList.toggle('hidden', hasEvents);
        }
    };

    const renderDayView = (eventsByDate) => {
        if (!calendarDayList) return;
        calendarDayList.innerHTML = '';
        const dateKey = toDateKey(calendarState.date);
        const events = eventsByDate.get(dateKey) || [];

        if (!events.length) {
            if (calendarEmpty) calendarEmpty.classList.remove('hidden');
            return;
        }

        if (calendarEmpty) calendarEmpty.classList.add('hidden');
        events.forEach((event) => {
            calendarDayList.appendChild(createCalendarEventButton(event));
        });
    };

    const renderCalendar = () => {
        if (!hasCalendar()) return;
        updateCalendarViewButtons();
        updateCalendarHeader();

        const eventsByDate = buildEventsByDate();

        if (calendarState.view === 'day') {
            calendarWeekdays?.classList.add('hidden');
            calendarGrid?.classList.add('hidden');
            calendarDayList?.classList.remove('hidden');
            renderDayView(eventsByDate);
            return;
        }

        calendarDayList?.classList.add('hidden');
        calendarGrid?.classList.remove('hidden');
        calendarWeekdays?.classList.remove('hidden');
        updateCalendarWeekdays();

        if (calendarState.view === 'week') {
            renderWeekView(eventsByDate);
        } else {
            renderMonthView(eventsByDate);
        }
    };

    const setCalendarView = (viewValue) => {
        const view = String(viewValue || '').trim();
        if (!['month', 'week', 'day'].includes(view)) return;
        calendarState.view = view;
        renderCalendar();
    };

    const shiftCalendarDate = (direction) => {
        const amount = Number(direction) || 0;
        if (!amount) return;
        const base = calendarState.date;
        if (calendarState.view === 'month') {
            calendarState.date = new Date(base.getFullYear(), base.getMonth() + amount, 1);
        } else if (calendarState.view === 'week') {
            calendarState.date = addDays(base, amount * 7);
        } else {
            calendarState.date = addDays(base, amount);
        }
        renderCalendar();
    };

    const updateCalendarItems = () => {
        if (!hasCalendar()) return;
        calendarItems = buildCalendarItems();
        renderCalendar();
    };

    // ==========================================
    // TIMELINE / CRONOGRAMA
    // ==========================================

    const hasTimeline = () => Boolean(timelineContainer);

    // Colores de barra por prioridad (estilo Gantt)
    const TIMELINE_PRIORITY_COLORS = {
        'none': { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-700 dark:text-emerald-300' },
        'low': { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-700 dark:text-yellow-300' },
        'medium': { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-700 dark:text-orange-300' },
        'high': { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-700 dark:text-red-300' }
    };

    // Estilos por estado
    const TIMELINE_STATUS_STYLES = {
        'Pendiente': 'border-dashed opacity-70',
        'En proceso': 'border-solid',
        'Finalizado': 'opacity-40 grayscale'
    };

    // Construir items del timeline con jerarquía completa
    const buildTimelineItems = () => {
        const items = [];
        const normalizeText = (value, fallback = '') => String(value || '').trim() || fallback;

        const getEstimatedMinutes = (entity) => {
            if (entity.estimatedMinutes != null) return parseInt(entity.estimatedMinutes) || 0;
            if (entity.estimatedHours != null) return Math.round((parseFloat(entity.estimatedHours) || 0) * 60);
            return 0;
        };

        const getSubtasksTotalMinutes = (subtasks) => {
            if (!subtasks || typeof subtasks !== 'object') return 0;
            return Object.values(subtasks).reduce((sum, st) => sum + getEstimatedMinutes(st), 0);
        };

        allClients.forEach((client) => {
            if (!client) return;
            const clientId = client.id || '';
            const clientName = normalizeText(client.name, clientId || 'Cliente');
            const projects = client.projects || {};

            Object.entries(projects).forEach(([projectId, project]) => {
                if (!project) return;
                const projectName = normalizeText(project.name, projectId || 'Proyecto');

                // Tareas directas del proyecto (sin producto)
                Object.entries(project.tasks || {}).forEach(([taskId, task]) => {
                    if (!task) return;
                    const taskDate = parseWorkDate(task.date) || parseWorkDate(task.workDate);
                    if (!taskDate) return; // Solo incluir si tiene fecha

                    const hasSubtasksFlag = hasSubtasks(task);
                    const taskMinutes = hasSubtasksFlag
                        ? getSubtasksTotalMinutes(task.subtasks)
                        : getEstimatedMinutes(task);

                    items.push({
                        id: `task-${clientId}-${projectId}-${taskId}`,
                        type: 'task',
                        name: normalizeText(task.name, 'Tarea'),
                        manageId: task.manageId || '',
                        status: normalizeStatus(task.status),
                        priority: task.priority || 'none',
                        date: taskDate,
                        durationMinutes: taskMinutes,
                        assigneeUid: task.assigneeUid || '',
                        clientId,
                        clientName,
                        projectId,
                        projectName,
                        productId: null,
                        productName: null,
                        parentId: `project-${clientId}-${projectId}`,
                        path: `clients/${clientId}/projects/${projectId}/tasks/${taskId}`
                    });

                    // Subtareas
                    Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                        if (!subtask) return;
                        const subtaskDate = parseWorkDate(subtask.date) || parseWorkDate(subtask.workDate);
                        if (!subtaskDate) return;

                        items.push({
                            id: `subtask-${clientId}-${projectId}-${taskId}-${subtaskId}`,
                            type: 'subtask',
                            name: normalizeText(subtask.name, 'Subtarea'),
                            manageId: subtask.manageId || '',
                            status: normalizeStatus(subtask.status),
                            priority: subtask.priority || 'none',
                            date: subtaskDate,
                            durationMinutes: getEstimatedMinutes(subtask),
                            assigneeUid: subtask.assigneeUid || '',
                            clientId,
                            clientName,
                            projectId,
                            projectName,
                            productId: null,
                            productName: null,
                            parentTaskId: taskId,
                            parentTaskName: normalizeText(task.name, 'Tarea'),
                            parentId: `task-${clientId}-${projectId}-${taskId}`,
                            path: `clients/${clientId}/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`
                        });
                    });
                });

                // Productos y sus tareas
                Object.entries(project.products || {}).forEach(([productId, product]) => {
                    if (!product) return;
                    const productName = normalizeText(product.name, productId || 'Producto');

                    Object.entries(product.tasks || {}).forEach(([taskId, task]) => {
                        if (!task) return;
                        const taskDate = parseWorkDate(task.date) || parseWorkDate(task.workDate);
                        if (!taskDate) return;

                        const hasSubtasksFlag = hasSubtasks(task);
                        const taskMinutes = hasSubtasksFlag
                            ? getSubtasksTotalMinutes(task.subtasks)
                            : getEstimatedMinutes(task);

                        items.push({
                            id: `task-${clientId}-${projectId}-${productId}-${taskId}`,
                            type: 'task',
                            name: normalizeText(task.name, 'Tarea'),
                            manageId: task.manageId || '',
                            status: normalizeStatus(task.status),
                            priority: task.priority || 'none',
                            date: taskDate,
                            durationMinutes: taskMinutes,
                            assigneeUid: task.assigneeUid || '',
                            clientId,
                            clientName,
                            projectId,
                            projectName,
                            productId,
                            productName,
                            parentId: `product-${clientId}-${projectId}-${productId}`,
                            path: `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}`
                        });

                        // Subtareas del producto
                        Object.entries(task.subtasks || {}).forEach(([subtaskId, subtask]) => {
                            if (!subtask) return;
                            const subtaskDate = parseWorkDate(subtask.date) || parseWorkDate(subtask.workDate);
                            if (!subtaskDate) return;

                            items.push({
                                id: `subtask-${clientId}-${projectId}-${productId}-${taskId}-${subtaskId}`,
                                type: 'subtask',
                                name: normalizeText(subtask.name, 'Subtarea'),
                                manageId: subtask.manageId || '',
                                status: normalizeStatus(subtask.status),
                                priority: subtask.priority || 'none',
                                date: subtaskDate,
                                durationMinutes: getEstimatedMinutes(subtask),
                                assigneeUid: subtask.assigneeUid || '',
                                clientId,
                                clientName,
                                projectId,
                                projectName,
                                productId,
                                productName,
                                parentTaskId: taskId,
                                parentTaskName: normalizeText(task.name, 'Tarea'),
                                parentId: `task-${clientId}-${projectId}-${productId}-${taskId}`,
                                path: `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}/subtasks/${subtaskId}`
                            });
                        });
                    });
                });
            });
        });

        return items;
    };

    // Obtener rango de fechas visible según la vista
    const getTimelineRange = () => {
        const base = timelineState.date;
        if (timelineState.view === 'week') {
            const start = startOfWeek(base);
            const end = addDays(start, 6);
            return { start, end, days: 7 };
        } else {
            // Mes: mostrar 4 semanas
            const start = startOfWeek(new Date(base.getFullYear(), base.getMonth(), 1));
            const end = addDays(start, 27);
            return { start, end, days: 28 };
        }
    };

    // Formatear rango para el header
    const formatTimelineRange = (start, end) => {
        const opts = { day: 'numeric', month: 'short' };
        const startStr = start.toLocaleDateString('es-ES', opts);
        const endStr = end.toLocaleDateString('es-ES', { ...opts, year: 'numeric' });
        return `${startStr} – ${endStr}`;
    };

    // Actualizar header del timeline
    const updateTimelineHeader = () => {
        if (!timelineViewLabel || !timelineRangeLabel) return;
        const range = getTimelineRange();
        timelineViewLabel.textContent = timelineState.view === 'week' ? 'Semana' : 'Mes';
        timelineRangeLabel.textContent = formatTimelineRange(range.start, range.end);
    };

    // Actualizar botones de vista
    const updateTimelineViewButtons = () => {
        timelineViewButtons.forEach((btn) => {
            const isActive = btn.dataset.timelineView === timelineState.view;
            if (isActive) {
                btn.className = 'h-7 px-3 rounded text-xs font-semibold transition-colors bg-primary text-white';
            } else {
                btn.className = 'h-7 px-3 rounded text-xs font-semibold transition-colors text-text-muted hover:text-gray-900 dark:hover:text-white';
            }
        });
    };

    // Actualizar filtros dinámicos (clientes, proyectos, asignados)
    const updateTimelineFilters = () => {
        // Clientes
        if (timelineFilterClient) {
            const prev = timelineFilterClient.value || timelineFilters.client;
            timelineFilterClient.innerHTML = '<option value="all">Cliente: Todos</option>';
            const clientMap = new Map();
            timelineItems.forEach(item => {
                if (item.clientId) clientMap.set(item.clientId, item.clientName);
            });
            Array.from(clientMap.entries())
                .sort((a, b) => a[1].localeCompare(b[1], 'es'))
                .forEach(([id, name]) => {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = name;
                    timelineFilterClient.appendChild(opt);
                });
            timelineFilterClient.value = clientMap.has(prev) ? prev : 'all';
            timelineFilters.client = timelineFilterClient.value;
        }

        // Proyectos (filtrados por cliente si aplica)
        if (timelineFilterProject) {
            const prev = timelineFilterProject.value || timelineFilters.project;
            timelineFilterProject.innerHTML = '<option value="all">Proyecto: Todos</option>';
            const projectMap = new Map();
            timelineItems.forEach(item => {
                if (timelineFilters.client !== 'all' && item.clientId !== timelineFilters.client) return;
                if (item.projectId) projectMap.set(item.projectId, item.projectName);
            });
            Array.from(projectMap.entries())
                .sort((a, b) => a[1].localeCompare(b[1], 'es'))
                .forEach(([id, name]) => {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = name;
                    timelineFilterProject.appendChild(opt);
                });
            timelineFilterProject.value = projectMap.has(prev) ? prev : 'all';
            timelineFilters.project = timelineFilterProject.value;
        }

        // Asignados
        if (timelineFilterAssignee) {
            const prev = timelineFilterAssignee.value || timelineFilters.assignee;
            timelineFilterAssignee.innerHTML = '<option value="all">Asignado: Todos</option>';
            const assigneeMap = new Map();
            timelineItems.forEach(item => {
                if (item.assigneeUid) {
                    const user = usersByUid[item.assigneeUid];
                    const name = user?.displayName || user?.email || item.assigneeUid;
                    assigneeMap.set(item.assigneeUid, name);
                }
            });
            Array.from(assigneeMap.entries())
                .sort((a, b) => a[1].localeCompare(b[1], 'es'))
                .forEach(([id, name]) => {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = name;
                    timelineFilterAssignee.appendChild(opt);
                });
            timelineFilterAssignee.value = assigneeMap.has(prev) ? prev : 'all';
            timelineFilters.assignee = timelineFilterAssignee.value;
        }
    };

    // Filtrar items del timeline
    const filterTimelineItems = (items) => {
        return items.filter(item => {
            if (timelineFilters.client !== 'all' && item.clientId !== timelineFilters.client) return false;
            if (timelineFilters.project !== 'all' && item.projectId !== timelineFilters.project) return false;
            if (timelineFilters.priority !== 'all' && item.priority !== timelineFilters.priority) return false;
            if (timelineFilters.type !== 'all' && item.type !== timelineFilters.type) return false;
            if (timelineFilters.assignee !== 'all' && item.assigneeUid !== timelineFilters.assignee) return false;
            return true;
        });
    };

    // Renderizar el timeline
    const renderTimeline = () => {
        if (!hasTimeline()) return;

        updateTimelineHeader();
        updateTimelineViewButtons();
        updateTimelineFilters();

        const range = getTimelineRange();
        const filteredItems = filterTimelineItems(timelineItems);

        // Filtrar items que estén dentro del rango visible
        const visibleItems = filteredItems.filter(item => {
            const itemEnd = addDays(item.date, Math.max(1, Math.ceil(item.durationMinutes / 480)));
            return item.date <= range.end && itemEnd >= range.start;
        });

        if (!visibleItems.length) {
            timelineContainer.innerHTML = '';
            if (timelineEmpty) {
                timelineEmpty.textContent = timelineItems.length === 0
                    ? 'No hay actividades con fecha para mostrar en el cronograma.'
                    : 'No hay actividades en el rango seleccionado.';
                timelineEmpty.classList.remove('hidden');
                timelineContainer.appendChild(timelineEmpty);
            }
            return;
        }

        if (timelineEmpty) timelineEmpty.classList.add('hidden');

        // Agrupar por jerarquía
        const hierarchy = new Map();
        visibleItems.forEach(item => {
            if (!hierarchy.has(item.clientId)) {
                hierarchy.set(item.clientId, {
                    name: item.clientName,
                    projects: new Map()
                });
            }
            const clientGroup = hierarchy.get(item.clientId);
            if (!clientGroup.projects.has(item.projectId)) {
                clientGroup.projects.set(item.projectId, {
                    name: item.projectName,
                    products: new Map(),
                    tasks: []
                });
            }
            const projectGroup = clientGroup.projects.get(item.projectId);

            if (item.productId) {
                if (!projectGroup.products.has(item.productId)) {
                    projectGroup.products.set(item.productId, {
                        name: item.productName,
                        tasks: []
                    });
                }
                projectGroup.products.get(item.productId).tasks.push(item);
            } else {
                projectGroup.tasks.push(item);
            }
        });

        // Constantes de diseño
        const ROW_HEIGHT = 32; // Más compacto
        const dayWidth = timelineState.view === 'week' ? 100 : 36;
        const timelineWidth = range.days * dayWidth;
        const todayKey = toDateKey(new Date());

        // Encontrar índice del día "hoy" para la línea vertical
        let todayIndex = -1;
        for (let i = 0; i < range.days; i++) {
            if (toDateKey(addDays(range.start, i)) === todayKey) {
                todayIndex = i;
                break;
            }
        }

        const formatDurationMinutes = (mins) => {
            if (!mins) return '0m';
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            if (h && m) return `${h}h ${m}m`;
            if (h) return `${h}h`;
            return `${m}m`;
        };

        // Contenedor principal con estructura mejorada (full-bleed)
        const container = document.createElement('div');
        container.className = 'flex flex-col flex-1 min-h-0 h-full';

        // ===== HEADER FIJO (sticky) =====
        const headerWrapper = document.createElement('div');
        headerWrapper.className = 'flex shrink-0 border-b border-border-dark bg-surface-light dark:bg-surface-darker';

        // Header izquierdo (Actividad)
        const leftHeader = document.createElement('div');
        leftHeader.className = 'w-56 shrink-0 h-9 px-3 flex items-center border-r border-border-dark bg-surface-light dark:bg-surface-darker';
        leftHeader.innerHTML = '<span class="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Actividad</span>';
        headerWrapper.appendChild(leftHeader);

        // Header derecho (días del timeline) - sin scroll en semana, con scroll en mes
        const rightHeaderScroll = document.createElement('div');
        rightHeaderScroll.className = timelineState.view === 'week'
            ? 'flex-1 min-w-0 overflow-hidden'  // Semana: sin scroll, ajustar al contenedor
            : 'flex-1 min-w-0 overflow-x-auto scrollbar-thin';  // Mes: con scroll
        rightHeaderScroll.id = 'timeline-header-scroll';

        const timelineHeader = document.createElement('div');
        timelineHeader.className = 'flex h-9 w-full';
        // En semana: ancho 100%, en mes: ancho fijo para scroll
        if (timelineState.view !== 'week') {
            timelineHeader.style.width = `${timelineWidth}px`;
        }

        for (let i = 0; i < range.days; i++) {
            const day = addDays(range.start, i);
            const isToday = toDateKey(day) === todayKey;
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            const dayCell = document.createElement('div');
            // En semana: flex-1 para distribuir uniformemente, en mes: ancho fijo
            const widthClass = timelineState.view === 'week' ? 'flex-1 min-w-0' : 'shrink-0';
            dayCell.className = `${widthClass} flex items-center justify-center text-[11px] font-medium border-r border-border-dark/40 last:border-r-0 ${
                isToday
                    ? 'bg-primary/15 text-primary font-bold'
                    : isWeekend
                        ? 'bg-gray-100 dark:bg-gray-800/40 text-text-muted'
                        : 'text-gray-600 dark:text-gray-400'
            }`;
            if (timelineState.view !== 'week') {
                dayCell.style.width = `${dayWidth}px`;
            }

            if (timelineState.view === 'week') {
                const weekday = day.toLocaleDateString('es-ES', { weekday: 'short' });
                const dayNum = day.getDate();
                dayCell.innerHTML = `<span class="capitalize">${weekday} ${dayNum}</span>`;
            } else {
                dayCell.textContent = day.getDate();
            }
            timelineHeader.appendChild(dayCell);
        }
        rightHeaderScroll.appendChild(timelineHeader);
        headerWrapper.appendChild(rightHeaderScroll);
        container.appendChild(headerWrapper);

        // ===== CONTENIDO CON SCROLL SINCRONIZADO =====
        const bodyWrapper = document.createElement('div');
        bodyWrapper.className = 'flex flex-1 overflow-hidden';

        // Columna izquierda (árbol) - scroll vertical solo
        const leftCol = document.createElement('div');
        leftCol.className = 'w-56 shrink-0 overflow-y-auto overflow-x-hidden border-r border-border-dark bg-white dark:bg-surface-darker scrollbar-thin';
        leftCol.id = 'timeline-left-scroll';

        // Columna derecha (timeline) - scroll vertical, horizontal solo en mes
        const rightCol = document.createElement('div');
        rightCol.className = timelineState.view === 'week'
            ? 'flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin'
            : 'flex-1 min-w-0 overflow-auto scrollbar-thin';
        rightCol.id = 'timeline-right-scroll';

        // Contenedor interno del timeline - ancho 100% en semana, fijo en mes
        const rightContent = document.createElement('div');
        rightContent.className = 'relative w-full';
        if (timelineState.view !== 'week') {
            rightContent.style.width = `${timelineWidth}px`;
        }

        // Arrays para construir filas
        const rows = [];
        let rowIndex = 0;

        // Función para crear barra de item (posicionada dentro de cada fila)
        const createBarForItem = (item) => {
            const daysDiff = Math.floor((item.date - range.start) / (1000 * 60 * 60 * 24));
            const durationDays = Math.max(1, Math.ceil(item.durationMinutes / 480));

            // En semana: usar porcentajes, en mes: usar pixels
            const usePercent = timelineState.view === 'week';
            let leftPos, widthVal;

            if (usePercent) {
                const leftPercent = (daysDiff / range.days) * 100;
                const widthPercent = Math.min(durationDays / range.days, (range.days - daysDiff) / range.days) * 100;
                if (leftPercent >= 100) return null;
                leftPos = `calc(${leftPercent}% + 2px)`;
                widthVal = `calc(${Math.max(widthPercent, 100 / range.days)}% - 4px)`;
            } else {
                const left = Math.max(0, daysDiff * dayWidth);
                const width = Math.min(durationDays * dayWidth - 4, (range.days - Math.max(0, daysDiff)) * dayWidth - 4);
                if (left >= timelineWidth) return null;
                leftPos = `${left + 2}px`;
                widthVal = `${Math.max(width, 20)}px`;
            }

            const colors = TIMELINE_PRIORITY_COLORS[item.priority] || TIMELINE_PRIORITY_COLORS['none'];
            const statusStyle = TIMELINE_STATUS_STYLES[item.status] || '';

            const bar = document.createElement('button');
            bar.type = 'button';
            bar.className = `absolute h-5 rounded-md border-l-[3px] ${colors.bg} ${colors.border} ${colors.text} ${statusStyle} flex items-center px-2 text-[11px] font-semibold truncate cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all z-10`;
            bar.style.left = leftPos;
            bar.style.width = widthVal;
            bar.style.top = '50%';
            bar.style.transform = 'translateY(-50%)';

            // Tooltip mejorado
            const priorityLabel = { none: 'Sin prioridad', low: 'Baja', medium: 'Media', high: 'Alta' }[item.priority] || 'Sin prioridad';
            bar.title = `${item.name}\n⏱ ${formatDurationMinutes(item.durationMinutes)}\n📌 ${priorityLabel}\n📋 ${item.status}`;
            bar.textContent = timelineState.view === 'week' ? item.name : '';

            if (item.manageId) {
                bar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openDetailPage(item.manageId);
                });
            }

            return bar;
        };

        // Función para crear fila del árbol (izquierda)
        const createTreeRow = (label, depth, icon, isGroup = false, groupId = null, item = null) => {
            const row = document.createElement('div');
            row.className = `h-8 flex items-center border-b border-border-dark/20 transition-colors ${
                isGroup
                    ? 'bg-gray-50/80 dark:bg-white/[0.03] hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                    : 'hover:bg-primary/5 dark:hover:bg-primary/10'
            }`;
            row.style.paddingLeft = `${8 + depth * 12}px`;
            row.style.height = `${ROW_HEIGHT}px`;

            if (isGroup && groupId) {
                const collapsed = timelineCollapsedGroups.has(groupId);
                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'mr-1 text-text-muted hover:text-gray-900 dark:hover:text-white transition-colors';
                toggle.innerHTML = `<span class="material-symbols-outlined text-[14px]">${collapsed ? 'chevron_right' : 'expand_more'}</span>`;
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (timelineCollapsedGroups.has(groupId)) {
                        timelineCollapsedGroups.delete(groupId);
                    } else {
                        timelineCollapsedGroups.add(groupId);
                    }
                    renderTimeline();
                });
                row.appendChild(toggle);
            }

            if (icon) {
                const iconEl = document.createElement('span');
                iconEl.className = `material-symbols-outlined text-[14px] mr-1.5 ${isGroup ? 'text-text-muted' : 'text-primary/60'}`;
                iconEl.textContent = icon;
                row.appendChild(iconEl);
            }

            const text = document.createElement('span');
            text.className = `text-xs truncate flex-1 ${
                isGroup
                    ? 'font-semibold text-gray-800 dark:text-gray-200'
                    : 'text-gray-700 dark:text-gray-300'
            }`;
            text.textContent = label;
            text.title = label;
            row.appendChild(text);

            // Click en fila hoja abre detail
            if (!isGroup && item?.manageId) {
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => openDetailPage(item.manageId));
            }

            return row;
        };

        // Función para crear fila del timeline (derecha)
        const createTimelineRow = () => {
            const row = document.createElement('div');
            // En semana: usar flex para distribuir celdas, en mes: relative para posición absoluta
            row.className = timelineState.view === 'week'
                ? 'border-b border-border-dark/20 relative flex w-full'
                : 'border-b border-border-dark/20 relative';
            row.style.height = `${ROW_HEIGHT}px`;

            // Grid lines for days
            for (let i = 0; i < range.days; i++) {
                const day = addDays(range.start, i);
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                const cell = document.createElement('div');
                if (timelineState.view === 'week') {
                    // En semana: celdas con flex-1 para distribuir uniformemente
                    cell.className = `flex-1 min-w-0 h-full border-r border-border-dark/15 last:border-r-0 ${
                        isWeekend ? 'bg-gray-50/50 dark:bg-gray-800/20' : ''
                    }`;
                } else {
                    // En mes: posición absoluta con pixels
                    cell.className = `absolute top-0 bottom-0 border-r border-border-dark/15 ${
                        isWeekend ? 'bg-gray-50/50 dark:bg-gray-800/20' : ''
                    }`;
                    cell.style.left = `${i * dayWidth}px`;
                    cell.style.width = `${dayWidth}px`;
                }
                row.appendChild(cell);
            }

            return row;
        };

        // Renderizar jerarquía
        hierarchy.forEach((clientGroup, clientId) => {
            const clientGroupId = `client-${clientId}`;
            const clientCollapsed = timelineCollapsedGroups.has(clientGroupId);

            // Cliente row
            rows.push({
                tree: createTreeRow(clientGroup.name, 0, 'apartment', true, clientGroupId),
                timeline: createTimelineRow(),
                item: null
            });
            rowIndex++;

            if (clientCollapsed) return;

            clientGroup.projects.forEach((projectGroup, projectId) => {
                const projectGroupId = `project-${clientId}-${projectId}`;
                const projectCollapsed = timelineCollapsedGroups.has(projectGroupId);

                rows.push({
                    tree: createTreeRow(projectGroup.name, 1, 'folder', true, projectGroupId),
                    timeline: createTimelineRow(),
                    item: null
                });
                rowIndex++;

                if (projectCollapsed) return;

                // Productos
                projectGroup.products.forEach((productGroup, productId) => {
                    const productGroupId = `product-${clientId}-${projectId}-${productId}`;
                    const productCollapsed = timelineCollapsedGroups.has(productGroupId);

                    rows.push({
                        tree: createTreeRow(productGroup.name, 2, 'inventory_2', true, productGroupId),
                        timeline: createTimelineRow(),
                        item: null
                    });
                    rowIndex++;

                    if (productCollapsed) return;

                    // Tareas del producto
                    productGroup.tasks.forEach(item => {
                        if (item.type === 'task') {
                            const timelineRow = createTimelineRow();
                            const bar = createBarForItem(item);
                            if (bar) timelineRow.appendChild(bar);

                            rows.push({
                                tree: createTreeRow(item.name, 3, 'task_alt', false, null, item),
                                timeline: timelineRow,
                                item
                            });
                            rowIndex++;

                            // Subtareas
                            const taskIdPart = item.id.split('-').pop();
                            const subtasks = productGroup.tasks.filter(st => st.type === 'subtask' && st.parentTaskId === taskIdPart);
                            subtasks.forEach(subtask => {
                                const stRow = createTimelineRow();
                                const stBar = createBarForItem(subtask);
                                if (stBar) stRow.appendChild(stBar);

                                rows.push({
                                    tree: createTreeRow(subtask.name, 4, 'subdirectory_arrow_right', false, null, subtask),
                                    timeline: stRow,
                                    item: subtask
                                });
                                rowIndex++;
                            });
                        }
                    });
                });

                // Tareas directas del proyecto
                projectGroup.tasks.forEach(item => {
                    if (item.type === 'task') {
                        const timelineRow = createTimelineRow();
                        const bar = createBarForItem(item);
                        if (bar) timelineRow.appendChild(bar);

                        rows.push({
                            tree: createTreeRow(item.name, 2, 'task_alt', false, null, item),
                            timeline: timelineRow,
                            item
                        });
                        rowIndex++;

                        // Subtareas
                        const taskIdPart = item.id.split('-').slice(-1)[0];
                        const subtasks = projectGroup.tasks.filter(st => st.type === 'subtask' && st.parentTaskId === taskIdPart);
                        subtasks.forEach(subtask => {
                            const stRow = createTimelineRow();
                            const stBar = createBarForItem(subtask);
                            if (stBar) stRow.appendChild(stBar);

                            rows.push({
                                tree: createTreeRow(subtask.name, 3, 'subdirectory_arrow_right', false, null, subtask),
                                timeline: stRow,
                                item: subtask
                            });
                            rowIndex++;
                        });
                    }
                });
            });
        });

        // Construir contenido
        rows.forEach(({ tree, timeline }) => {
            leftCol.appendChild(tree);
            rightContent.appendChild(timeline);
        });

        // Línea de "Hoy" prominente
        if (todayIndex >= 0) {
            // En semana: porcentaje, en mes: pixels
            const todayPos = timelineState.view === 'week'
                ? `calc(${(todayIndex + 0.5) / range.days * 100}%)`
                : `${todayIndex * dayWidth + dayWidth / 2}px`;

            const todayLine = document.createElement('div');
            todayLine.className = 'absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none';
            todayLine.style.left = todayPos;

            // Indicador superior "Hoy"
            const todayLabel = document.createElement('div');
            todayLabel.className = 'absolute -top-1 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-b shadow-sm';
            todayLabel.style.left = todayPos;
            todayLabel.textContent = 'HOY';

            rightContent.appendChild(todayLine);
            rightContent.appendChild(todayLabel);
        }

        rightCol.appendChild(rightContent);
        bodyWrapper.appendChild(leftCol);
        bodyWrapper.appendChild(rightCol);
        container.appendChild(bodyWrapper);

        timelineContainer.innerHTML = '';
        timelineContainer.appendChild(container);

        // ===== SINCRONIZACIÓN DE SCROLL =====
        const leftScroll = document.getElementById('timeline-left-scroll');
        const rightScroll = document.getElementById('timeline-right-scroll');
        const headerScroll = document.getElementById('timeline-header-scroll');

        let isSyncing = false;

        // Sincronizar scroll vertical entre árbol y timeline
        if (leftScroll && rightScroll) {
            leftScroll.addEventListener('scroll', () => {
                if (isSyncing) return;
                isSyncing = true;
                rightScroll.scrollTop = leftScroll.scrollTop;
                requestAnimationFrame(() => { isSyncing = false; });
            });

            rightScroll.addEventListener('scroll', () => {
                if (isSyncing) return;
                isSyncing = true;
                leftScroll.scrollTop = rightScroll.scrollTop;
                // Sincronizar también scroll horizontal del header
                if (headerScroll) {
                    headerScroll.scrollLeft = rightScroll.scrollLeft;
                }
                requestAnimationFrame(() => { isSyncing = false; });
            });
        }

        // Sincronizar scroll horizontal del header con timeline
        if (headerScroll && rightScroll) {
            headerScroll.addEventListener('scroll', () => {
                if (isSyncing) return;
                isSyncing = true;
                rightScroll.scrollLeft = headerScroll.scrollLeft;
                requestAnimationFrame(() => { isSyncing = false; });
            });
        }
    };

    // Cambiar vista del timeline
    const setTimelineView = (view) => {
        if (!['week', 'month'].includes(view)) return;
        timelineState.view = view;
        renderTimeline();
    };

    // Navegar en el tiempo
    const shiftTimelineDate = (direction) => {
        const amount = Number(direction) || 0;
        if (!amount) return;
        const base = timelineState.date;
        if (timelineState.view === 'week') {
            timelineState.date = addDays(base, amount * 7);
        } else {
            timelineState.date = new Date(base.getFullYear(), base.getMonth() + amount, 1);
        }
        renderTimeline();
    };

    // Ir a hoy
    const goToTimelineToday = () => {
        timelineState.date = new Date();
        renderTimeline();
    };

    // Inicializar filtros del timeline
    const initTimelineFilters = () => {
        if (timelineFiltersInitialized) return;

        const refresh = () => {
            if (timelineFilterClient) timelineFilters.client = timelineFilterClient.value || 'all';
            if (timelineFilterProject) timelineFilters.project = timelineFilterProject.value || 'all';
            if (timelineFilterPriority) timelineFilters.priority = timelineFilterPriority.value || 'all';
            if (timelineFilterType) timelineFilters.type = timelineFilterType.value || 'all';
            if (timelineFilterAssignee) timelineFilters.assignee = timelineFilterAssignee.value || 'all';
            renderTimeline();
        };

        timelineFilterClient?.addEventListener('change', () => {
            timelineFilters.client = timelineFilterClient.value || 'all';
            updateTimelineFilters(); // Actualizar proyectos según cliente
            renderTimeline();
        });
        timelineFilterProject?.addEventListener('change', refresh);
        timelineFilterPriority?.addEventListener('change', refresh);
        timelineFilterType?.addEventListener('change', refresh);
        timelineFilterAssignee?.addEventListener('change', refresh);

        // Botones de navegación
        timelinePrevBtn?.addEventListener('click', () => shiftTimelineDate(-1));
        timelineNextBtn?.addEventListener('click', () => shiftTimelineDate(1));
        timelineTodayBtn?.addEventListener('click', goToTimelineToday);

        // Botones de vista
        timelineViewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.timelineView;
                if (view) setTimelineView(view);
            });
        });

        timelineFiltersInitialized = true;
    };

    // Actualizar items y re-render
    const updateTimelineItems = () => {
        if (!hasTimeline()) return;
        console.log('[TIMELINE] Building items from', allClients.length, 'clients');
        timelineItems = buildTimelineItems();
        console.log('[TIMELINE] Built', timelineItems.length, 'timeline items');
        console.log('[TIMELINE] Users loaded:', Object.keys(usersByUid).length);
        initTimelineFilters();
        renderTimeline();
    };

    const normalizeAutomationIdList = (value) => {
        if (Array.isArray(value)) {
            return value.map(id => String(id || '').trim()).filter(Boolean);
        }
        if (value && typeof value === 'object') {
            const entries = Object.entries(value);
            const rawValues = entries.map(([, entryValue]) => entryValue);
            const stringValues = rawValues.filter(entryValue => typeof entryValue === 'string' && entryValue.trim());
            if (stringValues.length > 0) {
                return stringValues.map(id => String(id || '').trim()).filter(Boolean);
            }
            return entries.filter(([, entryValue]) => entryValue).map(([key]) => String(key));
        }
        return [];
    };

    const renderProjectAutomationList = () => {
        if (!projectAutomationList) return;
        projectAutomationList.innerHTML = '';
        if (!Array.isArray(availableProjectAutomations) || availableProjectAutomations.length === 0) {
            if (projectAutomationEmpty) projectAutomationEmpty.classList.remove('hidden');
            return;
        }
        if (projectAutomationEmpty) projectAutomationEmpty.classList.add('hidden');
        availableProjectAutomations.forEach((automation) => {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-3 rounded-lg border border-border-dark/60 bg-white/70 dark:bg-surface-dark/60 px-3 py-2 text-sm text-gray-900 dark:text-white';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'h-4 w-4 rounded border-border-dark text-primary focus:ring-primary';
            checkbox.dataset.automationId = automation.id;
            checkbox.checked = selectedProjectAutomationIds.has(automation.id);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'truncate';
            nameSpan.textContent = automation.name || 'Automatizacion sin nombre';
            label.append(checkbox, nameSpan);
            projectAutomationList.appendChild(label);
        });
    };

    const loadProjectAutomations = async () => {
        if (projectAutomationLoading) return;
        projectAutomationLoading = true;
        try {
            const snapshot = await get(ref(database, 'automations'));
            if (snapshot.exists()) {
                const automationsData = snapshot.val();
                availableProjectAutomations = Object.keys(automationsData).map((key) => {
                    const automation = automationsData[key] || {};
                    return {
                        id: key,
                        name: automation.name || '',
                        enabled: automation.enabled !== false,
                    };
                }).filter(item => item.enabled);
                availableProjectAutomations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else {
                availableProjectAutomations = [];
            }
        } catch (error) {
            console.error('Error loading automations:', error);
            availableProjectAutomations = [];
        } finally {
            projectAutomationLoading = false;
            renderProjectAutomationList();
        }
    };

    const resetProjectAutomationSelection = () => {
        selectedProjectAutomationIds = new Set();
        if (projectAutomationToggle) projectAutomationToggle.checked = false;
        if (projectAutomationPanel) projectAutomationPanel.classList.add('hidden');
        renderProjectAutomationList();
    };

    const getSelectedProjectAutomationIds = () => Array.from(selectedProjectAutomationIds);

    const cacheProjectAutomationIds = (clientId, projectId, ids) => {
        if (!clientId || !projectId) return;
        const normalized = normalizeAutomationIdList(ids);
        if (normalized.length === 0) return;
        projectAutomationCache.set(`${clientId}:${projectId}`, normalized);
    };

    const getProjectAutomationIds = (clientId, projectId) => {
        if (!clientId || !projectId) return [];
        const cacheKey = `${clientId}:${projectId}`;
        if (projectAutomationCache.has(cacheKey)) {
            const cached = projectAutomationCache.get(cacheKey);
            return Array.isArray(cached) ? cached.slice() : [];
        }
        const client = allClients.find(c => c.id === clientId);
        const project = client?.projects?.[projectId];
        const ids = normalizeAutomationIdList(project?.automationIds);
        if (ids.length > 0) {
            projectAutomationCache.set(cacheKey, ids);
        }
        return ids;
    };

    const parseClientPath = (pathValue) => {
        const path = String(pathValue || '').trim();
        if (!path) return null;
        const parts = path.split('/').filter(Boolean);
        if (parts[0] !== 'clients') return null;

        const clientId = parts[1] || '';
        if (!clientId) return null;

        const projectIndex = parts.indexOf('projects');
        const projectId = projectIndex >= 0 ? (parts[projectIndex + 1] || '') : '';
        const productIndex = parts.indexOf('products');
        const productId = productIndex >= 0 ? (parts[productIndex + 1] || '') : '';
        const taskIndex = parts.indexOf('tasks');
        const taskId = taskIndex >= 0 ? (parts[taskIndex + 1] || '') : '';
        const subtaskIndex = parts.indexOf('subtasks');
        const subtaskId = subtaskIndex >= 0 ? (parts[subtaskIndex + 1] || '') : '';

        const type = subtaskId
            ? 'subtask'
            : taskId
                ? 'task'
                : productId
                    ? 'product'
                    : projectId
                        ? 'project'
                        : 'client';

        return { type, clientId, projectId, productId, taskId, subtaskId, path };
    };

    const getItemFromState = (parsed) => {
        const clientId = parsed?.clientId;
        if (!clientId) return null;
        const client = allClients.find(c => c.id === clientId);
        if (!client) return null;
        if (parsed.type === 'client') return client;

        const projectId = parsed?.projectId;
        const project = projectId ? client?.projects?.[projectId] : null;
        if (!project) return null;
        if (parsed.type === 'project') return project;

        const productId = parsed?.productId;
        const product = productId ? project?.products?.[productId] : null;
        if (parsed.type === 'product') return product;

        const taskId = parsed?.taskId;
        const task = taskId
            ? (productId ? product?.tasks?.[taskId] : project?.tasks?.[taskId])
            : null;
        if (parsed.type === 'task') return task;

        const subtaskId = parsed?.subtaskId;
        if (!subtaskId || !task?.subtasks) return null;
        return task.subtasks[subtaskId] || null;
    };

    const getTypeLabel = (type) => {
        if (type === 'client') return 'Cliente';
        if (type === 'project') return 'Proyecto';
        if (type === 'product') return 'Producto';
        if (type === 'task') return 'Tarea';
        if (type === 'subtask') return 'Subtarea';
        return 'Elemento';
    };

    const getAssignmentTitle = (type) => (
        type === 'subtask' ? 'Se te ha asignado la subtarea' : 'Se te ha asignado la tarea'
    );

    const getCurrentActorName = () => {
        const uid = currentUser?.uid;
        return (
            getUserDisplayNameByUid(uid)
            || currentUser?.displayName
            || currentUser?.email
            || uid
            || 'Usuario'
        );
    };

    const sendNotification = async (targetUidValue, titleValue, taskNameValue, meta = {}) => {
        const targetUid = String(targetUidValue || '').trim();
        if (!targetUid) return;
        const title = String(titleValue || '').trim() || 'Notificacion';
        const taskName = String(taskNameValue || '').trim();
        const manageId = String(meta.manageId || '').trim();
        const entityType = String(meta.entityType || '').trim();
        const path = String(meta.path || '').trim();
        const fromUid = currentUser?.uid || '';

        const payload = {
            title,
            taskName,
            fromUid,
            fromName: getCurrentActorName(),
            read: false,
            createdAt: serverTimestamp(),
        };

        if (manageId) payload.manageId = manageId;
        if (entityType) payload.entityType = entityType;
        if (path) payload.path = path;

        try {
            await push(ref(database, `notifications/${targetUid}`), payload);
        } catch (error) {
            console.warn('No se pudo enviar la notificacion:', error);
        }
    };

    const logActivity = async (clientIdValue, descriptionValue, meta = {}) => {
        const clientId = String(clientIdValue || '').trim();
        const description = String(descriptionValue || '').trim();
        if (!clientId || !description || !currentUser) return;
        try {
            await push(ref(database, `clients/${clientId}/activity_logs`), {
                actorUid: currentUser.uid,
                actorName: getCurrentActorName(),
                description,
                timestamp: serverTimestamp(),
                ...meta,
            });
        } catch (error) {
            console.warn('No se pudo registrar el log de actividad:', error);
        }
    };

    const updateStatusAtPath = async (path, nextStatus, options = {}) => {
        if (!currentUser) {
            alert("Debes iniciar sesión para cambiar el estado.");
            return;
        }
        const source = String(options?.source || '').trim() || 'user';
        const skipAutomations = Boolean(options?.skipAutomations);
        const parsed = parseClientPath(path);
        const itemBefore = parsed ? getItemFromState(parsed) : null;
        const prevStatus = normalizeStatus(itemBefore?.status);
        const normalized = normalizeStatus(nextStatus);
        await update(ref(database, path), {
            status: normalized,
            updatedAt: new Date().toISOString()
        });

        if (parsed?.clientId && prevStatus !== normalized) {
            const label = getTypeLabel(parsed.type);
            const itemName = itemBefore?.name || label;
            await logActivity(
                parsed.clientId,
                `Actualizó estado de ${label} "${itemName}" de "${prevStatus}" a "${normalized}".`,
                { action: 'status_update', path, entityType: parsed.type, source }
            );
        }

        if (!skipAutomations) {
            const projectAutomationIds = getProjectAutomationIds(parsed?.clientId, parsed?.projectId);
            executeAutomations('activityStatusChanged', {
                path: path,
                type: parsed.type,
                data: itemBefore,
                oldStatus: prevStatus,
                newStatus: normalized
            }, { includeAutomationIds: projectAutomationIds });
        }
    };

    const updateAssigneeAtPath = async (path, nextUid) => {
        if (!currentUser) {
            alert("Debes iniciar sesión para asignar tareas.");
            return;
        }
        const parsed = parseClientPath(path);
        const itemBefore = parsed ? getItemFromState(parsed) : null;
        const prevUid = String(itemBefore?.assigneeUid || '').trim();
        const uid = String(nextUid || '').trim();
        await update(ref(database, path), {
            assigneeUid: uid,
            updatedAt: new Date().toISOString()
        });

        if (parsed?.clientId && prevUid !== uid) {
            const label = getTypeLabel(parsed.type);
            const itemName = itemBefore?.name || label;
            const toName = uid ? (getUserDisplayNameByUid(uid) || uid) : 'Sin asignar';
            await logActivity(
                parsed.clientId,
                `Asignó ${label} "${itemName}" a ${toName}.`,
                { action: 'assignee_update', path, entityType: parsed.type, assigneeUid: uid }
            );
        }

        if (uid && prevUid !== uid) {
            const itemName = itemBefore?.name || 'Tarea';
            const title = getAssignmentTitle(parsed?.type);
            await sendNotification(uid, title, itemName, {
                manageId: itemBefore?.manageId || '',
                entityType: parsed?.type || '',
                path,
            });
        }
    };

    const createStatusControl = ({ status, onChange }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative flex-shrink-0';

        const button = document.createElement('button');
        button.type = 'button';

        const label = document.createElement('span');
        label.className = 'leading-none';

        const caret = document.createElement('span');
        caret.className = 'material-symbols-outlined text-[16px] leading-none opacity-70';
        caret.textContent = 'expand_more';

        button.append(label, caret);
        applyStatusChipStyle(button, label, status);

        const menu = document.createElement('div');
        menu.className = 'action-menu hidden absolute right-0 w-44 bg-white dark:bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-x-hidden overflow-y-auto z-50 text-gray-900 dark:text-white';

        let saving = false;
        const setSaving = (isSaving) => {
            saving = isSaving;
            button.disabled = isSaving;
            button.classList.toggle('opacity-60', isSaving);
            button.classList.toggle('cursor-not-allowed', isSaving);
        };

        STATUS_OPTIONS.forEach(option => {
            const optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.className = 'w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 text-left';
            optBtn.dataset.status = option;

            const left = document.createElement('div');
            left.className = 'flex items-center gap-2';

            const dot = document.createElement('span');
            dot.className = 'inline-block w-2.5 h-2.5 rounded-full ring-1 ring-white/10';
            if (option === 'En proceso') dot.classList.add('bg-blue-400');
            else if (option === 'Finalizado') dot.classList.add('bg-emerald-400');
            else dot.classList.add('bg-slate-400');

            const txt = document.createElement('span');
            txt.textContent = option;

            left.append(dot, txt);

            const check = document.createElement('span');
            check.className = 'material-symbols-outlined text-[18px] text-text-muted opacity-0';
            check.textContent = 'check';

            optBtn.append(left, check);

            optBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (saving) return;
                menu.classList.add('hidden');
                const next = normalizeStatus(option);
                setSaving(true);
                try {
                    await onChange(next);
                    applyStatusChipStyle(button, label, next);
                } catch (error) {
                    console.error('Error updating status:', error);
                    alert(`No se pudo actualizar el estado: ${error.message}`);
                } finally {
                    setSaving(false);
                }
            });

            menu.appendChild(optBtn);
        });

        const refreshMenuChecks = () => {
            const current = normalizeStatus(label.textContent);
            Array.from(menu.querySelectorAll('button')).forEach((btn) => {
                const isActive = normalizeStatus(btn.dataset.status) === current;
                const check = btn.querySelector('.material-symbols-outlined');
                if (check) check.classList.toggle('opacity-0', !isActive);
            });
        };

        const findClippingContainer = () => {
            let node = wrapper.parentElement;
            while (node && node !== document.body && node !== document.documentElement) {
                const style = window.getComputedStyle(node);
                const overflowY = style.overflowY;
                const overflowX = style.overflowX;
                if (
                    ['auto', 'scroll', 'hidden', 'clip'].includes(overflowY) ||
                    ['auto', 'scroll', 'hidden', 'clip'].includes(overflowX)
                ) {
                    return node;
                }
                node = node.parentElement;
            }
            return document.documentElement;
        };

        const positionMenu = () => {
            const clipping = findClippingContainer();
            const clipRect = clipping.getBoundingClientRect();
            const btnRect = button.getBoundingClientRect();
            const padding = 8;

            menu.style.maxHeight = '';
            menu.style.minWidth = '';

            const wasHidden = menu.classList.contains('hidden');
            if (wasHidden) {
                menu.classList.remove('hidden');
                menu.style.visibility = 'hidden';
            }

            const menuRect = menu.getBoundingClientRect();
            const menuHeight = menuRect.height || 140;

            const availableBelow = clipRect.bottom - btnRect.bottom;
            const availableAbove = btnRect.top - clipRect.top;
            const shouldOpenUp = availableBelow < (menuHeight + padding) && availableAbove > availableBelow;

            menu.classList.remove('top-full', 'mt-2', 'bottom-full', 'mb-2');
            if (shouldOpenUp) {
                menu.classList.add('bottom-full', 'mb-2');
                const maxHeight = Math.max(120, Math.floor(availableAbove - padding));
                menu.style.maxHeight = `${maxHeight}px`;
            } else {
                menu.classList.add('top-full', 'mt-2');
                const maxHeight = Math.max(120, Math.floor(availableBelow - padding));
                menu.style.maxHeight = `${maxHeight}px`;
            }

            if (wasHidden) {
                menu.style.visibility = '';
                menu.classList.add('hidden');
            }
        };

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = !menu.classList.contains('hidden');
            closeAllActionMenus(menu);
            if (isOpen) {
                menu.classList.add('hidden');
                return;
            }
            refreshMenuChecks();
            positionMenu();
            menu.classList.remove('hidden');
        });

        wrapper.append(button, menu);
        return wrapper;
    };

    const createAssigneeControl = ({ assigneeUid, onChange }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative flex-shrink-0';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inline-flex items-center justify-between gap-2 text-[11px] font-bold px-2 py-0.5 rounded-full border border-border-dark bg-white/70 dark:bg-white/5 text-text-muted hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors';

        const left = document.createElement('div');
        left.className = 'flex items-center gap-2 min-w-0';

        const avatar = document.createElement('span');
        avatar.className = 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary border border-primary/20 text-[10px] font-bold overflow-hidden bg-center bg-cover bg-no-repeat shrink-0';

        const label = document.createElement('span');
        label.className = 'truncate max-w-[11rem]';

        const caret = document.createElement('span');
        caret.className = 'material-symbols-outlined text-[16px] leading-none opacity-70';
        caret.textContent = 'expand_more';

        left.append(avatar, label);
        button.append(left, caret);

        const applyAssignee = (uidValue) => {
            const uid = String(uidValue || '').trim();
            if (!uid) {
                avatar.style.backgroundImage = '';
                avatar.textContent = '—';
                avatar.classList.remove('text-primary', 'border-primary/20', 'bg-primary/15');
                avatar.classList.add('text-text-muted', 'border-border-dark', 'bg-white/10');
                label.textContent = 'Sin asignar';
                button.title = 'Sin asignar';
                return;
            }

            const name = getUserDisplayNameByUid(uid) || uid;
            const photo = getUserPhotoByUid(uid);
            if (photo) {
                avatar.style.backgroundImage = `url('${photo}')`;
                avatar.textContent = '';
            } else {
                avatar.style.backgroundImage = '';
                avatar.textContent = getInitials(name);
            }
            avatar.classList.remove('text-text-muted', 'border-border-dark', 'bg-white/10');
            avatar.classList.add('text-primary', 'border-primary/20', 'bg-primary/15');
            label.textContent = `Asignado a ${name}`;
            button.title = `Asignado a ${name}`;
        };

        applyAssignee(assigneeUid);

        const menu = document.createElement('div');
        menu.className = 'action-menu hidden absolute right-0 w-72 bg-white dark:bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-x-hidden overflow-y-auto z-50 text-gray-900 dark:text-white';

        let saving = false;
        const setSaving = (isSaving) => {
            saving = isSaving;
            button.disabled = isSaving;
            button.classList.toggle('opacity-60', isSaving);
            button.classList.toggle('cursor-not-allowed', isSaving);
        };

        const makeOption = ({ uid, name, dept, photo }) => {
            const optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.className = 'w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 text-left';
            optBtn.dataset.uid = uid;

            const optLeft = document.createElement('div');
            optLeft.className = 'flex items-center gap-3 min-w-0';

            const a = document.createElement('span');
            a.className = 'w-8 h-8 rounded-full bg-primary/15 text-primary border border-primary/20 flex items-center justify-center text-xs font-bold overflow-hidden bg-center bg-cover bg-no-repeat shrink-0';
            if (photo) {
                a.style.backgroundImage = `url('${photo}')`;
                a.textContent = '';
            } else {
                a.style.backgroundImage = '';
                a.textContent = getInitials(name);
            }

            const txtWrap = document.createElement('div');
            txtWrap.className = 'flex flex-col min-w-0';

            const txt = document.createElement('span');
            txt.className = 'text-sm font-semibold truncate';
            txt.textContent = name;

            const sub = document.createElement('span');
            sub.className = 'text-xs text-text-muted truncate';
            sub.textContent = dept || '';

            txtWrap.append(txt, sub);
            optLeft.append(a, txtWrap);

            const check = document.createElement('span');
            check.className = 'material-symbols-outlined text-[18px] text-text-muted opacity-0';
            check.textContent = 'check';

            optBtn.append(optLeft, check);
            return optBtn;
        };

        const buildMenu = () => {
            menu.innerHTML = '';

            const noneOpt = makeOption({ uid: '', name: 'Sin asignar', dept: '', photo: '' });
            const noneAvatar = noneOpt.querySelector('.w-8');
            if (noneAvatar) {
                noneAvatar.classList.remove('text-primary', 'border-primary/20', 'bg-primary/15');
                noneAvatar.classList.add('bg-white/10', 'text-text-muted', 'border-border-dark');
                noneAvatar.textContent = '—';
            }
            menu.appendChild(noneOpt);

            const users = Object.entries(usersByUid || {})
                .map(([uid, user]) => ({ uid, ...user }))
                .filter(entry => entry.uid);

            users.sort((a, b) => (a.username || a.email || '').localeCompare(b.username || b.email || ''));

            users.forEach(user => {
                menu.appendChild(makeOption({
                    uid: user.uid,
                    name: user.username || user.email || user.uid,
                    dept: user.department || '',
                    photo: user.profile_picture || ''
                }));
            });
        };

        const refreshMenuChecks = () => {
            const currentUid = String(assigneeUid || '').trim();
            Array.from(menu.querySelectorAll('button[data-uid]')).forEach((btn) => {
                const isActive = String(btn.dataset.uid || '') === currentUid;
                const check = btn.querySelector('.material-symbols-outlined');
                if (check) check.classList.toggle('opacity-0', !isActive);
            });
        };

        const findClippingContainer = () => {
            let node = wrapper.parentElement;
            while (node && node !== document.body && node !== document.documentElement) {
                const style = window.getComputedStyle(node);
                const overflowY = style.overflowY;
                const overflowX = style.overflowX;
                if (
                    ['auto', 'scroll', 'hidden', 'clip'].includes(overflowY) ||
                    ['auto', 'scroll', 'hidden', 'clip'].includes(overflowX)
                ) {
                    return node;
                }
                node = node.parentElement;
            }
            return document.documentElement;
        };

        const positionMenu = () => {
            const clipping = findClippingContainer();
            const clipRect = clipping.getBoundingClientRect();
            const btnRect = button.getBoundingClientRect();
            const padding = 8;

            menu.style.maxHeight = '';

            const wasHidden = menu.classList.contains('hidden');
            if (wasHidden) {
                menu.classList.remove('hidden');
                menu.style.visibility = 'hidden';
            }

            const menuRect = menu.getBoundingClientRect();
            const menuHeight = menuRect.height || 220;

            const availableBelow = clipRect.bottom - btnRect.bottom;
            const availableAbove = btnRect.top - clipRect.top;
            const shouldOpenUp = availableBelow < (menuHeight + padding) && availableAbove > availableBelow;

            menu.classList.remove('top-full', 'mt-2', 'bottom-full', 'mb-2');
            if (shouldOpenUp) {
                menu.classList.add('bottom-full', 'mb-2');
                const maxHeight = Math.max(160, Math.floor(availableAbove - padding));
                menu.style.maxHeight = `${maxHeight}px`;
            } else {
                menu.classList.add('top-full', 'mt-2');
                const maxHeight = Math.max(160, Math.floor(availableBelow - padding));
                menu.style.maxHeight = `${maxHeight}px`;
            }

            if (wasHidden) {
                menu.style.visibility = '';
                menu.classList.add('hidden');
            }
        };

        menu.addEventListener('click', (e) => e.stopPropagation());
        menu.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-uid]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            if (saving) return;
            menu.classList.add('hidden');

            const nextUid = String(btn.dataset.uid || '').trim();
            setSaving(true);
            try {
                await onChange(nextUid);
                assigneeUid = nextUid;
                applyAssignee(nextUid);
            } catch (error) {
                console.error('Error updating assignee:', error);
                alert(`No se pudo asignar: ${error.message}`);
            } finally {
                setSaving(false);
            }
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = !menu.classList.contains('hidden');
            closeAllActionMenus(menu);
            if (isOpen) {
                menu.classList.add('hidden');
                return;
            }
            buildMenu();
            refreshMenuChecks();
            positionMenu();
            menu.classList.remove('hidden');
        });

        wrapper.append(button, menu);
        return wrapper;
    };

    const closeAllActionMenus = (exceptMenu = null) => {
        document.querySelectorAll('.action-menu').forEach(menu => {
            if (menu !== exceptMenu) menu.classList.add('hidden');
        });
    };

    const createActionMenu = ({ onRename, onDelete }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative flex-shrink-0';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'p-1 rounded-md text-text-muted hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors';
        button.setAttribute('aria-label', 'Opciones');
        button.innerHTML = '<span class="material-symbols-outlined text-[18px]">settings</span>';

        const menu = document.createElement('div');
        menu.className = 'action-menu hidden absolute right-0 top-full mt-2 w-44 bg-white dark:bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-hidden z-40 text-gray-900 dark:text-white';

        const renameButton = document.createElement('button');
        renameButton.type = 'button';
        renameButton.className = 'w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 text-left';
        renameButton.innerHTML = '<span class="material-symbols-outlined text-[18px]">edit</span>Editar nombre';
        renameButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            menu.classList.add('hidden');
            onRename?.();
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'w-full flex items-center gap-2 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 text-left';
        deleteButton.innerHTML = '<span class="material-symbols-outlined text-[18px]">delete</span>Eliminar';
        deleteButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            menu.classList.add('hidden');
            onDelete?.();
        });

        menu.addEventListener('click', event => event.stopPropagation());
        menu.append(renameButton, deleteButton);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            userMenu?.classList.add('hidden');
            closeAllActionMenus(menu);
            menu.classList.toggle('hidden');
        });

        wrapper.append(button, menu);
        return wrapper;
    };

    const createSortMenu = ({ value, onChange, size = 'md' }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative flex items-center justify-end';

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.sortToggle = 'true';
        button.className = size === 'lg'
            ? 'size-10 rounded-lg border border-border-dark bg-white dark:bg-surface-dark text-text-muted hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex items-center justify-center'
            : 'size-9 rounded-lg border border-border-dark bg-white dark:bg-surface-dark text-text-muted hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex items-center justify-center';
        button.setAttribute('aria-label', 'Ordenar actividades');
        button.title = SORT_LABELS[value] || 'Ordenar actividades';
        button.innerHTML = '<span class="material-symbols-outlined text-[18px]">sort</span>';

        const menu = document.createElement('div');
        menu.className = 'action-menu hidden absolute right-0 top-full mt-2 w-64 bg-white dark:bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-hidden z-40 text-gray-900 dark:text-white';

        const options = [
            { key: 'created-desc', label: SORT_LABELS['created-desc'], icon: 'schedule' },
            { key: 'created-asc', label: SORT_LABELS['created-asc'], icon: 'history' },
            { key: 'alpha-asc', label: SORT_LABELS['alpha-asc'], icon: 'sort_by_alpha' },
            { key: 'alpha-desc', label: SORT_LABELS['alpha-desc'], icon: 'sort_by_alpha' },
        ];

        const updateChecks = () => {
            Array.from(menu.querySelectorAll('button[data-sort]')).forEach((btn) => {
                const isActive = btn.dataset.sort === value;
                const check = btn.querySelector('.material-symbols-outlined.check');
                if (check) check.classList.toggle('opacity-0', !isActive);
            });
        };

        options.forEach((option) => {
            const optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.dataset.sort = option.key;
            optBtn.className = 'w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 text-left';
            optBtn.innerHTML = `
                <span class="inline-flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px]">${option.icon}</span>
                    ${option.label}
                </span>
                <span class="material-symbols-outlined check text-[18px] text-text-muted opacity-0">check</span>
            `;
            optBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                menu.classList.add('hidden');
                value = option.key;
                onChange?.(option.key);
                updateChecks();
            });
            menu.appendChild(optBtn);
        });

        menu.addEventListener('click', event => event.stopPropagation());

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            userMenu?.classList.add('hidden');
            closeAllActionMenus(menu);
            updateChecks();
            menu.classList.toggle('hidden');
        });

        wrapper.append(button, menu);
        return wrapper;
    };

    // ManageId helpers (per client prefix + counter)
    const stripDiacritics = (value) => {
        if (typeof value !== 'string') return '';
        return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
    };

    const buildManagePrefixFromName = (name) => {
        const cleaned = stripDiacritics(String(name || '')).trim();
        if (!cleaned) return 'XXX';

        const words = cleaned.split(/\s+/).filter(Boolean);
        const wordChars = words
            .map(word => (String(word).match(/[A-Za-z0-9]/g) || []).map(char => char.toUpperCase()))
            .filter(chars => chars.length > 0);

        if (wordChars.length === 0) return 'XXX';

        if (wordChars.length === 1) {
            const prefix = wordChars[0].join('').slice(0, 3);
            return prefix.padEnd(3, 'X');
        }

        if (wordChars.length === 2) {
            const [first, second] = wordChars;
            const prefixChars = [];
            if (first.length >= 2) {
                prefixChars.push(first[0], first[1], second[0] || '');
            } else {
                prefixChars.push(first[0] || '', second[0] || '', second[1] || '');
            }
            return prefixChars.join('').padEnd(3, 'X');
        }

        const prefix = wordChars.slice(0, 3).map(chars => chars[0]).join('');
        return prefix.padEnd(3, 'X');
    };

    const formatManageId = (prefix, number) => {
        const safePrefix = String(prefix || 'XX').toUpperCase();
        const safeNumber = Number.isFinite(Number(number)) ? Number(number) : 0;
        return `${safePrefix}-${String(safeNumber).padStart(3, '0')}`;
    };

    const parseManageNumber = (manageId) => {
        if (typeof manageId !== 'string') return null;
        const match = manageId.match(/-(\d{3,})$/);
        if (!match) return null;
        const num = Number.parseInt(match[1], 10);
        return Number.isFinite(num) ? num : null;
    };

    const getNextClientManageNumber = (prefix) => {
        const safePrefix = String(prefix || 'XXX').toUpperCase();
        let maxNumber = 0;
        for (const client of allClients) {
            const manageId = client?.manageId;
            if (!manageId || !manageId.startsWith(`${safePrefix}-`)) continue;
            const parsed = parseManageNumber(manageId);
            if (parsed && parsed > maxNumber) maxNumber = parsed;
        }
        return maxNumber + 1;
    };

    const countEntitiesForClient = (client) => {
        let count = 0;
        const projects = client?.projects || {};
        for (const project of Object.values(projects)) {
            if (!project) continue;
            count += 1; // project

            const projectTasks = project.tasks || {};
            for (const task of Object.values(projectTasks)) {
                if (!task) continue;
                count += 1; // task
                const subtasks = task.subtasks || {};
                count += Object.keys(subtasks).length;
            }

            const products = project.products || {};
            for (const product of Object.values(products)) {
                if (!product) continue;
                count += 1; // product
                const productTasks = product.tasks || {};
                for (const task of Object.values(productTasks)) {
                    if (!task) continue;
                    count += 1; // task
                    const subtasks = task.subtasks || {};
                    count += Object.keys(subtasks).length;
                }
            }
        }
        return count;
    };

    const getMaxManageNumberForClient = (client) => {
        let max = parseManageNumber(client?.manageId) || 0;
        const projects = client?.projects || {};
        for (const project of Object.values(projects)) {
            if (!project) continue;
            max = Math.max(max, parseManageNumber(project.manageId) || 0);

            const projectTasks = project.tasks || {};
            for (const task of Object.values(projectTasks)) {
                if (!task) continue;
                max = Math.max(max, parseManageNumber(task.manageId) || 0);
                const subtasks = task.subtasks || {};
                for (const subtask of Object.values(subtasks)) {
                    if (!subtask) continue;
                    max = Math.max(max, parseManageNumber(subtask.manageId) || 0);
                }
            }

            const products = project.products || {};
            for (const product of Object.values(products)) {
                if (!product) continue;
                max = Math.max(max, parseManageNumber(product.manageId) || 0);
                const productTasks = product.tasks || {};
                for (const task of Object.values(productTasks)) {
                    if (!task) continue;
                    max = Math.max(max, parseManageNumber(task.manageId) || 0);
                    const subtasks = task.subtasks || {};
                    for (const subtask of Object.values(subtasks)) {
                        if (!subtask) continue;
                        max = Math.max(max, parseManageNumber(subtask.manageId) || 0);
                    }
                }
            }
        }
        return max;
    };

    const ensureClientManageConfig = async (clientId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) throw new Error('Cliente no encontrado.');

        const prefix = client.managePrefix || buildManagePrefixFromName(client.name);

        const entityCount = countEntitiesForClient(client);
        const maxUsedNumber = getMaxManageNumberForClient(client);
        const desiredNext = Math.max(2, entityCount + 2, maxUsedNumber + 1);

        const updatesPayload = {};
        if (!client.managePrefix) updatesPayload.managePrefix = prefix;
        if (!client.manageId) updatesPayload.manageId = formatManageId(prefix, 1);
        if (typeof client.manageNextNumber !== 'number' || !Number.isFinite(client.manageNextNumber) || client.manageNextNumber < desiredNext) {
            updatesPayload.manageNextNumber = desiredNext;
        }

        if (Object.keys(updatesPayload).length > 0) {
            await update(ref(database, `clients/${clientId}`), updatesPayload);
            Object.assign(client, updatesPayload);
        }

        return { client, prefix };
    };

    const allocateNextManageId = async (clientId) => {
        const { client, prefix } = await ensureClientManageConfig(clientId);
        const nextRef = ref(database, `clients/${clientId}/manageNextNumber`);
        const result = await runTransaction(nextRef, (current) => {
            const safeCurrent = (typeof current === 'number' && Number.isFinite(current) && current >= 2)
                ? current
                : (typeof client.manageNextNumber === 'number' && Number.isFinite(client.manageNextNumber) && client.manageNextNumber >= 2 ? client.manageNextNumber : 2);
            return safeCurrent + 1;
        });

        if (!result.committed) {
            throw new Error('No se pudo reservar un manageId.');
        }

        const storedNext = result.snapshot.val();
        const allocatedNumber = storedNext - 1;
        client.manageNextNumber = storedNext;
        return formatManageId(prefix, allocatedNumber);
    };

    const normalizeSearchText = (value) => stripDiacritics(String(value ?? '')).toLowerCase();

    const getClientSearchQueryNormalized = () => normalizeSearchText(clientSearchQuery).trim();

    const clientMatchesQuery = (client, queryNorm) => {
        if (!queryNorm) return true;

        const includes = (value) => normalizeSearchText(value).includes(queryNorm);
        if (includes(client?.name) || includes(client?.manageId) || includes(client?.id)) return true;

        const projects = client?.projects || {};
        for (const [projectId, project] of Object.entries(projects)) {
            if (!project) continue;
            if (includes(project?.name) || includes(project?.manageId) || includes(projectId)) return true;

            const projectTasks = project?.tasks || {};
            for (const [taskId, task] of Object.entries(projectTasks)) {
                if (!task) continue;
                if (includes(task?.name) || includes(task?.manageId) || includes(taskId)) return true;

                const subtasks = task?.subtasks || {};
                for (const [subtaskId, subtask] of Object.entries(subtasks)) {
                    if (!subtask) continue;
                    if (includes(subtask?.name) || includes(subtask?.manageId) || includes(subtaskId)) return true;
                }
            }

            const products = project?.products || {};
            for (const [productId, product] of Object.entries(products)) {
                if (!product) continue;
                if (includes(product?.name) || includes(product?.manageId) || includes(productId)) return true;

                const productTasks = product?.tasks || {};
                for (const [taskId, task] of Object.entries(productTasks)) {
                    if (!task) continue;
                    if (includes(task?.name) || includes(task?.manageId) || includes(taskId)) return true;

                    const subtasks = task?.subtasks || {};
                    for (const [subtaskId, subtask] of Object.entries(subtasks)) {
                        if (!subtask) continue;
                        if (includes(subtask?.name) || includes(subtask?.manageId) || includes(subtaskId)) return true;
                    }
                }
            }
        }

        return false;
    };

    const getVisibleClients = () => {
        const queryNorm = getClientSearchQueryNormalized();
        if (!queryNorm) return allClients;
        return allClients.filter(client => clientMatchesQuery(client, queryNorm));
    };

    const getSearchQuery = () => String(clientSearchInput?.value || clientSearchQuery || '').trim();

    const hideSearchResults = () => {
        if (searchResultsPanel) searchResultsPanel.classList.add('hidden');
    };

    const showSearchResults = () => {
        if (searchResultsPanel) searchResultsPanel.classList.remove('hidden');
    };

    const buildActivitySearchResults = (queryRaw) => {
        const queryNorm = normalizeSearchText(queryRaw).trim();
        if (!queryNorm) return [];

        const results = [];
        const includes = (value) => normalizeSearchText(value).includes(queryNorm);
        const getName = (value, fallback) => {
            const text = String(value || '').trim();
            return text || fallback;
        };
        const makePath = (parts) => parts.filter(Boolean).join(' / ');
        const pushResult = (result) => results.push(result);

        const clients = Array.isArray(allClients) ? allClients : [];
        clients.forEach((client) => {
            if (!client) return;
            const clientId = client.id;
            const clientName = getName(client.name, 'Cliente');
            if (includes(clientName)) {
                pushResult({
                    type: 'client',
                    name: clientName,
                    manageId: client.manageId || '',
                    path: '',
                    clientId
                });
            }

            const projects = client.projects || {};
            Object.entries(projects).forEach(([projectId, project]) => {
                if (!project) return;
                const projectName = getName(project.name, 'Proyecto');
                const projectPath = makePath([clientName]);
                if (includes(projectName)) {
                    pushResult({
                        type: 'project',
                        name: projectName,
                        manageId: project.manageId || '',
                        path: projectPath,
                        clientId,
                        projectId
                    });
                }

                const projectTasks = project.tasks || {};
                Object.entries(projectTasks).forEach(([taskId, task]) => {
                    if (!task) return;
                    const taskName = getName(task.name, 'Tarea');
                    if (includes(taskName)) {
                        pushResult({
                            type: 'task',
                            name: taskName,
                            manageId: task.manageId || '',
                            path: makePath([clientName, projectName]),
                            clientId,
                            projectId,
                            taskId
                        });
                    }

                    const subtasks = task.subtasks || {};
                    Object.entries(subtasks).forEach(([subtaskId, subtask]) => {
                        if (!subtask) return;
                        const subtaskName = getName(subtask.name, 'Subtarea');
                        if (includes(subtaskName)) {
                            pushResult({
                                type: 'subtask',
                                name: subtaskName,
                                manageId: subtask.manageId || '',
                                path: makePath([clientName, projectName, taskName]),
                                clientId,
                                projectId,
                                taskId,
                                subtaskId
                            });
                        }
                    });
                });

                const products = project.products || {};
                Object.entries(products).forEach(([productId, product]) => {
                    if (!product) return;
                    const productName = getName(product.name, 'Producto');
                    if (includes(productName)) {
                        pushResult({
                            type: 'product',
                            name: productName,
                            manageId: product.manageId || '',
                            path: makePath([clientName, projectName]),
                            clientId,
                            projectId,
                            productId
                        });
                    }

                    const productTasks = product.tasks || {};
                    Object.entries(productTasks).forEach(([taskId, task]) => {
                        if (!task) return;
                        const taskName = getName(task.name, 'Tarea');
                        if (includes(taskName)) {
                            pushResult({
                                type: 'task',
                                name: taskName,
                                manageId: task.manageId || '',
                                path: makePath([clientName, projectName, productName]),
                                clientId,
                                projectId,
                                productId,
                                taskId
                            });
                        }

                        const subtasks = task.subtasks || {};
                        Object.entries(subtasks).forEach(([subtaskId, subtask]) => {
                            if (!subtask) return;
                            const subtaskName = getName(subtask.name, 'Subtarea');
                            if (includes(subtaskName)) {
                                pushResult({
                                    type: 'subtask',
                                    name: subtaskName,
                                    manageId: subtask.manageId || '',
                                    path: makePath([clientName, projectName, productName, taskName]),
                                    clientId,
                                    projectId,
                                    productId,
                                    taskId,
                                    subtaskId
                                });
                            }
                        });
                    });
                });
            });
        });

        return results.sort((a, b) => {
            const typeCompare = (a.type || '').localeCompare(b.type || '');
            if (typeCompare !== 0) return typeCompare;
            return (a.name || '').localeCompare(b.name || '');
        });
    };

    const focusSearchResult = (result) => {
        if (!result) return;
        const manageId = String(result.manageId || '').trim();
        if (!manageId) {
            alert('No se encontro un ID para abrir el detalle.');
            hideSearchResults();
            return;
        }
        openDetailViewForManageId(manageId);
        hideSearchResults();
    };

    const renderSearchResults = () => {
        if (!searchResultsPanel || !searchResultsList || !searchResultsEmpty) return;

        const query = getSearchQuery();
        if (!query) {
            hideSearchResults();
            return;
        }

        searchResultsList.innerHTML = '';
        searchResultsEmpty.classList.add('hidden');

        const results = buildActivitySearchResults(query);
        if (!results.length) {
            searchResultsEmpty.classList.remove('hidden');
            showSearchResults();
            return;
        }

        const iconByType = {
            client: 'folder',
            project: 'folder_open',
            product: 'category',
            task: 'check_circle',
            subtask: 'subdirectory_arrow_right'
        };
        const labelByType = {
            client: 'Cliente',
            project: 'Proyecto',
            product: 'Producto',
            task: 'Tarea',
            subtask: 'Subtarea'
        };

        results.forEach((result) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined text-text-muted';
            icon.textContent = iconByType[result.type] || 'search';

            const textWrap = document.createElement('div');
            textWrap.className = 'min-w-0 flex-1';

            const title = document.createElement('p');
            title.className = 'text-sm font-semibold text-gray-900 dark:text-white truncate';
            title.textContent = result.name || '';

            const meta = document.createElement('p');
            meta.className = 'text-xs text-text-muted truncate';
            const metaParts = [labelByType[result.type] || 'Actividad'];
            if (result.path) metaParts.push(result.path);
            if (result.manageId) metaParts.push(result.manageId);
            meta.textContent = metaParts.join(' - ');

            textWrap.append(title, meta);
            button.append(icon, textWrap);
            button.addEventListener('click', () => focusSearchResult(result));

            searchResultsList.appendChild(button);
        });

        showSearchResults();
    };

    const renderMessageCard = (container, { icon, title, description }) => {
        if (!container) return;
        container.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'flex items-start gap-3 rounded-lg border border-border-dark bg-white/80 dark:bg-surface-dark/60 p-3';

        const ic = document.createElement('span');
        ic.className = 'material-symbols-outlined text-primary';
        ic.textContent = icon || 'info';

        const textWrap = document.createElement('div');
        textWrap.className = 'flex flex-col min-w-0';

        const titleEl = document.createElement('p');
        titleEl.className = 'text-sm font-semibold text-gray-900 dark:text-white';
        titleEl.textContent = title || '';

        const descEl = document.createElement('p');
        descEl.className = 'text-xs text-text-muted mt-1';
        descEl.textContent = description || '';

        textWrap.append(titleEl, descEl);
        card.append(ic, textWrap);
        container.appendChild(card);
        container.classList.remove('hidden');
    };

    const renderClientListSkeleton = (rows = 6) => {
        if (!clientListNav) return;
        clientListNav.innerHTML = '';
        for (let i = 0; i < rows; i += 1) {
            const row = document.createElement('div');
            row.className = 'animate-pulse flex items-center gap-3 px-3 py-2 rounded-lg border border-border-dark bg-white/70 dark:bg-surface-dark/40';

            const icon = document.createElement('div');
            icon.className = 'h-6 w-6 rounded bg-white/10';

            const lines = document.createElement('div');
            lines.className = 'flex flex-col gap-2 flex-1 min-w-0';

            const line1 = document.createElement('div');
            line1.className = 'h-3 w-2/3 rounded bg-white/10';

            const line2 = document.createElement('div');
            line2.className = 'h-3 w-1/3 rounded bg-white/5';

            lines.append(line1, line2);
            row.append(icon, lines);
            clientListNav.appendChild(row);
        }
    };

    const renderTreeSkeleton = (rows = 4) => {
        if (!treeBody) return;
        treeBody.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.className = 'flex flex-col gap-2 animate-pulse';

        for (let i = 0; i < rows; i += 1) {
            const row = document.createElement('div');
            row.className = 'h-10 rounded-lg bg-white/5 border border-border-dark';
            wrap.appendChild(row);
        }

        treeBody.appendChild(wrap);
    };

    // Render list of clients
    const renderClients = () => {
        const sidebarOpenKeys = new Set(
            Array.from(clientListNav.querySelectorAll('details[open][data-tree-key]'))
                .map(el => el.dataset.treeKey)
                .filter(Boolean)
        );
        clientListNav.innerHTML = '';

        if (clientsLoading) {
            noClientsMessage?.classList.add('hidden');
            renderClientListSkeleton();
            return;
        }

        if (!currentUser) {
            renderMessageCard(noClientsMessage, {
                icon: 'lock',
                title: 'Inicia sesion para continuar.',
                description: 'Inicia sesion para continuar.',
            });
            return;
        }

        const query = String(clientSearchQuery || '').trim();
        const visibleClients = getVisibleClients();

        if (!allClients.length) {
            renderMessageCard(noClientsMessage, {
                icon: 'inbox',
                title: 'Comienza creando tu primer cliente',
                description: 'Usa "Añadir Cliente" para empezar.',
            });
            return;
        }

        if (!visibleClients.length) {
            renderMessageCard(noClientsMessage, {
                icon: 'search_off',
                title: 'Sin resultados',
                description: query ? `No encontramos coincidencias para "${query}".` : 'No encontramos coincidencias.',
            });
            return;
        }

        noClientsMessage?.classList.add('hidden');
        // Sidebar tree mode (clients -> projects -> products)
        const sortedClients = sortActivities(visibleClients);

        const makeChevron = (isOpen) => {
            const chevron = document.createElement('span');
            chevron.className = 'material-symbols-outlined text-[18px] text-text-muted dark:text-white';
            chevron.textContent = isOpen ? 'expand_more' : 'chevron_right';
            return chevron;
        };

        const makeSidebarRow = ({ icon, label, manageId, active = false, indentClass = '', chevron = null }) => {
            const row = document.createElement('div');
            row.className = `sidebar-row group flex items-center justify-between gap-2 px-3 py-1 text-text-muted dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors ${indentClass}`;
            if (active) row.classList.add('bg-gray-100', 'text-gray-900', 'dark:bg-white/5', 'dark:text-white');

            const left = document.createElement('div');
            left.className = 'flex items-center gap-2 flex-1 min-w-0';
            if (chevron) left.appendChild(chevron);

            const iconEl = document.createElement('span');
            iconEl.className = 'material-symbols-outlined dark:text-white';
            iconEl.textContent = icon;

            const nameWrap = document.createElement('div');
            nameWrap.className = 'flex items-center gap-2 min-w-0 flex-1';

            const name = document.createElement('span');
            name.className = 'text-sm font-semibold dark:text-white truncate';
            name.textContent = label || '';

            nameWrap.appendChild(name);
            if (manageId) {
                const idTag = createIdChip(manageId);
                nameWrap.appendChild(idTag);
            }

            left.append(iconEl, nameWrap);
            row.appendChild(left);

            return { row, nameEl: name };
        };

        const makeAddRow = ({ label, onClick, indentClass = '' }) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `sidebar-row sidebar-add-row flex items-center gap-2 w-full px-3 py-1 text-primary/80 dark:text-primary/70 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-primary dark:hover:text-primary transition-colors ${indentClass}`;
            button.innerHTML = '<span class="material-symbols-outlined text-[18px]">add</span>';
            const text = document.createElement('span');
            text.className = 'text-sm font-semibold dark:text-white truncate';
            text.textContent = label;
            button.appendChild(text);
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick?.();
            });
            return button;
        };

        sortedClients.forEach(client => {
            const clientKey = `client:${client.id}`;
            const clientDetails = document.createElement('details');
            clientDetails.dataset.treeKey = clientKey;
            clientDetails.className = 'sidebar-tree-box';
            clientDetails.open = sidebarOpenKeys.has(clientKey) || sidebarAutoOpenKeys.has(clientKey);

            const clientSummary = document.createElement('summary');
            clientSummary.className = 'list-none';

            const clientChevron = makeChevron(clientDetails.open);
            const clientActive = selectedClientId === client.id;
            const { row: clientRow, nameEl: clientNameEl } = makeSidebarRow({
                icon: 'folder_open',
                label: client.name || 'Cliente',
                manageId: client.manageId,
                active: clientActive,
                chevron: clientChevron,
            });

            clientSummary.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const nextOpen = !clientDetails.open;
                clientDetails.open = nextOpen;
                showProjectView(client.id, { autoOpen: nextOpen });
            });

            const clientActions = createActionMenu({
                onRename: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para editar clientes.");
                        return;
                    }
                    const nextNameRaw = prompt('Nuevo nombre del cliente', client.name);
                    if (nextNameRaw === null) return;
                    const nextName = nextNameRaw.trim();
                    if (!nextName || nextName === client.name) return;

                    try {
                        const previousName = client.name;
                        await update(ref(database, `clients/${client.id}`), { name: nextName });
                        await logActivity(
                            client.id,
                            `Renombró cliente "${previousName}" a "${nextName}".`,
                            { action: 'rename', path: `clients/${client.id}`, entityType: 'client' }
                        );
                        client.name = nextName;
                        clientNameEl.textContent = nextName;
                        if (selectedClientId === client.id) {
                            if (clientNameHeader) clientNameHeader.textContent = nextName;
                            if (productClientNameHeader) productClientNameHeader.textContent = nextName;
                        }
                        renderClients();
                        renderTree();
                    } catch (error) {
                        console.error('Error renaming client:', error);
                        alert(`No se pudo renombrar el cliente: ${error.message}`);
                    }
                },
                onDelete: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para eliminar clientes.");
                        return;
                    }
                    const confirmed = confirm(`¿Eliminar el cliente "${client.name}"?\n\nSe borrarán también sus proyectos, productos y tareas.`);
                    if (!confirmed) return;

                    try {
                        await remove(ref(database, `clients/${client.id}`));
                        allClients = allClients.filter(c => c.id !== client.id);
                        if (selectedClientId === client.id) {
                            showClientView();
                        }
                        renderClients();
                        renderTree();
                    } catch (error) {
                        console.error('Error deleting client:', error);
                        alert(`No se pudo eliminar el cliente: ${error.message}`);
                    }
                },
            });

            clientRow.appendChild(clientActions);
            clientSummary.appendChild(clientRow);
            clientDetails.appendChild(clientSummary);

            const clientChildren = document.createElement('div');
            clientChildren.className = 'pl-3 mt-2 flex flex-col gap-2';

            const projects = client?.projects || {};
            const projectArray = sortActivities(Object.keys(projects || {}).map(id => ({ id, ...projects[id] })));

            if (projectArray.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'px-3 py-1 text-xs text-text-muted';
                empty.textContent = 'Sin proyectos.';
                clientChildren.appendChild(empty);
            } else {
                projectArray.forEach(proj => {
                    const projectKey = `project:${client.id}:${proj.id}`;
                    const projectDetails = document.createElement('details');
                    projectDetails.dataset.treeKey = projectKey;
                    projectDetails.className = 'sidebar-tree-box';
                    projectDetails.open = sidebarOpenKeys.has(projectKey) || sidebarAutoOpenKeys.has(projectKey);

                    const projectSummary = document.createElement('summary');
                    projectSummary.className = 'list-none';

                    const projectChevron = makeChevron(projectDetails.open);
                    const projectActive = selectedClientId === client.id && selectedProjectId === proj.id;
                    const { row: projectRow, nameEl: projectNameEl } = makeSidebarRow({
                        icon: 'layers',
                        label: proj.name || 'Proyecto',
                        manageId: proj.manageId,
                        active: projectActive,
                        indentClass: 'pl-2',
                        chevron: projectChevron,
                    });

                    projectSummary.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const nextOpen = !projectDetails.open;
                        projectDetails.open = nextOpen;
                        showProductView(client.id, proj.id, { autoOpen: nextOpen });
                    });

                    const projectActions = createActionMenu({
                        onRename: async () => {
                            if (!currentUser) {
                                alert("Debes iniciar sesión para editar proyectos.");
                                return;
                            }
                            const nextNameRaw = prompt('Nuevo nombre del proyecto', proj.name);
                            if (nextNameRaw === null) return;
                            const nextName = nextNameRaw.trim();
                            if (!nextName || nextName === proj.name) return;

                            try {
                                const previousName = proj.name;
                                await update(ref(database, `clients/${client.id}/projects/${proj.id}`), { name: nextName });
                                await logActivity(
                                    client.id,
                                    `Renombró proyecto "${previousName}" a "${nextName}".`,
                                    { action: 'rename', path: `clients/${client.id}/projects/${proj.id}`, entityType: 'project' }
                                );
                                proj.name = nextName;
                                if (projects?.[proj.id]) projects[proj.id].name = nextName;
                                projectNameEl.textContent = nextName;
                                if (selectedClientId === client.id && selectedProjectId === proj.id) {
                                    if (projectNameHeader) projectNameHeader.textContent = nextName;
                                    if (!selectedProductId && projectDetailName) projectDetailName.textContent = nextName;
                                }
                                renderClients();
                                renderTree();
                            } catch (error) {
                                console.error('Error renaming project:', error);
                                alert(`No se pudo renombrar el proyecto: ${error.message}`);
                            }
                        },
                        onDelete: async () => {
                            if (!currentUser) {
                                alert("Debes iniciar sesión para eliminar proyectos.");
                                return;
                            }
                            const confirmed = confirm(`¿Eliminar el proyecto "${proj.name}"?\n\nSe borrarán también sus productos y tareas.`);
                            if (!confirmed) return;

                            try {
                                await remove(ref(database, `clients/${client.id}/projects/${proj.id}`));
                                await logActivity(
                                    client.id,
                                    `Eliminó proyecto "${proj.name}".`,
                                    { action: 'delete', path: `clients/${client.id}/projects/${proj.id}`, entityType: 'project' }
                                );
                                if (projects?.[proj.id]) delete projects[proj.id];
                                if (selectedClientId === client.id && selectedProjectId === proj.id) {
                                    showProjectView(client.id);
                                } else {
                                    renderClients();
                                }
                                renderTree();
                            } catch (error) {
                                console.error('Error deleting project:', error);
                                alert(`No se pudo eliminar el proyecto: ${error.message}`);
                            }
                        },
                    });

                    projectRow.appendChild(projectActions);
                    projectSummary.appendChild(projectRow);
                    projectDetails.appendChild(projectSummary);

                    const projectChildren = document.createElement('div');
                    projectChildren.className = 'pl-3 mt-2 flex flex-col gap-2';

                    const products = proj?.products || {};
                    const productArray = sortActivities(Object.keys(products || {}).map(id => ({ id, ...products[id] })));

                    if (productArray.length === 0) {
                        const empty = document.createElement('p');
                        empty.className = 'px-3 py-1 text-xs text-text-muted';
                        empty.textContent = 'Sin productos.';
                        projectChildren.appendChild(empty);
                    } else {
                        productArray.forEach(prod => {
                            const productActive =
                                selectedClientId === client.id &&
                                selectedProjectId === proj.id &&
                                selectedProductId === prod.id;

                            const { row: productRow, nameEl: productNameEl } = makeSidebarRow({
                                icon: 'category',
                                label: prod.name || 'Producto',
                                manageId: prod.manageId,
                                active: productActive,
                                indentClass: 'pl-4',
                            });

                            productRow.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                selectSidebarProduct(client.id, proj.id, prod.id);
                            });

                            const productActions = createActionMenu({
                                onRename: async () => {
                                    if (!currentUser) {
                                        alert("Debes iniciar sesión para editar productos.");
                                        return;
                                    }
                                    const nextNameRaw = prompt('Nuevo nombre del producto', prod.name);
                                    if (nextNameRaw === null) return;
                                    const nextName = nextNameRaw.trim();
                                    if (!nextName || nextName === prod.name) return;

                                    try {
                                        const previousName = prod.name;
                                        await update(ref(database, `clients/${client.id}/projects/${proj.id}/products/${prod.id}`), { name: nextName });
                                        await logActivity(
                                            client.id,
                                            `Renombró producto "${previousName}" a "${nextName}".`,
                                            { action: 'rename', path: `clients/${client.id}/projects/${proj.id}/products/${prod.id}`, entityType: 'product' }
                                        );
                                        prod.name = nextName;
                                        if (products?.[prod.id]) products[prod.id].name = nextName;
                                        productNameEl.textContent = nextName;
                                        if (
                                            selectedClientId === client.id &&
                                            selectedProjectId === proj.id &&
                                            selectedProductId === prod.id &&
                                            projectDetailName
                                        ) {
                                            projectDetailName.textContent = nextName;
                                        }
                                        renderClients();
                                        renderTree();
                                    } catch (error) {
                                        console.error('Error renaming product:', error);
                                        alert(`No se pudo renombrar el producto: ${error.message}`);
                                    }
                                },
                                onDelete: async () => {
                                    if (!currentUser) {
                                        alert("Debes iniciar sesión para eliminar productos.");
                                        return;
                                    }
                                    const confirmed = confirm(`¿Eliminar el producto "${prod.name}"?\n\nSe borrarán también sus tareas.`);
                                    if (!confirmed) return;

                                    try {
                                        await remove(ref(database, `clients/${client.id}/projects/${proj.id}/products/${prod.id}`));
                                        await logActivity(
                                            client.id,
                                            `Eliminó producto "${prod.name}".`,
                                            { action: 'delete', path: `clients/${client.id}/projects/${proj.id}/products/${prod.id}`, entityType: 'product' }
                                        );
                                        if (products?.[prod.id]) delete products[prod.id];
                                        if (
                                            selectedClientId === client.id &&
                                            selectedProjectId === proj.id &&
                                            selectedProductId === prod.id
                                        ) {
                                            selectedProductId = null;
                                            selectedTaskId = null;
                                            selectedSubtaskId = null;
                                            if (projectDetail) projectDetail.classList.remove('hidden');
                                            if (projectDetailName) projectDetailName.textContent = proj?.name || 'Selecciona un proyecto';
                                            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto.';
                                            renderTasks(client.id, proj.id, null);
                                        }
                                        renderClients();
                                        renderTree();
                                    } catch (error) {
                                        console.error('Error deleting product:', error);
                                        alert(`No se pudo eliminar el producto: ${error.message}`);
                                    }
                                },
                            });

                            productRow.appendChild(productActions);
                            projectChildren.appendChild(productRow);
                        });
                    }

                    projectDetails.appendChild(projectChildren);
                    clientChildren.appendChild(projectDetails);
                });
            }

            clientChildren.appendChild(makeAddRow({
                label: 'Añadir proyecto',
                onClick: () => {
                    showProjectView(client.id);
                    openProjectModal();
                }
            }));

            clientDetails.appendChild(clientChildren);
            clientListNav.appendChild(clientDetails);
        });

        sidebarAutoOpenKeys.clear();
        return;
        visibleClients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        visibleClients.forEach(client => {
                const row = document.createElement('div');
                row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-text-muted hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors';
                row.dataset.clientId = client.id;

                const selectButton = document.createElement('button');
                selectButton.type = 'button';
                selectButton.className = 'flex items-center gap-3 flex-1 min-w-0 text-left';

                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined';
                icon.textContent = 'folder_open';

                const nameWrapper = document.createElement('div');
                nameWrapper.className = 'flex items-center gap-2 min-w-0';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'text-sm font-medium truncate';
                nameSpan.textContent = client.name;

                const idTag = createIdChip(client.manageId);

                nameWrapper.append(nameSpan, idTag);
                selectButton.append(icon, nameWrapper);
                selectButton.addEventListener('click', () => {
                    showProjectView(client.id);
                });

                const actions = createActionMenu({
                    onRename: async () => {
                        if (!currentUser) {
                            alert("Debes iniciar sesión para editar clientes.");
                            return;
                        }
                        const nextNameRaw = prompt('Nuevo nombre del cliente', client.name);
                        if (nextNameRaw === null) return;
                        const nextName = nextNameRaw.trim();
                        if (!nextName || nextName === client.name) return;

                        try {
                            const previousName = client.name;
                            await update(ref(database, `clients/${client.id}`), { name: nextName });
                            await logActivity(
                                client.id,
                                `Renombró cliente "${previousName}" a "${nextName}".`,
                                { action: 'rename', path: `clients/${client.id}`, entityType: 'client' }
                            );
                            client.name = nextName;
                            nameSpan.textContent = nextName;
                            if (selectedClientId === client.id) {
                                if (clientNameHeader) clientNameHeader.textContent = nextName;
                                if (productClientNameHeader) productClientNameHeader.textContent = nextName;
                            }
                            renderClients();
                        } catch (error) {
                            console.error('Error renaming client:', error);
                            alert(`No se pudo renombrar el cliente: ${error.message}`);
                        }
                    },
                    onDelete: async () => {
                        if (!currentUser) {
                            alert("Debes iniciar sesión para eliminar clientes.");
                            return;
                        }
                        const confirmed = confirm(`¿Eliminar el cliente "${client.name}"?\n\nSe borrarán también sus proyectos, productos y tareas.`);
                        if (!confirmed) return;

                        try {
                            await remove(ref(database, `clients/${client.id}`));
                            allClients = allClients.filter(c => c.id !== client.id);
                            if (selectedClientId === client.id) {
                                showClientView();
                            }
                            renderClients();
                            renderTree();
                        } catch (error) {
                            console.error('Error deleting client:', error);
                            alert(`No se pudo eliminar el cliente: ${error.message}`);
                        }
                    },
                });

                row.append(selectButton, actions);
                clientListNav.appendChild(row);
            });
    };

    // View toggles
    const showClientView = () => {
        selectedClientId = null;
        selectedProjectId = null;
        selectedProductId = null;
        hideEl(backToClientsBtn);
        hideEl(backToProjectsBtn);
        resetProjectDetail();
        showEl(treeView);
        hideEl(productListSection);
        hideEl(projectListSection);
        showEl(clientListSection);
        renderClients();
        updateActivityPath();
        renderTree();
        renderStatusDashboard();
    };

    const resetProjectDetail = () => {
        selectedProjectId = null;
        selectedProductId = null;
        selectedTaskId = null;
        selectedSubtaskId = null;
        if (projectDetail) projectDetail.classList.add('hidden');
        if (projectDetailName) projectDetailName.textContent = 'Selecciona un proyecto';
        if (projectDetailSub) projectDetailSub.textContent = 'Selecciona un proyecto en la barra lateral.';
        if (taskList) taskList.innerHTML = '';
        if (noTasksMessage) {
            noTasksMessage.textContent = 'Selecciona un proyecto o producto para ver tareas.';
            noTasksMessage.classList.remove('hidden');
        }
        if (subtaskList) subtaskList.innerHTML = '';
        if (noSubtasksMessage) {
            noSubtasksMessage.textContent = 'Selecciona una tarea para ver sus subtareas.';
            noSubtasksMessage.classList.remove('hidden');
        }
        hideEl(subtaskSection);
    };

    const showProjectView = (clientId, { autoOpen = true } = {}) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        selectedClientId = clientId;
        selectedProjectId = null;
        selectedProductId = null;
        if (autoOpen) sidebarAutoOpenKeys = new Set([`client:${clientId}`]);
        ensureClientManageConfig(clientId).catch(error => console.error('Error ensuring manageId config:', error));
        if (clientNameHeader) clientNameHeader.textContent = client.name;
        resetProjectDetail();
        showEl(treeView);
        hideEl(productListSection);
        hideEl(projectListSection);
        showEl(clientListSection);
        hideEl(backToClientsBtn);
        hideEl(backToProjectsBtn);
        renderClients();
        updateActivityPath();
        renderTree();
        renderStatusDashboard();
    };

    const showProductView = (clientId, projectId, { autoOpen = true } = {}) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        const project = client.projects?.[projectId];
        if (!project) return;

        selectedClientId = clientId;
        selectedProjectId = projectId;
        selectedProductId = null;
        selectedTaskId = null;
        selectedSubtaskId = null;
        if (autoOpen) sidebarAutoOpenKeys = new Set([`client:${clientId}`, `project:${clientId}:${projectId}`]);
        ensureClientManageConfig(clientId).catch(error => console.error('Error ensuring manageId config:', error));

        if (productClientNameHeader) productClientNameHeader.textContent = client.name;
        if (projectNameHeader) projectNameHeader.textContent = project.name;

        if (projectDetail) projectDetail.classList.remove('hidden');
        if (projectDetailName) projectDetailName.textContent = project.name;
        const hasProducts = !!Object.keys(project.products || {}).length;
        if (projectDetailSub) {
            projectDetailSub.textContent = hasProducts
                ? 'Selecciona un producto para ver tareas.'
                : 'Tareas del proyecto.';
        }
        renderTasks(clientId, projectId, null);

        showEl(treeView);
        hideEl(productListSection);
        hideEl(projectListSection);
        showEl(clientListSection);
        hideEl(backToClientsBtn);
        hideEl(backToProjectsBtn);
        renderClients();
        updateActivityPath();
        renderTree();
        renderStatusDashboard();
    };

    const setTaskCreationContext = (clientId, projectId, productId = null) => {
        taskCreationContext = { clientId, projectId, productId };
        ensureClientManageConfig(clientId).catch(error => console.error('Error ensuring manageId config:', error));
    };

    const setProductCreationContext = (clientId, projectId) => {
        productCreationContext = { clientId, projectId };
        ensureClientManageConfig(clientId).catch(error => console.error('Error ensuring manageId config:', error));
    };

    const selectSidebarProduct = (clientId, projectId, productId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        const project = client.projects?.[projectId];
        if (!project) return;
        const product = project.products?.[productId];
        if (!product) return;

        selectedClientId = clientId;
        selectedProjectId = projectId;
        selectedProductId = productId;
        selectedTaskId = null;
        selectedSubtaskId = null;
        sidebarAutoOpenKeys = new Set([`client:${clientId}`, `project:${clientId}:${projectId}`]);
        ensureClientManageConfig(clientId).catch(error => console.error('Error ensuring manageId config:', error));

        if (projectDetail) projectDetail.classList.remove('hidden');
        if (projectDetailName) projectDetailName.textContent = product.name || 'Producto';
        if (projectDetailSub) projectDetailSub.textContent = 'Tareas del producto.';
        renderTasks(clientId, projectId, productId);

        showEl(treeView);
        hideEl(productListSection);
        hideEl(projectListSection);
        showEl(clientListSection);
        hideEl(backToClientsBtn);
        hideEl(backToProjectsBtn);
        renderClients();
        updateActivityPath();
        renderTree();
        renderStatusDashboard();
    };

    // Modal handling
    const openModal = () => {
        addClientModal.classList.remove('hidden');
        setTimeout(() => companyNameInput?.focus(), 50);
    };

    const closeModal = () => {
        addClientModal.classList.add('hidden');
        addClientForm?.reset();
    };

    const openProjectModal = () => {
        if (!selectedClientId) {
            alert('Primero selecciona un cliente.');
            return;
        }
        resetProjectAutomationSelection();
        loadProjectAutomations();
        addProjectModal.classList.remove('hidden');
        setTimeout(() => projectNameInput?.focus(), 50);
    };

    const closeProjectModal = () => {
        addProjectModal.classList.add('hidden');
        addProjectForm?.reset();
        resetProjectAutomationSelection();
    };

    const openProductModal = () => {
        const target = productCreationContext || { clientId: selectedClientId, projectId: selectedProjectId };
        if (!target.clientId || !target.projectId) {
            alert('Selecciona un proyecto primero.');
            return;
        }
        addProductModal.classList.remove('hidden');
        setTimeout(() => productNameInput?.focus(), 50);
    };

    const closeProductModal = () => {
        addProductModal.classList.add('hidden');
        addProductForm?.reset();
        productCreationContext = null;
    };

    const openTaskModal = () => {
        const target = taskCreationContext || { clientId: selectedClientId, projectId: selectedProjectId, productId: selectedProductId };
        if (!target.clientId || !target.projectId) {
            alert('Selecciona un proyecto primero.');
            return;
        }
        const client = allClients.find(c => c.id === target.clientId);
        const project = client?.projects?.[target.projectId];
        const hasProducts = !!(project && Object.keys(project.products || {}).length);
        if (hasProducts && !target.productId) {
            alert('Selecciona un producto para crear tareas.');
            return;
        }
        addTaskModal.classList.remove('hidden');
        setTimeout(() => taskNameInput?.focus(), 50);
    };

    const closeTaskModal = () => {
        addTaskModal.classList.add('hidden');
        addTaskForm?.reset();
        taskCreationContext = null;
    };

    const openSubtaskModal = () => {
        if (!selectedClientId || !selectedProjectId || !selectedTaskId) {
            alert('Selecciona una tarea primero.');
            return;
        }
        addSubtaskModal.classList.remove('hidden');
        setTimeout(() => subtaskNameInput?.focus(), 50);
    };

    const closeSubtaskModal = () => {
        addSubtaskModal.classList.add('hidden');
        addSubtaskForm?.reset();
    };

    // Render projects of selected client
    const renderProjects = (clientId) => {
        if (!projectListNav || !noProjectsMessage) return;
        projectListNav.innerHTML = '';
        projectListNav.appendChild(noProjectsMessage);
        const client = allClients.find(c => c.id === clientId);
        const projects = client?.projects || {};
        const projectArray = sortActivities(Object.keys(projects || {}).map(key => ({ id: key, ...projects[key] })));
        if (projectArray.length === 0) {
            noProjectsMessage.textContent = 'No hay proyectos.';
            noProjectsMessage.classList.remove('hidden');
            return;
        }
        noProjectsMessage.classList.add('hidden');
        projectArray.forEach(proj => {
            const row = document.createElement('div');
            row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-text-muted dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors';
            row.dataset.projectId = proj.id;

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'flex items-center gap-3 flex-1 min-w-0 text-left';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = 'layers';

            const nameWrapper = document.createElement('div');
            nameWrapper.className = 'flex items-center gap-2 min-w-0';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm font-medium truncate';
            nameSpan.textContent = proj.name;

            const idTag = createIdChip(proj.manageId);

            nameWrapper.append(nameSpan, idTag);
            selectButton.append(icon, nameWrapper);
            selectButton.addEventListener('click', () => {
                showProductView(clientId, proj.id);
            });

            const actions = createActionMenu({
                onRename: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para editar proyectos.");
                        return;
                    }
                    const nextNameRaw = prompt('Nuevo nombre del proyecto', proj.name);
                    if (nextNameRaw === null) return;
                    const nextName = nextNameRaw.trim();
                    if (!nextName || nextName === proj.name) return;

                    try {
                        const previousName = proj.name;
                        await update(ref(database, `clients/${clientId}/projects/${proj.id}`), { name: nextName });
                        await logActivity(
                            clientId,
                            `Renombró proyecto "${previousName}" a "${nextName}".`,
                            { action: 'rename', path: `clients/${clientId}/projects/${proj.id}`, entityType: 'project' }
                        );
                        proj.name = nextName;
                        if (client?.projects?.[proj.id]) client.projects[proj.id].name = nextName;
                        nameSpan.textContent = nextName;
                        if (selectedClientId === clientId && selectedProjectId === proj.id) {
                            if (projectNameHeader) projectNameHeader.textContent = nextName;
                            if (!selectedProductId && projectDetailName) projectDetailName.textContent = nextName;
                        }
                        renderClients();
                    } catch (error) {
                        console.error('Error renaming project:', error);
                        alert(`No se pudo renombrar el proyecto: ${error.message}`);
                    }
                    renderTree();
                },
                onDelete: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para eliminar proyectos.");
                        return;
                    }
                    const confirmed = confirm(`¿Eliminar el proyecto "${proj.name}"?\n\nSe borrarán también sus productos y tareas.`);
                    if (!confirmed) return;

                    try {
                        await remove(ref(database, `clients/${clientId}/projects/${proj.id}`));
                        await logActivity(
                            clientId,
                            `Eliminó proyecto "${proj.name}".`,
                            { action: 'delete', path: `clients/${clientId}/projects/${proj.id}`, entityType: 'project' }
                        );
                        if (client?.projects?.[proj.id]) delete client.projects[proj.id];
                        if (selectedClientId === clientId && selectedProjectId === proj.id) {
                            showProjectView(clientId);
                        } else {
                            renderClients();
                        }
                        renderTree();
                    } catch (error) {
                        console.error('Error deleting project:', error);
                        alert(`No se pudo eliminar el proyecto: ${error.message}`);
                    }
                },
            });

            row.append(selectButton, actions);
            projectListNav.appendChild(row);
        });
    };

    const renderProducts = (clientId, projectId) => {
        if (!productListNav || !noProductsMessage) return;
        productListNav.innerHTML = '';
        productListNav.appendChild(noProductsMessage);

        const client = allClients.find(c => c.id === clientId);
        const project = client?.projects?.[projectId];
        const products = project?.products || {};
        const productArray = sortActivities(Object.keys(products || {}).map(key => ({ id: key, ...products[key] })));

        if (productArray.length === 0) {
            noProductsMessage.textContent = 'No hay productos.';
            noProductsMessage.classList.remove('hidden');
            return;
        }

        noProductsMessage.classList.add('hidden');
        productArray.forEach(prod => {
            const row = document.createElement('div');
            row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-text-muted dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors';
            row.dataset.productId = prod.id;

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'flex items-center gap-3 flex-1 min-w-0 text-left';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = 'category';

            const nameWrapper = document.createElement('div');
            nameWrapper.className = 'flex items-center gap-2 min-w-0';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm font-medium truncate';
            nameSpan.textContent = prod.name;

            const idTag = createIdChip(prod.manageId);

            nameWrapper.append(nameSpan, idTag);
            selectButton.append(icon, nameWrapper);
            selectButton.addEventListener('click', () => {
                selectedProductId = prod.id;
                selectedTaskId = null;
                selectedSubtaskId = null;
                if (projectDetail) projectDetail.classList.remove('hidden');
                if (projectDetailName) projectDetailName.textContent = prod.name;
                if (projectDetailSub) projectDetailSub.textContent = 'Tareas del producto.';
                renderTasks(clientId, projectId, prod.id);
                updateActivityPath();
                renderStatusDashboard();
            });

            const actions = createActionMenu({
                onRename: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para editar productos.");
                        return;
                    }
                    const nextNameRaw = prompt('Nuevo nombre del producto', prod.name);
                    if (nextNameRaw === null) return;
                    const nextName = nextNameRaw.trim();
                    if (!nextName || nextName === prod.name) return;

                    try {
                        const previousName = prod.name;
                        await update(ref(database, `clients/${clientId}/projects/${projectId}/products/${prod.id}`), { name: nextName });
                        await logActivity(
                            clientId,
                            `Renombró producto "${previousName}" a "${nextName}".`,
                            { action: 'rename', path: `clients/${clientId}/projects/${projectId}/products/${prod.id}`, entityType: 'product' }
                        );
                        prod.name = nextName;
                        if (project?.products?.[prod.id]) project.products[prod.id].name = nextName;
                        if (selectedClientId === clientId && selectedProjectId === projectId && selectedProductId === prod.id) {
                            if (projectDetailName) projectDetailName.textContent = nextName;
                        }
                        renderClients();
                        renderTree();
                    } catch (error) {
                        console.error('Error renaming product:', error);
                        alert(`No se pudo renombrar el producto: ${error.message}`);
                    }
                },
                onDelete: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para eliminar productos.");
                        return;
                    }
                    const confirmed = confirm(`¿Eliminar el producto "${prod.name}"?\n\nSe borrarán también sus tareas.`);
                    if (!confirmed) return;

                    try {
                        await remove(ref(database, `clients/${clientId}/projects/${projectId}/products/${prod.id}`));
                        await logActivity(
                            clientId,
                            `Eliminó producto "${prod.name}".`,
                            { action: 'delete', path: `clients/${clientId}/projects/${projectId}/products/${prod.id}`, entityType: 'product' }
                        );
                        if (project?.products?.[prod.id]) delete project.products[prod.id];
                        if (selectedClientId === clientId && selectedProjectId === projectId && selectedProductId === prod.id) {
                            selectedProductId = null;
                            selectedTaskId = null;
                            selectedSubtaskId = null;
                            if (projectDetail) projectDetail.classList.remove('hidden');
                            if (projectDetailName) projectDetailName.textContent = project?.name || 'Selecciona un proyecto';
                            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto.';
                            renderTasks(clientId, projectId, null);
                        }
                        renderClients();
                        renderTree();
                    } catch (error) {
                        console.error('Error deleting product:', error);
                        alert(`No se pudo eliminar el producto: ${error.message}`);
                    }
                },
            });

            row.append(selectButton, actions);
            productListNav.appendChild(row);
        });
    };

    const renderSubtasks = (clientId, projectId, productId, taskId) => {
        if (!subtaskList || !noSubtasksMessage) return;

        subtaskList.innerHTML = '';
        selectedSubtaskId = null;

        const client = allClients.find(c => c.id === clientId);
        const project = client?.projects?.[projectId];
        const tasks = productId
            ? (project?.products?.[productId]?.tasks || {})
            : (project?.tasks || {});
        const task = tasks?.[taskId];
        const subtasks = task?.subtasks || {};
        const subtaskArray = sortActivities(Object.keys(subtasks || {}).map(key => ({ id: key, ...subtasks[key] })));

        if (!task) {
            noSubtasksMessage.textContent = 'Selecciona una tarea para ver sus subtareas.';
            noSubtasksMessage.classList.remove('hidden');
            return;
        }

        if (subtaskArray.length === 0) {
            noSubtasksMessage.textContent = 'No hay subtareas para esta tarea.';
            noSubtasksMessage.classList.remove('hidden');
            return;
        }

        noSubtasksMessage.classList.add('hidden');
        const activityGrid = 'grid grid-cols-[minmax(0,1fr)_140px_260px_32px]';

        const headerRow = document.createElement('div');
        headerRow.className = `${activityGrid} items-center gap-2 px-3 pt-1 pb-2 text-[11px] text-text-muted uppercase tracking-wider`;
        headerRow.append(
            Object.assign(document.createElement('span'), { textContent: 'Nombre' }),
            Object.assign(document.createElement('span'), { textContent: 'Estado' }),
            Object.assign(document.createElement('span'), { textContent: 'Asignado a' }),
            document.createElement('span')
        );
        subtaskList.appendChild(headerRow);

        const basePath = productId
            ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}/subtasks`
            : `clients/${clientId}/projects/${projectId}/tasks/${taskId}/subtasks`;

        subtaskArray.forEach(subtask => {
            const row = document.createElement('div');
            row.className = `group ${activityGrid} items-center gap-2 px-3 py-2 rounded-lg border border-border-dark bg-white dark:bg-surface-darker text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors`;
            row.dataset.subtaskId = subtask.id;

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'flex items-center gap-3 min-w-0 text-left';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined text-text-muted';
            icon.textContent = 'subdirectory_arrow_right';

            const nameWrap = document.createElement('span');
            nameWrap.className = 'inline-flex items-baseline gap-1 min-w-0';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm font-medium truncate';
            nameSpan.textContent = subtask.name;
            nameWrap.appendChild(nameSpan);

            const subtaskPath = `${basePath}/${subtask.id}`;
            const statusControl = createStatusControl({
                status: subtask.status,
                onChange: async (nextStatus) => {
                    await updateStatusAtPath(subtaskPath, nextStatus);
                    subtask.status = nextStatus;
                    if (subtasks?.[subtask.id]) subtasks[subtask.id].status = nextStatus;
                    renderTree();
                }
            });

            const assigneeControl = createAssigneeControl({
                assigneeUid: subtask.assigneeUid,
                onChange: async (nextUid) => {
                    await updateAssigneeAtPath(subtaskPath, nextUid);
                    subtask.assigneeUid = nextUid;
                    if (subtasks?.[subtask.id]) subtasks[subtask.id].assigneeUid = nextUid;
                    renderTree();
                }
            });
            const idTag = createIdChip(subtask.manageId);
            idTag.classList.add('text-[11px]');
            if (subtask.manageId) nameWrap.appendChild(idTag);

            selectButton.append(icon, nameWrap);
            selectButton.addEventListener('click', () => {
                selectedSubtaskId = subtask.id;
            });

            const actions = createActionMenu({
                onRename: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para editar subtareas.");
                        return;
                    }
                    const nextNameRaw = prompt('Nuevo nombre de la subtarea', subtask.name);
                    if (nextNameRaw === null) return;
                    const nextName = nextNameRaw.trim();
                    if (!nextName || nextName === subtask.name) return;

                    try {
                        const previousName = subtask.name;
                        await update(ref(database, `${basePath}/${subtask.id}`), { name: nextName });
                        await logActivity(
                            clientId,
                            `Renombró subtarea "${previousName}" a "${nextName}".`,
                            { action: 'rename', path: `${basePath}/${subtask.id}`, entityType: 'subtask' }
                        );
                        subtask.name = nextName;
                        if (subtasks?.[subtask.id]) subtasks[subtask.id].name = nextName;
                        renderSubtasks(clientId, projectId, productId, taskId);
                    } catch (error) {
                        console.error('Error renaming subtask:', error);
                        alert(`No se pudo renombrar la subtarea: ${error.message}`);
                    }
                },
                onDelete: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para eliminar subtareas.");
                        return;
                    }
                    const confirmed = confirm(`¿Eliminar la subtarea "${subtask.name}"?`);
                    if (!confirmed) return;

                    try {
                        await remove(ref(database, `${basePath}/${subtask.id}`));
                        await logActivity(
                            clientId,
                            `Eliminó subtarea "${subtask.name}".`,
                            { action: 'delete', path: `${basePath}/${subtask.id}`, entityType: 'subtask' }
                        );
                        if (subtasks?.[subtask.id]) delete subtasks[subtask.id];
                        if (selectedSubtaskId === subtask.id) selectedSubtaskId = null;
                        renderSubtasks(clientId, projectId, productId, taskId);
                    } catch (error) {
                        console.error('Error deleting subtask:', error);
                        alert(`No se pudo eliminar la subtarea: ${error.message}`);
                    }
                },
            });

            row.append(selectButton, statusControl, assigneeControl, actions);
            subtaskList.appendChild(row);
        });
    };

    // Render full tree on right panel
    const renderTree = () => {
        if (!treeBody) return;

        const openManageIds = new Set(
            Array.from(treeBody.querySelectorAll('details[open][data-manage-id]'))
                .map(el => el.dataset.manageId)
                .filter(Boolean)
        );
        const openTaskPanels = new Set(
            Array.from(treeBody.querySelectorAll('[data-task-panel-id]'))
                .filter(panel => !panel.classList.contains('hidden'))
                .map(panel => panel.dataset.taskPanelId)
                .filter(Boolean)
        );
        treeBody.innerHTML = '';

        if (clientsLoading) {
            renderTreeSkeleton();
            updateTreeExpandToggle();
            return;
        }

        const query = String(clientSearchQuery || '').trim();
        const visibleClients = getVisibleClients();

        const renderTreeState = ({ icon, title, description }) => {
            const card = document.createElement('div');
            card.className = 'flex items-start gap-3 rounded-lg border border-border-dark bg-white/80 dark:bg-surface-dark/60 p-4';

            const ic = document.createElement('span');
            ic.className = 'material-symbols-outlined text-primary';
            ic.textContent = icon || 'info';

            const textWrap = document.createElement('div');
            textWrap.className = 'flex flex-col min-w-0';

            const titleEl = document.createElement('p');
            titleEl.className = 'text-sm font-semibold text-gray-900 dark:text-white';
            titleEl.textContent = title || '';

            const descEl = document.createElement('p');
            descEl.className = 'text-xs text-text-muted mt-1';
            descEl.textContent = description || '';

            textWrap.append(titleEl, descEl);
            card.append(ic, textWrap);
            treeBody.appendChild(card);
        };

        if (!currentUser) {
            renderTreeState({
                icon: 'lock',
                title: 'Inicia sesion para continuar.',
                description: 'Inicia sesion para continuar.',
            });
            updateTreeExpandToggle();
            return;
        }

        if (!allClients.length) {
            renderTreeState({
                icon: 'inbox',
                title: 'Comienza creando tu primer cliente',
                description: 'Usa "Añadir Cliente" para empezar.',
            });
            updateTreeExpandToggle();
            return;
        }

        if (!visibleClients.length) {
            renderTreeState({
                icon: 'search_off',
                title: 'Sin resultados',
                description: query ? `No encontramos coincidencias para "${query}".` : 'No encontramos coincidencias.',
            });
            updateTreeExpandToggle();
            return;
        }

        const selectionClientId = selectedClientId;
        const selectionProjectId = selectedProjectId;
        const selectionProductId = selectionProjectId ? selectedProductId : null;

        const baseClients = selectionClientId
            ? allClients.filter(c => c.id === selectionClientId)
            : visibleClients;
        const clientsToRender = sortActivities(baseClients);

        const treeGrid = 'grid grid-cols-[minmax(0,1fr)_140px_260px_220px] items-center gap-1';

        const applyDepthPadding = (el, depth = 0) => {
            if (!el) return;
            const amount = Math.max(0, Number(depth) || 0) * 16;
            el.style.paddingLeft = `${amount}px`;
        };

        const makeTreeActionRow = (actions, depth = 0) => {
            const row = document.createElement('div');
            row.className = `${treeGrid} items-center`;

            const cell = document.createElement('div');
            cell.className = 'col-span-4 flex flex-wrap items-center gap-2 px-3 py-2';

            const indent = document.createElement('span');
            indent.className = 'shrink-0';
            indent.style.width = `${Math.max(0, Number(depth) || 0) * 16}px`;
            cell.appendChild(indent);

            (actions || []).forEach((action) => {
                if (!action) return;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'inline-flex items-center gap-2 h-8 px-3 rounded-md border border-dashed border-border-dark/70 text-text-muted hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-xs font-semibold';
                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined text-[16px]';
                icon.textContent = action.icon || 'add';
                const label = document.createElement('span');
                label.textContent = action.label || '';
                button.append(icon, label);
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    action.onClick?.();
                });
                cell.appendChild(button);
            });

            row.appendChild(cell);
            return row;
        };

        const computeTasksProgress = (tasksObject) => {
            const tasks = Object.values(tasksObject || {}).filter(Boolean);
            const total = tasks.length;
            const done = tasks.reduce((acc, task) => (normalizeStatus(task?.status) === 'Finalizado' ? acc + 1 : acc), 0);
            return { done, total };
        };

        const computeProjectProgress = (project) => {
            const progress = computeTasksProgress(project?.tasks);
            const products = project?.products || {};
            for (const product of Object.values(products)) {
                if (!product) continue;
                const productProgress = computeTasksProgress(product.tasks);
                progress.done += productProgress.done;
                progress.total += productProgress.total;
            }
            return progress;
        };

        const makeSummary = (icon, name, manageId, status = null, onStatusChange = null, progressInfo = null, depth = 0, kind = '', options = {}) => {
            const summary = document.createElement('summary');
            summary.className = `${treeGrid} cursor-pointer select-none px-3 py-2 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg list-none`;

            const nameCell = document.createElement('div');
            nameCell.className = 'flex items-center gap-2 min-w-0';
            const indent = document.createElement('span');
            indent.className = 'shrink-0';
            indent.style.width = `${Math.max(0, Number(depth) || 0) * 16}px`;
            const ic = document.createElement('span');
            ic.className = 'material-symbols-outlined text-text-muted';
            ic.textContent = icon;
            const nameWrap = document.createElement('span');
            nameWrap.className = 'inline-flex items-baseline gap-1 min-w-0';

            const title = document.createElement('span');
            const titleClassByKind = {
                client: 'text-base font-bold',
                project: 'text-sm font-bold',
                product: 'text-sm font-normal',
            };
            const titleClasses = titleClassByKind[kind] || 'text-sm font-semibold';
            title.className = `${titleClasses} truncate flex-1 min-w-0`;
            title.textContent = name;
            nameWrap.appendChild(title);

            if (manageId) {
                const chip = createIdChip(manageId);
                chip.classList.add('text-[11px]', 'shrink-0');
                nameWrap.appendChild(chip);
            }

            nameCell.append(indent, ic, nameWrap);

            const statusCell = document.createElement('div');
            if (status !== null) {
                const statusControl = createStatusControl({
                    status,
                    onChange: async (nextStatus) => {
                        if (typeof onStatusChange === 'function') {
                            await onStatusChange(nextStatus);
                        }
                    }
                });
                statusCell.appendChild(statusControl);
            }

            const metaCell = document.createElement('div');
            metaCell.className = 'min-w-0';

            if (progressInfo && typeof progressInfo === 'object') {
                const total = Number(progressInfo.total) || 0;
                const done = Number(progressInfo.done) || 0;
                const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;

                const wrap = document.createElement('div');
                wrap.className = 'flex items-center gap-2 min-w-0';
                wrap.title = total > 0 ? `Progreso: ${done}/${total} finalizadas` : 'Sin tareas';

                const barOuter = document.createElement('div');
                barOuter.className = 'flex-1 h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden';

                const barInner = document.createElement('div');
                barInner.className = `h-full ${percent === 100 ? 'bg-emerald-400' : 'bg-primary'}`;
                barInner.style.width = `${percent}%`;

                const pctText = document.createElement('span');
                pctText.className = 'text-[11px] text-text-muted tabular-nums w-10 text-right';
                pctText.textContent = total > 0 ? `${percent}%` : '--';

                barOuter.appendChild(barInner);
                wrap.append(barOuter, pctText);
                metaCell.appendChild(wrap);
            }

            const assigneeCell = document.createElement('div');
            assigneeCell.className = 'min-w-0';
            applyDepthPadding(statusCell, depth);
            applyDepthPadding(metaCell, depth);
            applyDepthPadding(assigneeCell, depth);
            summary.append(nameCell, statusCell, metaCell, assigneeCell);
            return summary;
        };

        const makeTaskItem = (task, { taskPath, onStatusChange = null, onAssigneeChange = null, depth = 0 } = {}) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'tree-level-3 flex flex-col rounded-md border border-border-dark bg-white dark:bg-surface-dark px-3 py-2 text-gray-900 dark:text-white';

            const row = document.createElement('div');
            row.className = `${treeGrid} cursor-pointer`;

            const nameCell = document.createElement('div');
            nameCell.className = 'flex items-center gap-2 min-w-0';
            const indent = document.createElement('span');
            indent.className = 'shrink-0';
            indent.style.width = `${Math.max(0, Number(depth) || 0) * 16}px`;
            const ic = document.createElement('span');
            ic.className = 'material-symbols-outlined text-text-muted text-[18px]';
            ic.textContent = 'check_circle';
            const nameWrap = document.createElement('span');
            nameWrap.className = 'inline-flex items-baseline gap-1 min-w-0';

            const name = document.createElement('span');
            name.className = 'text-sm truncate flex-1 min-w-0';
            name.textContent = task.name || 'Tarea';
            nameWrap.appendChild(name);

            if (task.manageId) {
                const chip = createIdChip(task.manageId);
                chip.classList.add('text-[11px]', 'shrink-0');
                nameWrap.appendChild(chip);
            }

            nameCell.append(indent, ic, nameWrap);

            const statusControl = createStatusControl({
                status: task.status,
                onChange: async (nextStatus) => {
                    if (typeof onStatusChange === 'function') {
                        await onStatusChange(nextStatus);
                    } else if (taskPath) {
                        await updateStatusAtPath(taskPath, nextStatus);
                    }
                }
            });

            const assigneeControl = createAssigneeControl({
                assigneeUid: task.assigneeUid,
                onChange: async (nextUid) => {
                    if (typeof onAssigneeChange === 'function') {
                        await onAssigneeChange(nextUid);
                    } else if (taskPath) {
                        await updateAssigneeAtPath(taskPath, nextUid);
                    }
                }
            });

            const progressCell = document.createElement('div');
            progressCell.className = 'min-w-0';

            const assigneeCell = document.createElement('div');
            assigneeCell.className = 'flex items-center justify-end gap-2 min-w-0';

            const taskActions = createActionMenu({
                onRename: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesion para editar tareas.");
                        return;
                    }
                    const nextNameRaw = prompt('Nuevo nombre de la tarea', task.name || '');
                    if (nextNameRaw === null) return;
                    const nextName = nextNameRaw.trim();
                    if (!nextName || nextName === task.name) return;

                    try {
                        const previousName = task.name || 'Tarea';
                        await update(ref(database, taskPath), { name: nextName });
                        const parsed = parseClientPath(taskPath);
                        if (parsed?.clientId) {
                            await logActivity(
                                parsed.clientId,
                                `Renombro tarea "${previousName}" a "${nextName}".`,
                                { action: 'rename', path: taskPath, entityType: 'task' }
                            );
                        }
                        task.name = nextName;
                        name.textContent = nextName;
                    } catch (error) {
                        console.error('Error renaming task:', error);
                        alert(`No se pudo renombrar la tarea: ${error.message}`);
                    }
                },
                onDelete: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesion para eliminar tareas.");
                        return;
                    }
                    const confirmed = confirm(`Eliminar la tarea "${task.name || 'Tarea'}"?`);
                    if (!confirmed) return;

                    try {
                        await remove(ref(database, taskPath));
                        const parsed = parseClientPath(taskPath);
                        if (parsed?.clientId) {
                            await logActivity(
                                parsed.clientId,
                                `Elimino tarea "${task.name || 'Tarea'}".`,
                                { action: 'delete', path: taskPath, entityType: 'task' }
                            );
                        }
                        if (selectedTaskId === task.id) {
                            selectedTaskId = null;
                            selectedSubtaskId = null;
                        }
                        wrapper.remove();
                        if (parsed?.clientId && parsed?.projectId) {
                            renderTasks(parsed.clientId, parsed.projectId, parsed.productId || null);
                        }
                        renderTree();
                    } catch (error) {
                        console.error('Error deleting task:', error);
                        alert(`No se pudo eliminar la tarea: ${error.message}`);
                    }
                },
            });

            applyDepthPadding(statusControl, depth);
            applyDepthPadding(progressCell, depth);
            applyDepthPadding(assigneeCell, depth);
            assigneeCell.append(assigneeControl, taskActions);
            row.append(nameCell, statusControl, progressCell, assigneeCell);

            const panel = document.createElement('div');
            panel.className = 'hidden mt-2';
            panel.dataset.taskPanelId = taskPath || '';
            if (taskPath && openTaskPanels.has(taskPath)) {
                panel.classList.remove('hidden');
            }

            const list = document.createElement('div');
            list.className = 'flex flex-col gap-2 text-sm';

            const renderInlineSubtasks = () => {
                list.innerHTML = '';
                const subtasks = Object.entries(task?.subtasks || {})
                    .filter(([, sub]) => sub)
                    .map(([subId, sub]) => ({ id: subId, ...sub }));
                const sortedSubtasks = sortActivities(subtasks);
                if (!sortedSubtasks.length) {
                    const empty = document.createElement('p');
                    empty.className = 'text-text-muted text-sm';
                    empty.textContent = 'No hay elementos.';
                    list.appendChild(empty);
                    return;
                }
                sortedSubtasks.forEach((sub) => {
                    const subId = sub.id;
                    const rowEl = document.createElement('div');
                    rowEl.className = `${treeGrid} items-center rounded-md border border-border-dark bg-white dark:bg-surface-darker px-3 py-2 subtask-row`;

                    const nameCell = document.createElement('div');
                    nameCell.className = 'flex items-center gap-2 min-w-0';
                    const indent = document.createElement('span');
                    indent.className = 'shrink-0';
                    indent.style.width = `${(Math.max(0, Number(depth) || 0) + 1) * 16}px`;
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined text-[16px] text-text-muted';
                    icon.textContent = 'subdirectory_arrow_right';
                    const labelWrap = document.createElement('span');
                    labelWrap.className = 'inline-flex items-baseline gap-1 min-w-0';
                    const label = document.createElement('span');
                    label.className = 'text-sm text-gray-900 dark:text-white truncate';
                    label.textContent = sub?.name || 'Elemento';
                    labelWrap.appendChild(label);
                    if (sub?.manageId) {
                        const chip = createIdChip(sub.manageId);
                        chip.classList.add('text-[11px]');
                        labelWrap.appendChild(chip);
                    }
                    nameCell.append(indent, icon, labelWrap);

                    const subPath = `${taskPath}/subtasks/${subId}`;
                    const statusControl = createStatusControl({
                        status: sub?.status,
                        onChange: async (nextStatus) => {
                            await updateStatusAtPath(subPath, nextStatus);
                            sub.status = nextStatus;
                        }
                    });

                    const assigneeControl = createAssigneeControl({
                        assigneeUid: sub?.assigneeUid,
                        onChange: async (nextUid) => {
                            await updateAssigneeAtPath(subPath, nextUid);
                            sub.assigneeUid = nextUid;
                        }
                    });

                    const progressCell = document.createElement('div');
                    progressCell.className = 'min-w-0';

                    const subtaskActions = createActionMenu({
                        onRename: async () => {
                            if (!currentUser) {
                                alert("Debes iniciar sesion para editar subtareas.");
                                return;
                            }
                            const nextNameRaw = prompt('Nuevo nombre de la subtarea', sub?.name || '');
                            if (nextNameRaw === null) return;
                            const nextName = nextNameRaw.trim();
                            if (!nextName || nextName === sub?.name) return;

                            try {
                                const previousName = sub?.name || 'Subtarea';
                                await update(ref(database, subPath), { name: nextName });
                                const parsed = parseClientPath(subPath);
                                if (parsed?.clientId) {
                                    await logActivity(
                                        parsed.clientId,
                                        `Renombro subtarea "${previousName}" a "${nextName}".`,
                                        { action: 'rename', path: subPath, entityType: 'subtask' }
                                    );
                                }
                                sub.name = nextName;
                                renderInlineSubtasks();
                            } catch (error) {
                                console.error('Error renaming subtask:', error);
                                alert(`No se pudo renombrar la subtarea: ${error.message}`);
                            }
                        },
                        onDelete: async () => {
                            if (!currentUser) {
                                alert("Debes iniciar sesion para eliminar subtareas.");
                                return;
                            }
                            const confirmed = confirm(`Eliminar la subtarea "${sub?.name || 'Subtarea'}"?`);
                            if (!confirmed) return;

                            try {
                                await remove(ref(database, subPath));
                                const parsed = parseClientPath(subPath);
                                if (parsed?.clientId) {
                                    await logActivity(
                                        parsed.clientId,
                                        `Elimino subtarea "${sub?.name || 'Subtarea'}".`,
                                        { action: 'delete', path: subPath, entityType: 'subtask' }
                                    );
                                }
                                if (task?.subtasks?.[subId]) delete task.subtasks[subId];
                                renderInlineSubtasks();
                                if (parsed?.clientId && parsed?.projectId && parsed?.taskId) {
                                    renderSubtasks(parsed.clientId, parsed.projectId, parsed.productId || null, parsed.taskId);
                                }
                                renderTree();
                            } catch (error) {
                                console.error('Error deleting subtask:', error);
                                alert(`No se pudo eliminar la subtarea: ${error.message}`);
                            }
                        },
                    });

                    const assigneeCell = document.createElement('div');
                    assigneeCell.className = 'flex items-center justify-end gap-2 min-w-0';
                    assigneeCell.append(assigneeControl, subtaskActions);

                    const subDepth = (Math.max(0, Number(depth) || 0) + 1);
                    applyDepthPadding(statusControl, subDepth);
                    applyDepthPadding(progressCell, subDepth);
                    applyDepthPadding(assigneeCell, subDepth);
                    rowEl.append(nameCell, statusControl, progressCell, assigneeCell);
                    list.appendChild(rowEl);
                });
            };

            renderInlineSubtasks();

            const inputWrap = document.createElement('div');
            inputWrap.className = 'mt-3 flex flex-col sm:flex-row gap-2';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Nueva subtarea...';
            input.className = 'flex-1 h-9 rounded-md border border-border-dark bg-white dark:bg-surface-darker px-3 text-sm text-gray-900 dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/60';

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'h-9 px-3 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors';
            addBtn.textContent = 'Añadir';

            const addSubtaskInline = async () => {
                if (!currentUser) {
                    alert('Debes iniciar sesión para añadir subtareas.');
                    return;
                }
                const name = String(input.value || '').trim();
                if (!name || !taskPath) return;
                const parsed = parseClientPath(taskPath);
                const clientId = parsed?.clientId || selectedClientId;
                if (!clientId) {
                    alert('No se pudo identificar el cliente para esta subtarea.');
                    return;
                }
                addBtn.disabled = true;
                addBtn.textContent = 'Guardando...';
                try {
                    const manageId = await allocateNextManageId(clientId);
                    const subtaskRef = push(ref(database, `${taskPath}/subtasks`));
                    const subtaskData = {
                        name,
                        status: 'Pendiente',
                        assigneeUid: '',
                        createdAt: new Date().toISOString(),
                        subtaskId: subtaskRef.key,
                        manageId
                    };
                    await set(subtaskRef, subtaskData);
                    input.value = '';
                } catch (error) {
                    console.error('Error adding subtask:', error);
                    alert(`No se pudo guardar la subtarea: ${error.message}`);
                } finally {
                    addBtn.disabled = false;
                    addBtn.textContent = 'Añadir';
                }
            };

            addBtn.addEventListener('click', addSubtaskInline);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtaskInline();
                }
            });

            inputWrap.append(input, addBtn);
            panel.append(list, inputWrap);

            row.addEventListener('click', (e) => {
                if (e.target.closest('button, input, textarea, select, .action-menu')) return;
                panel.classList.toggle('hidden');
            });

            wrapper.append(row, panel);
            return wrapper;
        };

        clientsToRender.forEach(client => {
            const clientDetails = document.createElement('details');
            clientDetails.className = 'tree-level-0 bg-white dark:bg-surface-dark border border-border-dark rounded-lg';
            const clientManage = client.manageId || '';
            clientDetails.dataset.manageId = client.manageId || `client:${client.id}`;
            if (selectionClientId && client.id === selectionClientId) clientDetails.open = true;
            clientDetails.appendChild(makeSummary('folder_open', client.name || 'Cliente', clientManage, null, null, null, 0, 'client'));

            const clientContent = document.createElement('div');
            clientContent.className = 'pt-2 pr-3 pb-3 flex flex-col gap-2';

            const projects = client.projects || {};
            const rawProjectArray = Object.keys(projects).map(id => ({ id, ...projects[id] }));
            const projectArray = sortActivities(
                selectionProjectId ? rawProjectArray.filter(p => p.id === selectionProjectId) : rawProjectArray
            );

            if (projectArray.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'text-text-muted text-xs px-1';
                empty.textContent = 'Sin proyectos.';
                clientContent.appendChild(empty);
            } else {
                projectArray.forEach(proj => {
                    const projDetails = document.createElement('details');
                    projDetails.className = 'tree-level-1 border border-border-dark/70 rounded-lg';
                    projDetails.dataset.manageId = proj.manageId || `project:${client.id}:${proj.id}`;
                    if (selectionProjectId && proj.id === selectionProjectId) projDetails.open = true;
                    const projProgress = computeProjectProgress(proj);
                    projDetails.appendChild(makeSummary(
                        'layers',
                        proj.name || 'Proyecto',
                        proj.manageId || '',
                        proj.status,
                        async (nextStatus) => {
                            await updateStatusAtPath(`clients/${client.id}/projects/${proj.id}`, nextStatus);
                            proj.status = nextStatus;
                            if (client?.projects?.[proj.id]) client.projects[proj.id].status = nextStatus;
                            if (selectedClientId === client.id && !selectedProjectId) {
                                renderClients();
                            }
                        },
                        projProgress,
                        1,
                        'project'
                    ));

                    const projContent = document.createElement('div');
                    projContent.className = 'pt-2 pr-2 pb-2 flex flex-col gap-2';

                    // Tareas sin producto (solo si no hay un producto seleccionado)
                    const projTasks = proj.tasks || {};
                    const projTaskArray = sortActivities(Object.keys(projTasks).map(id => ({ id, ...projTasks[id] })));
                    if (!selectionProductId && projTaskArray.length) {
                        projTaskArray.forEach(t => {
                            const taskPath = `clients/${client.id}/projects/${proj.id}/tasks/${t.id}`;
                            const taskBlock = document.createElement('div');
                            taskBlock.className = 'flex flex-col gap-1';
                            taskBlock.appendChild(makeTaskItem(t, {
                                taskPath,
                                depth: 2,
                                onStatusChange: async (nextStatus) => {
                                    await updateStatusAtPath(taskPath, nextStatus);
                                    t.status = nextStatus;
                                    if (projTasks?.[t.id]) projTasks[t.id].status = nextStatus;
                                    if (selectedClientId === client.id && selectedProjectId === proj.id && !selectedProductId) {
                                        renderTasks(client.id, proj.id, null);
                                    }
                                },
                                onAssigneeChange: async (nextUid) => {
                                    await updateAssigneeAtPath(taskPath, nextUid);
                                    t.assigneeUid = nextUid;
                                    if (projTasks?.[t.id]) projTasks[t.id].assigneeUid = nextUid;
                                    if (selectedClientId === client.id && selectedProjectId === proj.id && !selectedProductId) {
                                        renderTasks(client.id, proj.id, null);
                                    }
                                }
                            }));
                            projContent.appendChild(taskBlock);
                        });
                    }

                    // Productos
                    const products = proj.products || {};
                    const rawProductArray = Object.keys(products).map(id => ({ id, ...products[id] }));
                    const hasProducts = rawProductArray.length > 0;
                    const productArray = sortActivities(
                        selectionProductId ? rawProductArray.filter(p => p.id === selectionProductId) : rawProductArray
                    );

                    if (productArray.length === 0 && (!projTaskArray.length || selectionProductId)) {
                        const emptyP = document.createElement('p');
                        emptyP.className = 'text-text-muted text-xs px-1';
                        emptyP.textContent = 'Sin productos ni tareas.';
                        projContent.appendChild(emptyP);
                    } else {
                        productArray.forEach(prod => {
                            const productBasePath = `clients/${client.id}/projects/${proj.id}/products/${prod.id}`;
                            const prodDetails = document.createElement('details');
                            prodDetails.className = 'tree-level-2 border border-border-dark/60 rounded-lg';
                            prodDetails.dataset.manageId = prod.manageId || `product:${client.id}:${proj.id}:${prod.id}`;
                            if (selectionProductId && prod.id === selectionProductId) prodDetails.open = true;
                            const prodProgress = computeTasksProgress(prod.tasks);
                            prodDetails.appendChild(makeSummary(
                                'category',
                                prod.name || 'Producto',
                                prod.manageId || '',
                                prod.status,
                                async (nextStatus) => {
                                    await updateStatusAtPath(productBasePath, nextStatus);
                                    prod.status = nextStatus;
                                    if (products?.[prod.id]) products[prod.id].status = nextStatus;
                                    if (
                                        selectedClientId === client.id &&
                                        selectedProjectId === proj.id &&
                                        !selectedProductId
                                    ) {
                                        renderClients();
                                    }
                                },
                                prodProgress,
                                2,
                                'product'
                            ));

                            const prodContent = document.createElement('div');
                            prodContent.className = 'pt-2 pr-2 pb-2 flex flex-col gap-1';

                            const prodTasks = prod.tasks || {};
                            const prodTaskArray = sortActivities(Object.keys(prodTasks).map(id => ({ id, ...prodTasks[id] })));

                            if (prodTaskArray.length === 0) {
                                const emptyT = document.createElement('p');
                                emptyT.className = 'text-text-muted text-xs px-1';
                                emptyT.textContent = 'Sin tareas en este producto.';
                                prodContent.appendChild(emptyT);
                            } else {
                                prodTaskArray.forEach(t => {
                                    const taskPath = `${productBasePath}/tasks/${t.id}`;
                                    const taskBlock = document.createElement('div');
                                    taskBlock.className = 'flex flex-col gap-1';
                                    taskBlock.appendChild(makeTaskItem(t, {
                                        taskPath,
                                        depth: 3,
                                        onStatusChange: async (nextStatus) => {
                                            await updateStatusAtPath(taskPath, nextStatus);
                                            t.status = nextStatus;
                                            if (prodTasks?.[t.id]) prodTasks[t.id].status = nextStatus;
                                            if (
                                                selectedClientId === client.id &&
                                                selectedProjectId === proj.id &&
                                                selectedProductId === prod.id
                                            ) {
                                                renderTasks(client.id, proj.id, prod.id);
                                            }
                                        },
                                        onAssigneeChange: async (nextUid) => {
                                            await updateAssigneeAtPath(taskPath, nextUid);
                                            t.assigneeUid = nextUid;
                                            if (prodTasks?.[t.id]) prodTasks[t.id].assigneeUid = nextUid;
                                            if (
                                                selectedClientId === client.id &&
                                                selectedProjectId === proj.id &&
                                                selectedProductId === prod.id
                                            ) {
                                                renderTasks(client.id, proj.id, prod.id);
                                            }
                                        }
                                    }));
                                    prodContent.appendChild(taskBlock);
                                });
                            }

                            prodContent.appendChild(makeTreeActionRow([
                                {
                                    label: 'Crear tarea',
                                    icon: 'check_circle',
                                    onClick: () => {
                                        setTaskCreationContext(client.id, proj.id, prod.id);
                                        openTaskModal();
                                    }
                                }
                            ], 3));

                            prodDetails.appendChild(prodContent);
                            projContent.appendChild(prodDetails);
                        });
                    }

                    const projectActions = [
                        {
                            label: 'Crear producto',
                            icon: 'add_box',
                            onClick: () => {
                                setProductCreationContext(client.id, proj.id);
                                openProductModal();
                            }
                        }
                    ];
                    if (!hasProducts) {
                        projectActions.push({
                            label: 'Crear tarea',
                            icon: 'check_circle',
                            onClick: () => {
                                setTaskCreationContext(client.id, proj.id);
                                openTaskModal();
                            }
                        });
                    }
                    projContent.appendChild(makeTreeActionRow(projectActions, 2));

                    projDetails.appendChild(projContent);
                    clientContent.appendChild(projDetails);
                });
            }

            clientDetails.appendChild(clientContent);
            treeBody.appendChild(clientDetails);
        });

        if (openManageIds.size) {
            treeBody.querySelectorAll('details[data-manage-id]').forEach((el) => {
                if (openManageIds.has(el.dataset.manageId)) el.open = true;
            });
        }

        updateTreeExpandToggle();
    };
    const renderTasks = (clientId, projectId, productId = null) => {
        if (!taskList || !noTasksMessage) return;

        taskList.innerHTML = '';

        if (subtaskList) subtaskList.innerHTML = '';
        if (noSubtasksMessage) {
            noSubtasksMessage.textContent = 'Selecciona una tarea para ver sus subtareas.';
            noSubtasksMessage.classList.remove('hidden');
        }
        hideEl(subtaskSection);

        const client = allClients.find(c => c.id === clientId);
        const project = client?.projects?.[projectId];
        if (!project) {
            selectedTaskId = null;
            selectedSubtaskId = null;
            noTasksMessage.textContent = 'Selecciona un proyecto para ver tareas.';
            noTasksMessage.classList.remove('hidden');
            return;
        }

        const tasks = productId
            ? (project.products?.[productId]?.tasks || {})
            : (project.tasks || {});

        const taskArray = sortActivities(Object.keys(tasks || {}).map(key => ({ id: key, ...tasks[key] })));

        if (taskArray.length === 0) {
            selectedTaskId = null;
            selectedSubtaskId = null;
            noTasksMessage.textContent = productId ? 'No hay tareas para este producto.' : 'No hay tareas para este proyecto.';
            noTasksMessage.classList.remove('hidden');
            return;
        }

        noTasksMessage.classList.add('hidden');
        const activityGrid = 'grid grid-cols-[minmax(0,1fr)_140px_260px_32px]';

        const headerRow = document.createElement('div');
        headerRow.className = `${activityGrid} items-center gap-2 px-3 pt-1 pb-2 text-[11px] text-text-muted uppercase tracking-wider`;
        headerRow.append(
            Object.assign(document.createElement('span'), { textContent: 'Nombre' }),
            Object.assign(document.createElement('span'), { textContent: 'Estado' }),
            Object.assign(document.createElement('span'), { textContent: 'Asignado a' }),
            document.createElement('span')
        );
        taskList.appendChild(headerRow);

        taskArray.forEach(task => {
            const row = document.createElement('div');
            row.className = `group ${activityGrid} items-center gap-2 px-3 py-2 rounded-lg border border-border-dark bg-white dark:bg-surface-darker text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors`;
            row.dataset.taskId = task.id;

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'flex items-center gap-3 min-w-0 text-left';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined text-text-muted';
            icon.textContent = 'check_circle';

            const nameWrap = document.createElement('span');
            nameWrap.className = 'inline-flex items-baseline gap-1 min-w-0';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm font-medium truncate';
            nameSpan.textContent = task.name;
            nameWrap.appendChild(nameSpan);

            const taskPath = productId
                ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${task.id}`
                : `clients/${clientId}/projects/${projectId}/tasks/${task.id}`;

            const statusControl = createStatusControl({
                status: task.status,
                onChange: async (nextStatus) => {
                    await updateStatusAtPath(taskPath, nextStatus);
                    task.status = nextStatus;
                    if (tasks?.[task.id]) tasks[task.id].status = nextStatus;
                    renderTree();
                }
            });

            const assigneeControl = createAssigneeControl({
                assigneeUid: task.assigneeUid,
                onChange: async (nextUid) => {
                    await updateAssigneeAtPath(taskPath, nextUid);
                    task.assigneeUid = nextUid;
                    if (tasks?.[task.id]) tasks[task.id].assigneeUid = nextUid;
                    renderTree();
                }
            });
            const idTag = createIdChip(task.manageId);
            idTag.classList.add('text-[11px]');
            if (task.manageId) nameWrap.appendChild(idTag);

            selectButton.append(icon, nameWrap);
            selectButton.addEventListener('click', () => {
                selectedTaskId = task.id;
                selectedSubtaskId = null;
                showEl(subtaskSection);
                renderSubtasks(clientId, projectId, productId, task.id);
            });

            const actions = createActionMenu({
                onRename: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para editar tareas.");
                        return;
                    }
                    const nextNameRaw = prompt('Nuevo nombre de la tarea', task.name);
                    if (nextNameRaw === null) return;
                    const nextName = nextNameRaw.trim();
                    if (!nextName || nextName === task.name) return;

                    const taskPath = productId
                        ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${task.id}`
                        : `clients/${clientId}/projects/${projectId}/tasks/${task.id}`;

                    try {
                        const previousName = task.name;
                        await update(ref(database, taskPath), { name: nextName });
                        await logActivity(
                            clientId,
                            `Renombró tarea "${previousName}" a "${nextName}".`,
                            { action: 'rename', path: taskPath, entityType: 'task' }
                        );
                        task.name = nextName;
                        if (tasks?.[task.id]) tasks[task.id].name = nextName;
                        renderTasks(clientId, projectId, productId);
                        renderTree();
                    } catch (error) {
                        console.error('Error renaming task:', error);
                        alert(`No se pudo renombrar la tarea: ${error.message}`);
                    }
                },
                onDelete: async () => {
                    if (!currentUser) {
                        alert("Debes iniciar sesión para eliminar tareas.");
                        return;
                    }
                    const confirmed = confirm(`¿Eliminar la tarea "${task.name}"?`);
                    if (!confirmed) return;

                    const taskPath = productId
                        ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${task.id}`
                        : `clients/${clientId}/projects/${projectId}/tasks/${task.id}`;

                    try {
                        await remove(ref(database, taskPath));
                        await logActivity(
                            clientId,
                            `Eliminó tarea "${task.name}".`,
                            { action: 'delete', path: taskPath, entityType: 'task' }
                        );
                        if (tasks?.[task.id]) delete tasks[task.id];
                        if (selectedTaskId === task.id) {
                            selectedTaskId = null;
                            selectedSubtaskId = null;
                        }
                        renderTasks(clientId, projectId, productId);
                        renderTree();
                    } catch (error) {
                        console.error('Error deleting task:', error);
                        alert(`No se pudo eliminar la tarea: ${error.message}`);
                    }
                },
            });

            row.append(selectButton, statusControl, assigneeControl, actions);
            taskList.appendChild(row);
        });

        if (selectedTaskId && tasks?.[selectedTaskId]) {
            showEl(subtaskSection);
            renderSubtasks(clientId, projectId, productId, selectedTaskId);
        } else {
            selectedTaskId = null;
            selectedSubtaskId = null;
            hideEl(subtaskSection);
        }
    };

    const syncSelectionAfterDataChange = () => {
        if (!selectedClientId) return;

        const client = allClients.find(c => c.id === selectedClientId);
        if (!client) {
            showClientView();
            return;
        }

        if (!selectedProjectId) {
            if (clientNameHeader) clientNameHeader.textContent = client.name;
            resetProjectDetail();
            showEl(treeView);
            hideEl(projectDetail);
            hideEl(productListSection);
            hideEl(projectListSection);
            showEl(clientListSection);
            hideEl(backToClientsBtn);
            hideEl(backToProjectsBtn);
            updateActivityPath();
            renderTree();
            return;
        }

        const project = client.projects?.[selectedProjectId];
        if (!project) {
            selectedProjectId = null;
            selectedProductId = null;
            selectedTaskId = null;
            selectedSubtaskId = null;
            resetProjectDetail();
            if (clientNameHeader) clientNameHeader.textContent = client.name;
            showEl(treeView);
            hideEl(projectDetail);
            hideEl(productListSection);
            hideEl(projectListSection);
            showEl(clientListSection);
            hideEl(backToClientsBtn);
            hideEl(backToProjectsBtn);
            updateActivityPath();
            renderTree();
            return;
        }

        if (productClientNameHeader) productClientNameHeader.textContent = client.name;
        if (projectNameHeader) projectNameHeader.textContent = project.name;

        if (selectedProductId && !project.products?.[selectedProductId]) {
            selectedProductId = null;
            selectedTaskId = null;
            selectedSubtaskId = null;
        }

        if (projectDetail) projectDetail.classList.remove('hidden');
        if (selectedProductId) {
            const product = project.products?.[selectedProductId];
            if (projectDetailName) projectDetailName.textContent = product?.name || project.name;
            if (projectDetailSub) projectDetailSub.textContent = product ? 'Tareas del producto.' : 'Tareas del proyecto.';
        } else {
            if (projectDetailName) projectDetailName.textContent = project.name;
            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto.';
        }

        showEl(treeView);
        hideEl(productListSection);
        hideEl(projectListSection);
        showEl(clientListSection);
        hideEl(backToClientsBtn);
        hideEl(backToProjectsBtn);
        renderTasks(selectedClientId, selectedProjectId, selectedProductId);
        updateActivityPath();
        renderTree();
    };

   const subscribeUsers = () => {
    if (usersUnsubscribe) usersUnsubscribe();
    
    // Escuchamos la rama 'users' para obtener todos los perfiles de la base de datos
    usersUnsubscribe = onValue(ref(database, 'users'), (snapshot) => {
        usersByUid = snapshot.val() || {};
        console.log("Usuarios cargados para asignación:", Object.keys(usersByUid).length);
        
        // Refrescamos la vista actual si hay un proyecto seleccionado para que se vean los nombres
        if (selectedClientId && selectedProjectId) {
            renderTasks(selectedClientId, selectedProjectId, selectedProductId);
        }
        renderTree();
    }, (error) => {
        console.error('Error al cargar la lista de usuarios:', error);
    });
};

    // Fetch clients from RTDB
    const fetchClients = () => {
        if (!clientsRef) return;
        clientsLoading = true;
        noClientsMessage?.classList.add('hidden');
        renderClientListSkeleton();
        renderTreeSkeleton();

        onValue(clientsRef, (snapshot) => {
            clientsLoading = false;
            const data = snapshot.val();
            console.log('[DATA] Firebase snapshot received:', data ? Object.keys(data).length : 0, 'clients');
            if (data) {
                allClients = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                // Normalize nested RTDB maps (extra push levels) before rendering.
                allClients = normalizeClientData(allClients);
                console.log('[DATA] Normalized clients:', allClients.length);
            } else {
                allClients = [];
                console.log('[DATA] No client data from Firebase');
            }
            syncSelectionAfterDataChange();
            renderClients();
            renderTree();
            renderStatusDashboard();
            renderMyTasks();
            renderSearchResults();
            updateCalendarItems();
            updateTimelineItems();
        }, (error) => {
            console.error("Error fetching clients: ", error);
            clientsLoading = false;
            renderMessageCard(noClientsMessage, {
                icon: 'error',
                title: 'No se pudieron cargar los clientes',
                description: error?.message || 'Error desconocido.'
            });
        });
    };

    // Handle add client form submit
    const handleAddClientSubmit = async (e) => {
        e.preventDefault();
        const companyName = companyNameInput.value.trim();
        if (!companyName) return;
        if (!currentUser) {
            alert("Debes iniciar sesión para añadir clientes.");
            return;
        }

        try {
            if (saveClientBtn) {
                saveClientBtn.disabled = true;
                saveClientBtn.textContent = "Guardando...";
            }

            const managePrefix = buildManagePrefixFromName(companyName);
            const existingIds = new Set(allClients.map(client => client?.manageId).filter(Boolean));
            let nextNumber = getNextClientManageNumber(managePrefix);
            let manageId = formatManageId(managePrefix, nextNumber);
            while (existingIds.has(manageId)) {
                nextNumber += 1;
                manageId = formatManageId(managePrefix, nextNumber);
            }
            const newClientRef = push(ref(database, 'clients'));
            const timestamp = new Date().toISOString();
            const clientData = {
                name: companyName,
                createdAt: timestamp,
                updatedAt: timestamp,
                createdBy: currentUser.uid,
                clientId: newClientRef.key,
                manageId,
                managePrefix,
                manageNextNumber: 2
            };

            await set(newClientRef, clientData);
            closeModal();
        } catch (error) {
            console.error("Error adding client: ", error);
            alert(`Hubo un error al guardar el cliente: ${error.message}`);
        } finally {
            if (saveClientBtn) {
                saveClientBtn.disabled = false;
                saveClientBtn.textContent = "Guardar Cliente";
            }
        }
    };

    // Handle add project form submit
    const handleAddProjectSubmit = async (e) => {
        e.preventDefault();
        const projectName = projectNameInput.value.trim();
        if (!projectName) return;
        const applyAutomations = Boolean(projectAutomationToggle?.checked);
        const selectedAutomationIds = applyAutomations ? getSelectedProjectAutomationIds() : [];
        if (applyAutomations && selectedAutomationIds.length === 0 && currentUser && selectedClientId) {
            alert('Selecciona al menos una automatizacion o desmarca la opcion.');
            return;
        }
        if (!currentUser || !selectedClientId) {
            alert("Selecciona un cliente e inicia sesión para añadir proyectos.");
            return;
        }

        try {
            if (saveProjectBtn) {
                saveProjectBtn.disabled = true;
                saveProjectBtn.textContent = "Guardando...";
            }

            const manageId = await allocateNextManageId(selectedClientId);
            const newProjectRef = push(ref(database, `clients/${selectedClientId}/projects`));
            const timestamp = new Date().toISOString();
            const projectData = {
                name: projectName,
                status: 'Pendiente',
                createdAt: timestamp,
                updatedAt: timestamp,
                projectId: newProjectRef.key,
                manageId
            };
            if (selectedAutomationIds.length > 0) {
                projectData.automationIds = selectedAutomationIds;
            }

            await set(newProjectRef, projectData);
            if (selectedAutomationIds.length > 0) {
                cacheProjectAutomationIds(selectedClientId, newProjectRef.key, selectedAutomationIds);
            }
            
            await executeAutomations('activityCreated', {
                path: `clients/${selectedClientId}/projects/${newProjectRef.key}`,
                type: 'project',
                data: projectData
            }, { includeAutomationIds: selectedAutomationIds });

            // Aplicar plantilla de proyecto automáticamente (con idempotencia)
            const projectPath = `clients/${selectedClientId}/projects/${newProjectRef.key}`;
            await applyProjectTemplate(selectedClientId, newProjectRef.key, projectPath, projectName);

            closeProjectModal();
            renderClients();
            renderTree();
        } catch (error) {
            console.error("Error adding project: ", error);
            alert(`Hubo un error al guardar el proyecto: ${error.message}`);
        } finally {
            if (saveProjectBtn) {
                saveProjectBtn.disabled = false;
                saveProjectBtn.textContent = "Guardar Proyecto";
            }
        }
    };

    // Handle add product form submit
    const handleAddProductSubmit = async (e) => {
        e.preventDefault();
        const productName = productNameInput.value.trim();
        if (!productName) return;
        const target = productCreationContext || { clientId: selectedClientId, projectId: selectedProjectId };
        if (!currentUser || !target.clientId || !target.projectId) {
            alert("Selecciona un proyecto e inicia sesión para añadir productos.");
            return;
        }

        try {
            if (saveProductBtn) {
                saveProductBtn.disabled = true;
                saveProductBtn.textContent = "Guardando...";
            }

            const manageId = await allocateNextManageId(target.clientId);
            const newProductRef = push(ref(database, `clients/${target.clientId}/projects/${target.projectId}/products`));
            const timestamp = new Date().toISOString();
            const productData = {
                name: productName,
                status: 'Pendiente',
                createdAt: timestamp,
                updatedAt: timestamp,
                productId: newProductRef.key,
                manageId
            };

            await set(newProductRef, productData);

            const projectAutomationIds = getProjectAutomationIds(target.clientId, target.projectId);
            await executeAutomations('activityCreated', {
                path: `clients/${target.clientId}/projects/${target.projectId}/products/${newProductRef.key}`,
                type: 'product',
                data: productData
            }, { includeAutomationIds: projectAutomationIds });

            closeProductModal();
            renderClients();
            renderTree();
        } catch (error) {
            console.error("Error adding product: ", error);
            alert(`Hubo un error al guardar el producto: ${error.message}`);
        } finally {
            if (saveProductBtn) {
                saveProductBtn.disabled = false;
                saveProductBtn.textContent = "Guardar Producto";
            }
        }
    };

    // Handle add task form submit
    const handleAddTaskSubmit = async (e) => {
        e.preventDefault();
        const taskName = taskNameInput.value.trim();
        if (!taskName) return;
        const target = taskCreationContext || { clientId: selectedClientId, projectId: selectedProjectId, productId: selectedProductId };
        if (!currentUser || !target.clientId || !target.projectId) {
            alert("Selecciona un proyecto e inicia sesión para añadir tareas.");
            return;
        }

        try {
            if (saveTaskBtn) {
                saveTaskBtn.disabled = true;
                saveTaskBtn.textContent = "Guardando...";
            }

            const manageId = await allocateNextManageId(target.clientId);
            const taskPath = target.productId
                ? `clients/${target.clientId}/projects/${target.projectId}/products/${target.productId}/tasks`
                : `clients/${target.clientId}/projects/${target.projectId}/tasks`;
            const newTaskRef = push(ref(database, taskPath));
            const timestamp = new Date().toISOString();
            const taskData = {
                name: taskName,
                status: 'Pendiente',
                assigneeUid: '',
                createdAt: timestamp,
                updatedAt: timestamp,
                taskId: newTaskRef.key,
                manageId
            };

            await set(newTaskRef, taskData);

            const projectAutomationIds = getProjectAutomationIds(target.clientId, target.projectId);
            await executeAutomations('activityCreated', {
                path: taskPath + `/${newTaskRef.key}`,
                type: 'task',
                data: taskData
            }, { includeAutomationIds: projectAutomationIds });

            closeTaskModal();
            renderTasks(selectedClientId, selectedProjectId, selectedProductId);
        } catch (error) {
            console.error("Error adding task: ", error);
            alert(`Hubo un error al guardar la tarea: ${error.message}`);
        } finally {
            if (saveTaskBtn) {
                saveTaskBtn.disabled = false;
                saveTaskBtn.textContent = "Guardar Tarea";
            }
        }
    };

    // Handle add subtask form submit
    const handleAddSubtaskSubmit = async (e) => {
        e.preventDefault();
        const subtaskName = subtaskNameInput.value.trim();
        if (!subtaskName) return;
        if (!currentUser || !selectedClientId || !selectedProjectId || !selectedTaskId) {
            alert("Selecciona una tarea e inicia sesión para añadir subtareas.");
            return;
        }

        try {
            if (saveSubtaskBtn) {
                saveSubtaskBtn.disabled = true;
                saveSubtaskBtn.textContent = "Guardando...";
            }

            const manageId = await allocateNextManageId(selectedClientId);
            const subtaskPath = selectedProductId
                ? `clients/${selectedClientId}/projects/${selectedProjectId}/products/${selectedProductId}/tasks/${selectedTaskId}/subtasks`
                : `clients/${selectedClientId}/projects/${selectedProjectId}/tasks/${selectedTaskId}/subtasks`;

            const newSubtaskRef = push(ref(database, subtaskPath));
            const timestamp = new Date().toISOString();
            const subtaskData = {
                name: subtaskName,
                status: 'Pendiente',
                assigneeUid: '',
                createdAt: timestamp,
                updatedAt: timestamp,
                subtaskId: newSubtaskRef.key,
                manageId
            };

            await set(newSubtaskRef, subtaskData);

            const projectAutomationIds = getProjectAutomationIds(selectedClientId, selectedProjectId);
            await executeAutomations('activityCreated', {
                path: subtaskPath + `/${newSubtaskRef.key}`,
                type: 'subtask',
                data: subtaskData
            }, { includeAutomationIds: projectAutomationIds });

            closeSubtaskModal();
            renderSubtasks(selectedClientId, selectedProjectId, selectedProductId, selectedTaskId);
        } catch (error) {
            console.error("Error adding subtask: ", error);
            alert(`Hubo un error al guardar la subtarea: ${error.message}`);
        } finally {
            if (saveSubtaskBtn) {
                saveSubtaskBtn.disabled = false;
                saveSubtaskBtn.textContent = "Guardar Subtarea";
            }
        }
    };

    const executeAutomations = async (eventType, eventData, options = {}) => {
        console.log('[AUTOMATIONS] Firing trigger:', eventType, '| Path:', eventData.path, '| Type:', eventData.type);
        const includeAutomationIds = normalizeAutomationIdList(options?.includeAutomationIds);
        const includeSet = includeAutomationIds.length > 0 ? new Set(includeAutomationIds) : null;
        const automationsRef = ref(database, 'automations');
        const snapshot = await get(automationsRef);
        if (!snapshot.exists()) {
            console.log('[AUTOMATIONS] No automations found in database');
            return;
        }

        const allAutomations = snapshot.val();
        const enabledCount = Object.values(allAutomations).filter(a => a.enabled).length;
        console.log('[AUTOMATIONS] Loaded:', Object.keys(allAutomations).length, '| Enabled:', enabledCount);

        let matchedCount = 0;
        for (const automationId in allAutomations) {
            const automation = { id: automationId, ...allAutomations[automationId] };

            if (!automation.enabled) {
                continue;
            }

            const isIncluded = includeSet ? includeSet.has(automationId) : false;
            if (!isIncluded) {
                const isInScope = isActivityInScope(eventData.path, automation.scope);
                if (!isInScope) {
                    continue;
                }
            }

            const triggers = Array.isArray(automation.triggers)
                ? automation.triggers
                : Object.values(automation.triggers || {});
            const actions = Array.isArray(automation.actions)
                ? automation.actions
                : Object.values(automation.actions || {});
            for (const trigger of triggers) {
                let triggerMet = false;
                if (eventType === 'activityCreated' && trigger.triggerType === 'created' && trigger.activityType.toLowerCase() === eventData.type.toLowerCase()) {
                    triggerMet = true;
                } else if (eventType === 'activityStatusChanged' && trigger.triggerType === 'statusChange' && trigger.activityType.toLowerCase() === eventData.type.toLowerCase()) {
                    if (trigger.fromState.toLowerCase() === eventData.oldStatus.toLowerCase() && trigger.toState.toLowerCase() === eventData.newStatus.toLowerCase()) {
                        triggerMet = true;
                    }
                }
                
                if (triggerMet) {
                    matchedCount++;
                    console.log('[AUTOMATIONS] Trigger met for automation:', automation.name, '| Actions:', actions.length);
                    for (const action of actions) {
                        await executeAction(action, eventData, automation);
                    }
                    // Stop checking other triggers for this automation
                    break;
                }
            }
        }
        console.log('[AUTOMATIONS] Execution complete. Matched automations:', matchedCount);
    };

    const isActivityInScope = (activityPath, scope) => {
        if (!scope || !scope.client) {
            console.log('[AUTOMATIONS] Scope check failed: invalid scope', { scope });
            return false;
        }

        const pathParts = parseClientPath(activityPath);
        if (!pathParts) {
            console.log('[AUTOMATIONS] Scope check failed: invalid path', { activityPath });
            return false;
        }

        if (scope.client !== 'all' && scope.client !== pathParts.clientId) {
            return false; // Not in the right client
        }

        if (scope.projects && scope.projects.length > 0 && !scope.projects.includes(pathParts.projectId)) {
            return false; // Not in the right project
        }

        if (scope.products && scope.products.length > 0) {
            const productInScope = scope.products.some(p => p.projectId === pathParts.projectId && p.productId === pathParts.productId);
            if (!productInScope) {
                return false; // Not in the right product
            }
        }

        return true;
    };

    const executeAction = async (action, eventData, automation) => {
        console.log('[AUTOMATIONS] Executing action:', action.type, '| Parent:', eventData.path);
        if (action.type.startsWith('createChild_')) {
            await executeCreateChildAction(action, eventData, automation);
        } else if (action.type === 'notify') {
            console.log('[AUTOMATIONS] Notify action not yet implemented');
        } else {
            console.warn('[AUTOMATIONS] Unknown action type:', action.type);
        }
    };

    const executeCreateChildAction = async (action, eventData, automation) => {
        const rawChildType = action.type.split('_')[1]; // e.g., 'Product', 'Task', 'Subtask'
        const childTypeValue = String(rawChildType || '').trim().toLowerCase();
        const childTypeInfo = (() => {
            if (childTypeValue === 'product' || childTypeValue === 'producto') return { key: 'product', label: 'Producto' };
            if (childTypeValue === 'task' || childTypeValue === 'tarea') return { key: 'task', label: 'Tarea' };
            if (childTypeValue === 'subtask' || childTypeValue === 'subtarea') return { key: 'subtask', label: 'Subtarea' };
            return null;
        })();
        const parentPath = eventData.path;
        const parentData = eventData.data;

        if (!childTypeInfo) {
            console.error('Unknown child type for creation:', rawChildType);
            return;
        }

        let childName = `Nuevo ${childTypeInfo.label}`;
        if (childTypeInfo.label === 'Tarea' || childTypeInfo.label === 'Subtarea') {
            childName = `Nueva ${childTypeInfo.label}`;
        }
        const customName = String(action?.name || action?.childName || '').trim();
        if (customName) {
            childName = customName;
        }
        
        let childPath;
        if (childTypeInfo.key === 'product') {
            childPath = `${parentPath}/products`;
        } else if (childTypeInfo.key === 'task') {
            childPath = `${parentPath}/tasks`;
        } else if (childTypeInfo.key === 'subtask') {
            childPath = `${parentPath}/subtasks`;
        } else {
            console.error('Unknown child type for creation:', rawChildType);
            return;
        }

        const pathParts = parseClientPath(parentPath);
        if (!pathParts) return;

        try {
            const manageId = await allocateNextManageId(pathParts.clientId);
            const newChildRef = push(ref(database, childPath));
            const childData = {
                name: childName,
                status: 'Pendiente',
                createdAt: new Date().toISOString(),
                manageId,
            };
            if (childTypeInfo.key === 'product') childData.productId = newChildRef.key;
            if (childTypeInfo.key === 'task') childData.taskId = newChildRef.key;
            if (childTypeInfo.key === 'subtask') childData.subtaskId = newChildRef.key;

            await set(newChildRef, childData);
            console.log(`[AUTOMATIONS] Created ${childTypeInfo.key}:`, { path: childPath, name: childName, id: newChildRef.key });
            
            await logActivity(
                pathParts.clientId,
                `Automatizacion '${automation.name}' creo ${childTypeInfo.label.toLowerCase()} "${childName}" para ${pathParts.type} "${parentData.name}".`,
                { action: 'automation_create_child', path: parentPath, entityType: childTypeInfo.key }
            );

        } catch (error) {
            console.error(`[AUTOMATIONS] Failed to create child ${childTypeInfo?.key || 'unknown'}:`, error);
        }
    };

    // ============================================================
    // PROJECT TEMPLATE SYSTEM
    // ============================================================

    /**
     * Cargar configuración de plantillas desde RTDB
     * Si no existe, crear la configuración por defecto
     */
    const loadProjectTemplateConfig = async () => {
        try {
            const configRef = ref(database, 'automations/projectTemplate');
            const snapshot = await get(configRef);

            if (snapshot.exists()) {
                const config = snapshot.val();
                projectTemplateState = {
                    enabled: config.enabled === true,
                    tasks: Array.isArray(config.tasks) ? config.tasks : DEFAULT_PROJECT_TEMPLATE.tasks
                };
            } else {
                // Crear configuración por defecto
                projectTemplateState = {
                    enabled: false,
                    tasks: [...DEFAULT_PROJECT_TEMPLATE.tasks]
                };
                await set(configRef, {
                    enabled: false,
                    tasks: DEFAULT_PROJECT_TEMPLATE.tasks,
                    createdAt: new Date().toISOString()
                });
            }

            // Actualizar UI
            if (projectTemplateEnabled) {
                projectTemplateEnabled.checked = projectTemplateState.enabled;
            }
            if (projectTemplateStatus) {
                projectTemplateStatus.textContent = projectTemplateState.enabled ? 'Activado' : 'Desactivado';
            }
            if (projectTemplateConfig) {
                if (projectTemplateState.enabled) {
                    projectTemplateConfig.classList.remove('hidden');
                } else {
                    projectTemplateConfig.classList.add('hidden');
                }
            }
            renderTemplateTasks();
        } catch (error) {
            console.error('Error loading project template config:', error);
        }
    };

    /**
     * Guardar configuración de plantillas en RTDB
     */
    const saveProjectTemplateConfig = async () => {
        try {
            if (templateSaveStatus) templateSaveStatus.textContent = 'Guardando...';
            if (saveTemplateBtn) saveTemplateBtn.disabled = true;

            const configRef = ref(database, 'automations/projectTemplate');
            await set(configRef, {
                enabled: projectTemplateState.enabled,
                tasks: projectTemplateState.tasks,
                updatedAt: new Date().toISOString()
            });

            if (templateSaveStatus) {
                templateSaveStatus.textContent = 'Guardado correctamente';
                setTimeout(() => {
                    if (templateSaveStatus) templateSaveStatus.textContent = '';
                }, 2000);
            }
        } catch (error) {
            console.error('Error saving project template config:', error);
            if (templateSaveStatus) templateSaveStatus.textContent = 'Error al guardar';
        } finally {
            if (saveTemplateBtn) saveTemplateBtn.disabled = false;
        }
    };

    /**
     * Renderizar lista de tareas de la plantilla
     */
    const renderTemplateTasks = () => {
        if (!templateTasksList) return;

        if (projectTemplateState.tasks.length === 0) {
            templateTasksList.innerHTML = '';
            if (templateTasksEmpty) templateTasksEmpty.classList.remove('hidden');
            return;
        }

        if (templateTasksEmpty) templateTasksEmpty.classList.add('hidden');

        templateTasksList.innerHTML = projectTemplateState.tasks.map((task, index) => `
            <div class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-background-dark/50 rounded-lg border border-border-dark/50" data-task-index="${index}">
                <span class="material-symbols-outlined text-text-muted text-[18px] cursor-move drag-handle">drag_indicator</span>
                <input type="text"
                       value="${escapeHtml(task.name)}"
                       class="flex-1 bg-transparent border-none text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-0 placeholder:text-text-muted/60"
                       placeholder="Nombre de la tarea"
                       data-field="name">
                <input type="text"
                       value="${task.estimatedMinutes ? formatMinutesToDuration(task.estimatedMinutes) : ''}"
                       class="w-20 bg-white dark:bg-surface-dark border border-border-dark rounded px-2 py-1 text-xs text-center text-gray-900 dark:text-white placeholder:text-text-muted/60"
                       placeholder="1h 30m"
                       title="Tiempo estimado"
                       data-field="estimatedMinutes">
                <button type="button" class="text-red-500 hover:text-red-600 transition-colors remove-task-btn" title="Eliminar tarea">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </div>
        `).join('');
    };

    /**
     * Formatear minutos a duración legible
     */
    const formatMinutesToDuration = (minutes) => {
        if (!minutes || minutes <= 0) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
        if (hours > 0) return `${hours}h`;
        return `${mins}m`;
    };

    /**
     * Parsear duración a minutos
     */
    const parseDurationToMinutes = (input) => {
        if (!input || typeof input !== 'string') return 0;
        const trimmed = input.trim().toLowerCase();
        if (!trimmed) return 0;

        // Formato "1h 30m" o "1h30m"
        const hmMatch = trimmed.match(/^(\d+)\s*h\s*(\d+)\s*m$/);
        if (hmMatch) return parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);

        // Solo horas "2h"
        const hMatch = trimmed.match(/^(\d+)\s*h$/);
        if (hMatch) return parseInt(hMatch[1], 10) * 60;

        // Solo minutos "45m"
        const mMatch = trimmed.match(/^(\d+)\s*m$/);
        if (mMatch) return parseInt(mMatch[1], 10);

        // Número solo (asumimos minutos)
        const numMatch = trimmed.match(/^(\d+)$/);
        if (numMatch) return parseInt(numMatch[1], 10);

        return 0;
    };

    /**
     * Escape HTML para prevenir XSS
     */
    const escapeHtml = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    /**
     * Actualizar una tarea en el estado desde el input
     */
    const updateTemplateTaskFromInput = (index, field, value) => {
        if (index < 0 || index >= projectTemplateState.tasks.length) return;

        if (field === 'name') {
            projectTemplateState.tasks[index].name = value.trim();
        } else if (field === 'estimatedMinutes') {
            projectTemplateState.tasks[index].estimatedMinutes = parseDurationToMinutes(value);
        }
    };

    /**
     * Añadir una nueva tarea a la plantilla
     */
    const addTemplateTask = () => {
        projectTemplateState.tasks.push({
            name: '',
            status: 'Pendiente',
            estimatedMinutes: 0
        });
        renderTemplateTasks();

        // Enfocar el nuevo input
        const lastInput = templateTasksList?.querySelector('[data-task-index]:last-child input[data-field="name"]');
        if (lastInput) lastInput.focus();
    };

    /**
     * Eliminar una tarea de la plantilla
     */
    const removeTemplateTask = (index) => {
        if (index < 0 || index >= projectTemplateState.tasks.length) return;
        projectTemplateState.tasks.splice(index, 1);
        renderTemplateTasks();
    };

    /**
     * Aplicar plantilla de proyecto al crear un proyecto nuevo
     * CON IDEMPOTENCIA: verifica si ya se aplicó para evitar duplicados
     * @param {string} clientId - ID del cliente
     * @param {string} projectId - ID del proyecto
     * @param {string} projectPath - Path completo del proyecto en RTDB
     * @param {string} projectName - Nombre del proyecto (para logs)
     */
    const applyProjectTemplate = async (clientId, projectId, projectPath, projectName) => {
        // Verificar si las plantillas están activadas
        if (!projectTemplateState.enabled) {
            console.log('Project templates disabled, skipping');
            return;
        }

        // Verificar si hay tareas definidas
        if (!projectTemplateState.tasks || projectTemplateState.tasks.length === 0) {
            console.log('No template tasks defined, skipping');
            return;
        }

        try {
            // IDEMPOTENCIA: Verificar si ya se aplicó la plantilla
            const appliedRef = ref(database, `${projectPath}/templateApplied`);
            const appliedSnap = await get(appliedRef);

            if (appliedSnap.exists()) {
                console.log('Template already applied to this project, skipping');
                return;
            }

            console.log('Applying project template...', { clientId, projectId, tasks: projectTemplateState.tasks.length });

            const createdTaskIds = [];
            const timestamp = new Date().toISOString();

            // Crear cada tarea de la plantilla
            for (const templateTask of projectTemplateState.tasks) {
                if (!templateTask.name || !templateTask.name.trim()) continue;

                const manageId = await allocateNextManageId(clientId);
                const newTaskRef = push(ref(database, `${projectPath}/tasks`));

                const taskData = {
                    name: templateTask.name.trim(),
                    status: templateTask.status || 'Pendiente',
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    taskId: newTaskRef.key,
                    manageId
                };

                if (templateTask.estimatedMinutes && templateTask.estimatedMinutes > 0) {
                    taskData.estimatedMinutes = templateTask.estimatedMinutes;
                }

                await set(newTaskRef, taskData);
                createdTaskIds.push(newTaskRef.key);
                console.log(`Created template task: ${templateTask.name} (${newTaskRef.key})`);
            }

            // Marcar como aplicado (IDEMPOTENCIA)
            await set(appliedRef, {
                appliedAt: timestamp,
                templateId: DEFAULT_PROJECT_TEMPLATE.id,
                createdTasks: createdTaskIds
            });

            // Log de actividad
            await logActivity(
                clientId,
                `Plantilla aplicada automáticamente al proyecto "${projectName}": ${createdTaskIds.length} tareas creadas.`,
                { action: 'template_applied', path: projectPath, entityType: 'project' }
            );

            console.log(`✓ Template applied: ${createdTaskIds.length} tasks created for project ${projectId}`);
        } catch (error) {
            console.error('Error applying project template:', error);
            // No lanzar el error para no bloquear la creación del proyecto
        }
    };

    /**
     * Inicializar listeners del sistema de plantillas
     */
    const initProjectTemplateListeners = () => {
        // Toggle activar/desactivar
        projectTemplateEnabled?.addEventListener('change', async () => {
            projectTemplateState.enabled = projectTemplateEnabled.checked;

            if (projectTemplateStatus) {
                projectTemplateStatus.textContent = projectTemplateState.enabled ? 'Activado' : 'Desactivado';
            }

            if (projectTemplateConfig) {
                if (projectTemplateState.enabled) {
                    projectTemplateConfig.classList.remove('hidden');
                } else {
                    projectTemplateConfig.classList.add('hidden');
                }
            }

            // Guardar cambio inmediatamente
            await saveProjectTemplateConfig();
        });

        // Añadir tarea
        addTemplateTaskBtn?.addEventListener('click', addTemplateTask);

        // Guardar plantilla
        saveTemplateBtn?.addEventListener('click', saveProjectTemplateConfig);

        // Delegación de eventos para la lista de tareas
        templateTasksList?.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-task-btn');
            if (removeBtn) {
                const taskRow = removeBtn.closest('[data-task-index]');
                if (taskRow) {
                    const index = parseInt(taskRow.dataset.taskIndex, 10);
                    removeTemplateTask(index);
                }
            }
        });

        // Actualizar estado al cambiar inputs
        templateTasksList?.addEventListener('input', (e) => {
            const input = e.target;
            if (!input.matches('input[data-field]')) return;

            const taskRow = input.closest('[data-task-index]');
            if (!taskRow) return;

            const index = parseInt(taskRow.dataset.taskIndex, 10);
            const field = input.dataset.field;
            updateTemplateTaskFromInput(index, field, input.value);
        });

        // Cargar configuración inicial
        loadProjectTemplateConfig();
    };


    // Attach UI listeners once
    const attachListeners = () => {
        if (listenersAttached) return;
        listenersAttached = true;

        // Initialize project template system
        initProjectTemplateListeners();

        addClientBtn?.addEventListener('click', () => {
            if (!currentUser) {
                alert("Debes iniciar sesión para añadir clientes.");
                return;
            }
            openModal();
        });

        addProjectBtn?.addEventListener('click', () => {
            if (!currentUser) {
                alert("Debes iniciar sesión para añadir proyectos.");
                return;
            }
            openProjectModal();
        });

        addProductBtn?.addEventListener('click', openProductModal);
        addTaskBtn?.addEventListener('click', openTaskModal);
        addSubtaskBtn?.addEventListener('click', openSubtaskModal);

        projectAutomationToggle?.addEventListener('change', () => {
            if (projectAutomationToggle.checked) {
                showEl(projectAutomationPanel);
                loadProjectAutomations();
                return;
            }
            hideEl(projectAutomationPanel);
            selectedProjectAutomationIds.clear();
            renderProjectAutomationList();
        });

        projectAutomationList?.addEventListener('change', (event) => {
            const target = event.target;
            if (!target || !target.matches('input[type="checkbox"][data-automation-id]')) return;
            const automationId = target.dataset.automationId;
            if (!automationId) return;
            if (target.checked) {
                selectedProjectAutomationIds.add(automationId);
            } else {
                selectedProjectAutomationIds.delete(automationId);
            }
        });

        clientSearchInput?.addEventListener('input', () => {
            renderSearchResults();
        });
        clientSearchInput?.addEventListener('focus', () => {
            renderSearchResults();
        });
        clientSearchInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                hideSearchResults();
                clientSearchInput.blur();
            }
        });
        mountActivitySortMenus();
        document.addEventListener('click', (event) => {
            if (!searchRoot) return;
            if (!searchRoot.contains(event.target)) hideSearchResults();
        });

        calendarViewButtons.forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                setCalendarView(btn.dataset.calendarView);
            });
        });
        calendarPrevBtn?.addEventListener('click', () => shiftCalendarDate(-1));
        calendarNextBtn?.addEventListener('click', () => shiftCalendarDate(1));
        calendarTodayBtn?.addEventListener('click', () => {
            calendarState.date = new Date();
            renderCalendar();
        });

        addClientForm?.addEventListener('submit', handleAddClientSubmit);
        addProjectForm?.addEventListener('submit', handleAddProjectSubmit);
        addProductForm?.addEventListener('submit', handleAddProductSubmit);
        addTaskForm?.addEventListener('submit', handleAddTaskSubmit);
        addSubtaskForm?.addEventListener('submit', handleAddSubtaskSubmit);

        closeModalBtn?.addEventListener('click', closeModal);
        closeProjectModalBtn?.addEventListener('click', closeProjectModal);
        closeProductModalBtn?.addEventListener('click', closeProductModal);
        closeTaskModalBtn?.addEventListener('click', closeTaskModal);
        closeSubtaskModalBtn?.addEventListener('click', closeSubtaskModal);

        cancelAddClientBtn?.addEventListener('click', closeModal);
        cancelAddProjectBtn?.addEventListener('click', closeProjectModal);
        cancelAddProductBtn?.addEventListener('click', closeProductModal);
        cancelAddTaskBtn?.addEventListener('click', closeTaskModal);
        cancelAddSubtaskBtn?.addEventListener('click', closeSubtaskModal);

        addClientModal?.addEventListener('click', e => { if (e.target === addClientModal) closeModal(); });
        addProjectModal?.addEventListener('click', e => { if (e.target === addProjectModal) closeProjectModal(); });
        addProductModal?.addEventListener('click', e => { if (e.target === addProductModal) closeProductModal(); });
        addTaskModal?.addEventListener('click', e => { if (e.target === addTaskModal) closeTaskModal(); });
        addSubtaskModal?.addEventListener('click', e => { if (e.target === addSubtaskModal) closeSubtaskModal(); });

        backToClientsBtn?.addEventListener('click', () => {
            resetProjectDetail();
            showClientView();
        });

        backToProjectsBtn?.addEventListener('click', () => {
            resetProjectDetail();
            selectedProjectId = null;
            selectedProductId = null;
            if (selectedClientId) showProjectView(selectedClientId);
        });

        tamoeHomeButton?.addEventListener('click', () => {
            const target = `maindashboard.html?r=${Date.now()}`;
            window.location.href = target;
        });

        userMenuToggle?.addEventListener('click', toggleUserMenu);
        treeExpandToggle?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const details = getTreeDetailsElements();
            if (!details.length) return;
            const allOpen = details.every(d => d.open);
            details.forEach((d) => { d.open = !allOpen; });
            updateTreeExpandToggle();
        });
        document.addEventListener('click', (e) => {
            closeAllActionMenus();
            if (!userMenu || !userMenuToggle) return;
            if (userMenu.contains(e.target) || userMenuToggle.contains(e.target)) return;
            userMenu.classList.add('hidden');
        });

        if (hasCalendar()) {
            renderCalendar();
        }
    };

    // Init with user
    const initializeApp = (user) => {
        console.log('[INIT] Initializing app for user:', user?.email || user?.uid);
        currentUser = user;
        if (!database) {
            console.error("Database not initialized. Check firebase.js exports.");
            return;
        }
        console.log('[INIT] Database ready, subscribing to data...');
        clientsRef = query(ref(database, 'clients'));
        subscribeUsers();
        attachListeners();
        
        if (document.getElementById('tree-view')) {
            // Main dashboard
            showClientView();
        }
        
        fetchClients();
    };

    // Cleanup when user logs out
    const cleanup = () => {
        currentUser = null;
        clientsRef = null;
        if (usersUnsubscribe) usersUnsubscribe();
        usersUnsubscribe = null;
        usersByUid = {};
        allClients = [];
        renderClients();
        renderTree();
        if (myTasksList) myTasksList.innerHTML = '';
        if (myTasksSummary) myTasksSummary.textContent = '0 asignadas';
        if (myTasksEmpty) {
            myTasksEmpty.textContent = 'Inicia sesion para ver tus tareas.';
            myTasksEmpty.classList.remove('hidden');
        }
        calendarItems = [];
        calendarState = { view: 'month', date: new Date() };
        renderCalendar();
        noClientsMessage.textContent = "Por favor, inicie sesión.";
        noClientsMessage.classList.remove('hidden');
        resetProjectDetail();
        showClientView();
        attachListeners();
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            initializeApp(user);
        } else {
            cleanup();
        }
    });
});






