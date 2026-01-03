import { auth, database } from './firebase.js';
import { ref, onValue, remove, update, get, push, set } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

let allAutomations = [];
let projectTemplateConfig = null;

const ICONS_BY_STATUS = {
    active: { icon: 'check_circle', color: 'green' },
    paused: { icon: 'pause_circle', color: 'yellow' },
    error: { icon: 'error', color: 'red' },
    draft: { icon: 'edit_note', color: 'gray' },
};

const LABELS_BY_STATUS = {
    active: 'Activa',
    paused: 'Pausada',
    error: 'Error',
    draft: 'Borrador',
};

// Mapeo de triggers a labels legibles
const TRIGGER_LABELS = {
    'created': 'Al crear',
    'statusChange': 'Al cambiar estado',
    'assigned': 'Al asignar',
    'timeScheduled': 'Programado',
    'hierarchical': 'Jerárquico'
};

// Mapeo de tipos de actividad
const ACTIVITY_TYPE_LABELS = {
    'Project': 'proyecto',
    'Product': 'producto',
    'Task': 'tarea',
    'Subtask': 'subtarea'
};

// Mapeo de acciones a labels
const ACTION_LABELS = {
    'notify': 'Notificar',
    'createChild_Task': 'Crear tarea',
    'createChild_Subtask': 'Crear subtarea',
    'createChild_Product': 'Crear producto'
};

// Mapeo de operadores a labels (v2 conditions)
const OPERATOR_LABELS = {
    'equals': 'es',
    'notEquals': 'no es',
    'contains': 'contiene',
    'startsWith': 'empieza con',
    'endsWith': 'termina con',
    'in': 'es uno de',
    'notIn': 'no es uno de',
    'isEmpty': 'está vacío',
    'isNotEmpty': 'no está vacío',
    'greaterThan': 'mayor que',
    'lessThan': 'menor que',
    'exists': 'existe'
};

// --- DOM Elements ---
let automationsGrid, automationSearchInput, filterButtons, emptyState, paginationSummary, paginationPrev, paginationNext, paginationPages;

// --- State ---
let currentPage = 1;
let itemsPerPage = 12;
let currentSearch = '';

/**
 * Renders a single automation card.
 * @param {object} automation - The automation data.
 * @returns {string} - The HTML string for the card.
 */
function renderAutomationCard(automation) {
    const status = automation.enabled ? 'active' : 'paused';
    const { icon, color } = ICONS_BY_STATUS[status] || { icon: 'help', color: 'gray' };
    const statusLabel = LABELS_BY_STATUS[status] || 'Desconocido';
    const isProjectTemplate = automation.id === 'projectTemplate';

    return `
        <article data-id="${automation.id}" ${isProjectTemplate ? 'data-is-template="true"' : ''} class="group relative flex flex-col bg-white dark:bg-surface-dark border border-border-dark hover:border-primary/50 rounded-xl p-5 transition-all hover:shadow-xl hover:-translate-y-1">
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 shrink-0 rounded-lg bg-${color}-500/10 flex items-center justify-center text-${color}-500 border border-${color}-500/20">
                        <span class="material-symbols-outlined">${icon}</span>
                    </div>
                    <div class="min-w-0">
                        <h3 class="text-gray-900 dark:text-white font-bold text-base leading-tight group-hover:text-primary transition-colors truncate" title="${automation.name}">${automation.name}</h3>
                        <span class="text-xs text-${color}-500 font-medium flex items-center gap-1 mt-0.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-${color}-500"></span> ${statusLabel}
                        </span>
                    </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                    <input type="checkbox" value="" class="sr-only peer toggle-automation" ${automation.enabled ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-gray-200 dark:bg-surface-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
            </div>

            <!-- Disparador -->
            <div class="flex items-center gap-2 mb-2 text-xs">
                <span class="text-text-muted font-medium">Disparador:</span>
                <span class="flex items-center gap-1.5 text-gray-900 dark:text-white font-semibold">
                    <span class="material-symbols-outlined text-primary text-[16px]">${automation.triggerIcon || 'bolt'}</span>
                    ${automation.triggerLabel || 'Sin disparador'}
                </span>
            </div>

            <!-- Condiciones (v2) -->
            ${automation.conditionsSummary ? `
            <div class="flex items-center gap-2 mb-2 text-xs">
                <span class="text-text-muted font-medium">Condiciones:</span>
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[11px] font-medium">
                    <span class="material-symbols-outlined text-[12px]">filter_alt</span>
                    ${automation.conditionsSummary.label}
                </span>
            </div>
            ` : ''}

            <!-- Acciones -->
            <div class="flex items-start gap-2 mb-3 text-xs">
                <span class="text-text-muted font-medium shrink-0">Acciones:</span>
                <div class="flex flex-wrap gap-1">
                    ${automation.actionsLabels && automation.actionsLabels.length > 0
                        ? automation.actionsLabels.map(action => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">${action}</span>`).join('')
                        : '<span class="text-text-muted">Sin acciones</span>'
                    }
                </div>
            </div>

            <div class="mt-auto pt-3 border-t border-border-dark/50 flex items-center justify-between text-xs text-text-muted">
                <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">schedule</span>
                    ${automation.lastRun}
                </span>
                <div class="relative">
                    <button class="hover:text-gray-900 dark:hover:text-white transition-colors more-horiz-btn p-1 -m-1">
                        <span class="material-symbols-outlined text-[20px]">more_horiz</span>
                    </button>
                    <div class="hidden absolute right-0 bottom-full mb-2 w-44 bg-white dark:bg-surface-darker border border-border-dark rounded-lg shadow-xl z-10 overflow-hidden">
                        <button class="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 edit-automation-btn">
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                            Editar
                        </button>
                        <button class="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 duplicate-automation-btn">
                            <span class="material-symbols-outlined text-[18px]">content_copy</span>
                            Duplicar
                        </button>
                        <button class="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 delete-automation-btn">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                            Eliminar
                        </button>
                    </div>
                </div>
            </div>
        </article>
    `;
}

/**
 * Main function to render automations based on current state (search, pagination).
 */
function renderAutomations() {
    if (!automationsGrid) return;

    // Combine project template (if exists) with other automations
    let combinedAutomations = [];

    // Add project template first if it exists
    if (projectTemplateConfig) {
        combinedAutomations.push(projectTemplateConfig);
    }

    // Add other automations
    combinedAutomations = combinedAutomations.concat(allAutomations);

    let filteredAutomations = combinedAutomations;

    // Apply search
    if (currentSearch) {
        filteredAutomations = filteredAutomations.filter(a =>
            a.name.toLowerCase().includes(currentSearch.toLowerCase()) ||
            (a.triggerLabel && a.triggerLabel.toLowerCase().includes(currentSearch.toLowerCase()))
        );
    }

    // Handle empty state
    if (filteredAutomations.length === 0) {
        automationsGrid.innerHTML = '';
        if(emptyState) emptyState.classList.remove('hidden');
    } else {
        if(emptyState) emptyState.classList.add('hidden');

        // Apply pagination
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedAutomations = filteredAutomations.slice(startIndex, endIndex);

        automationsGrid.innerHTML = paginatedAutomations.map(renderAutomationCard).join('');
    }

    updatePaginationControls(filteredAutomations.length);
}

/**
 * Updates the pagination buttons and summary text.
 * @param {number} totalItems - The total number of items after filtering.
 */
function updatePaginationControls(totalItems) {
    if (!paginationSummary || !paginationPrev || !paginationNext || !paginationPages) return;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    paginationSummary.textContent = `Mostrando ${totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-${Math.min(currentPage * itemsPerPage, totalItems)} de ${totalItems} automatizaciones`;
    
    paginationPrev.disabled = currentPage === 1;
    paginationNext.disabled = currentPage === totalPages || totalPages === 0;

    paginationPages.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.className = `px-3 py-1 rounded hover:bg-gray-100 dark:hover:bg-surface-dark transition-colors ${i === currentPage ? 'text-gray-900 dark:text-white font-bold' : ''}`;
        pageButton.addEventListener('click', () => {
            currentPage = i;
            renderAutomations();
        });
        paginationPages.appendChild(pageButton);
    }
}

// Helper: Get icon based on trigger type
function getTriggerIcon(triggers) {
    if (!triggers || triggers.length === 0) return 'help_outline';

    const firstTrigger = triggers[0];
    const triggerType = firstTrigger.triggerType;

    const iconMap = {
        'statusChange': 'swap_horiz',
        'created': 'add_circle',
        'assigned': 'person_add',
        'timeScheduled': 'schedule',
        'hierarchical': 'account_tree'
    };

    return iconMap[triggerType] || 'play_arrow';
}

// Helper: Format timestamp to readable date
function formatLastRun(timestamp) {
    if (!timestamp) return 'Nunca';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace unos segundos';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

/**
 * Builds a human-readable trigger label
 */
function buildTriggerLabel(triggers) {
    if (!triggers || triggers.length === 0) return 'Sin disparador';

    const firstTrigger = triggers[0];
    const triggerType = firstTrigger.triggerType;
    const activityType = firstTrigger.activityType;

    const typeLabel = TRIGGER_LABELS[triggerType] || triggerType || '';
    const activityLabel = ACTIVITY_TYPE_LABELS[activityType] || activityType || '';

    if (triggerType === 'statusChange') {
        const from = firstTrigger.fromState || '';
        const to = firstTrigger.toState || '';
        if (from && to) return `${activityLabel} cambia de "${from}" a "${to}"`;
        if (to) return `${activityLabel} cambia a "${to}"`;
        return `Cambio de estado en ${activityLabel}`;
    }

    if (triggerType === 'created') {
        return `Al crear ${activityLabel}`;
    }

    return `${typeLabel} ${activityLabel}`.trim() || 'Sin disparador';
}

/**
 * Builds human-readable action labels
 */
function buildActionsLabels(actions) {
    if (!actions || actions.length === 0) return [];

    return actions.map(action => {
        const type = action.type || '';
        if (type === 'notify') {
            const count = action.recipients?.length || 0;
            return count > 0 ? `Notificar (${count})` : 'Notificar';
        }
        if (type.startsWith('createChild_')) {
            const childType = type.replace('createChild_', '');
            return ACTION_LABELS[type] || `Crear ${childType.toLowerCase()}`;
        }
        return ACTION_LABELS[type] || type;
    }).filter(Boolean);
}

/**
 * Builds condition summary for display (v2)
 */
function buildConditionsSummary(conditions) {
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
        return null;
    }

    const operator = conditions.operator === 'OR' ? 'ALGUNA' : 'TODAS';
    const rulesCount = conditions.rules.length;

    return {
        count: rulesCount,
        operator: operator,
        label: `${rulesCount} condición${rulesCount > 1 ? 'es' : ''} (${operator})`
    };
}

/**
 * Fetches and processes project template as automation
 */
function fetchProjectTemplate() {
    const templateRef = ref(database, 'automations/projectTemplate');
    onValue(templateRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const tasks = Array.isArray(data.tasks) ? data.tasks : Object.values(data.tasks || {});
            const taskCount = tasks.length;

            projectTemplateConfig = {
                id: 'projectTemplate',
                name: 'Crear tareas al crear proyecto',
                enabled: data.enabled === true,
                triggerIcon: 'add_circle',
                triggerLabel: 'Al crear proyecto',
                actionsLabels: taskCount > 0 ? [`Crear ${taskCount} tarea${taskCount > 1 ? 's' : ''}`] : [],
                lastRun: formatLastRun(data.updatedAt || data.createdAt),
                isProjectTemplate: true,
                tasks: tasks
            };
        } else {
            projectTemplateConfig = null;
        }
        renderAutomations();
    });
}

function fetchAutomations() {
    const automationsRef = ref(database, 'automations');
    onValue(automationsRef, (snapshot) => {
        if (snapshot.exists()) {
            const automationsData = snapshot.val();
            allAutomations = Object.keys(automationsData)
                .filter(key => key !== 'projectTemplate') // Exclude projectTemplate from regular list
                .map(key => {
                    const automation = automationsData[key] || {};
                    const triggers = Array.isArray(automation.triggers)
                        ? automation.triggers
                        : Object.values(automation.triggers || {});
                    const actions = Array.isArray(automation.actions)
                        ? automation.actions
                        : Object.values(automation.actions || {});

                    // Build readable labels
                    const triggerLabel = buildTriggerLabel(triggers);
                    const actionsLabels = buildActionsLabels(actions);

                    // Get real lastRun timestamp
                    const lastRunTimestamp = automation.lastRun || null;
                    const lastRunFormatted = formatLastRun(lastRunTimestamp);

                    // Get dynamic icon based on trigger type
                    const triggerIcon = getTriggerIcon(triggers);

                    // Build conditions summary (v2)
                    const conditionsSummary = buildConditionsSummary(automation.conditions);

                    return {
                        id: key,
                        name: automation.name || 'Automatización sin nombre',
                        enabled: automation.enabled !== false,
                        status: automation.enabled !== false ? 'active' : 'paused',
                        lastRun: lastRunFormatted,
                        triggerIcon,
                        triggerLabel,
                        actionsLabels,
                        conditionsSummary // v2
                    };
                });
        } else {
            allAutomations = [];
        }
        renderAutomations();
    });
}

/**
 * Duplicates an automation
 */
async function duplicateAutomation(automationId) {
    try {
        const automationRef = ref(database, `automations/${automationId}`);
        const snapshot = await get(automationRef);

        if (!snapshot.exists()) {
            alert('No se encontró la automatización a duplicar.');
            return;
        }

        const originalData = snapshot.val();
        const newData = {
            ...originalData,
            name: `${originalData.name || 'Automatización'} (copia)`,
            enabled: false, // Start disabled
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastRun: null
        };

        // Remove id if present
        delete newData.id;

        // Create new automation
        const newAutomationRef = push(ref(database, 'automations'));
        await set(newAutomationRef, newData);

        alert('Automatización duplicada correctamente.');
    } catch (err) {
        console.error('Error duplicating automation:', err);
        alert('No se pudo duplicar la automatización.');
    }
}

/**
 * Initializes the automations tab functionality.
 */
function initAutomations() {
    automationsGrid = document.getElementById('automations-grid');
    automationSearchInput = document.getElementById('automation-search-input');
    const filterButtonsContainer = document.getElementById('automation-filter-buttons');
    if (filterButtonsContainer) {
        filterButtons = filterButtonsContainer.querySelectorAll('button');
    } else {
        filterButtons = [];
    }
    emptyState = document.getElementById('automations-empty-state');
    paginationSummary = document.getElementById('pagination-summary');
    paginationPrev = document.getElementById('pagination-prev');
    paginationNext = document.getElementById('pagination-next');
    paginationPages = document.getElementById('pagination-pages');
    const createAutomationBtn = document.getElementById('create-automation-btn');

    if (!automationsGrid) {
        return;
    }

    // --- Event Listeners ---
    if(filterButtons.length > 0) {
        filterButtons.forEach(button => button.style.display = 'none');
    }

    if(automationSearchInput) {
        automationSearchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value;
            currentPage = 1;
            renderAutomations();
        });
    }

    if(paginationPrev) {
        paginationPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderAutomations();
            }
        });
    }

    if(paginationNext) {
        paginationNext.addEventListener('click', () => {
            // Calculate total including project template
            const total = (projectTemplateConfig ? 1 : 0) + allAutomations.length;
            const totalPages = Math.ceil(total / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderAutomations();
            }
        });
    }

    if(createAutomationBtn) {
        createAutomationBtn.addEventListener('click', () => {
            window.location.href = 'create-automation.html';
        });
    }

    automationsGrid.addEventListener('click', (e) => {
        const article = e.target.closest('article');
        if (!article) return;
        const automationId = article.dataset.id;
        const isProjectTemplate = article.dataset.isTemplate === 'true';

        // Toggle button
        if (e.target.classList.contains('toggle-automation')) {
            const isEnabled = e.target.checked;
            const automationRef = ref(database, `automations/${automationId}`);
            update(automationRef, { enabled: isEnabled }).catch(err => {
                console.error("Failed to update automation status:", err);
                e.target.checked = !isEnabled; // revert on error
            });
            return;
        }

        // More horiz menu
        if (e.target.closest('.more-horiz-btn')) {
            // Close all other menus first
            automationsGrid.querySelectorAll('.more-horiz-btn + div').forEach(menu => {
                if (menu !== e.target.closest('.relative').querySelector('div')) {
                    menu.classList.add('hidden');
                }
            });
            const menu = e.target.closest('.relative').querySelector('div');
            menu.classList.toggle('hidden');
            return;
        }

        // Delete button
        if (e.target.closest('.delete-automation-btn')) {
            const confirmMsg = isProjectTemplate
                ? '¿Estás seguro de que quieres eliminar la automatización de crear tareas al crear proyecto?'
                : '¿Estás seguro de que quieres eliminar esta automatización?';

            if (confirm(confirmMsg)) {
                const automationRef = ref(database, `automations/${automationId}`);
                remove(automationRef).catch(err => {
                    console.error("Failed to delete automation:", err);
                    alert('No se pudo eliminar la automatización.');
                });
            }
            return;
        }

        // Duplicate button
        if (e.target.closest('.duplicate-automation-btn')) {
            // Close menu
            e.target.closest('.relative').querySelector('div').classList.add('hidden');
            duplicateAutomation(automationId);
            return;
        }

        // Edit button
        if (e.target.closest('.edit-automation-btn')) {
            if (isProjectTemplate) {
                // Open project template editor
                window.location.href = 'create-automation.html?id=projectTemplate';
            } else {
                window.location.href = `create-automation.html?id=${automationId}`;
            }
            return;
        }
    });

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.more-horiz-btn') && !e.target.closest('.more-horiz-btn + div')) {
            automationsGrid?.querySelectorAll('.more-horiz-btn + div').forEach(menu => {
                menu.classList.add('hidden');
            });
        }
    });

    // Fetch both project template and other automations
    fetchProjectTemplate();
    fetchAutomations();
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            initAutomations();
        } else {
            allAutomations = [];
            if(automationsGrid) {
                renderAutomations();
            }
        }
    });

    // Hide menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.relative')) {
            document.querySelectorAll('.more-horiz-btn + div').forEach(menu => {
                if(menu) menu.classList.add('hidden');
            });
        }
    });
});
