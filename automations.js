import { auth, database } from './firebase.js';
import { ref, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

let allAutomations = [];

const ICONS_BY_STATUS = {
    active: { icon: 'play_arrow', color: 'green' },
    paused: { icon: 'pause', color: 'yellow' },
    error: { icon: 'warning', color: 'red' },
    draft: { icon: 'edit', color: 'gray' },
};

const LABELS_BY_STATUS = {
    active: 'Activo',
    paused: 'Pausado',
    error: 'Error',
    draft: 'Borrador',
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

    return `
        <article data-id="${automation.id}" class="group relative flex flex-col bg-white dark:bg-surface-dark border border-border-dark hover:border-primary/50 rounded-xl p-5 transition-all hover:shadow-xl hover:-translate-y-1">
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-${color}-500/10 flex items-center justify-center text-${color}-500 border border-${color}-500/20">
                        <span class="material-symbols-outlined">${icon}</span>
                    </div>
                    <div>
                        <h3 class="text-gray-900 dark:text-white font-bold text-lg leading-tight group-hover:text-primary transition-colors">${automation.name}</h3>
                        <span class="text-xs text-${color}-500 font-medium flex items-center gap-1 mt-0.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-${color}-500"></span> ${statusLabel}
                        </span>
                    </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" value="" class="sr-only peer toggle-automation" ${automation.enabled ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-gray-200 dark:bg-surface-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
            </div>
            ${automation.trigger ? `
            <div class="flex items-center gap-2 mb-4 p-3 bg-gray-100 dark:bg-background-dark/50 rounded-lg border border-border-dark/50 overflow-hidden">
                <div class="flex items-center gap-2 text-text-muted text-xs font-medium whitespace-nowrap">
                    <span class="material-symbols-outlined text-primary text-[18px]">${automation.trigger.icon}</span>
                    <span class="text-gray-900 dark:text-white">${automation.trigger.label}</span>
                </div>
                ${automation.steps && automation.steps.length > 0 ? `<span class="material-symbols-outlined text-text-muted/40 text-[16px]">arrow_forward</span>` : ''}
                <div class="flex items-center gap-2 text-text-muted text-xs font-medium whitespace-nowrap">
                    <span>${automation.steps.join(', ')}</span>
                </div>
            </div>
            ` : ''}
            <div class="mt-auto pt-4 border-t border-border-dark flex items-center justify-between text-xs text-text-muted">
                <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">history</span>
                    ${automation.lastRun}
                </span>
                <div class="relative">
                    <button class="hover:text-gray-900 dark:hover:text-white transition-colors more-horiz-btn">
                        <span class="material-symbols-outlined text-[20px]">more_horiz</span>
                    </button>
                    <div class="hidden absolute right-0 bottom-full mb-2 w-40 bg-white dark:bg-surface-darker border border-border-dark rounded-lg shadow-xl z-10">
                        <button class="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 edit-automation-btn">
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                            Editar
                        </button>
                        <button class="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 delete-automation-btn">
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

    let filteredAutomations = allAutomations;
    
    // Apply search
    if (currentSearch) {
        filteredAutomations = filteredAutomations.filter(a => a.name.toLowerCase().includes(currentSearch.toLowerCase()));
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

function fetchAutomations() {
    const automationsRef = ref(database, 'automations');
    onValue(automationsRef, (snapshot) => {
        if (snapshot.exists()) {
            const automationsData = snapshot.val();
            allAutomations = Object.keys(automationsData).map(key => {
                const automation = automationsData[key] || {};
                const triggers = Array.isArray(automation.triggers)
                    ? automation.triggers
                    : Object.values(automation.triggers || {});
                const actions = Array.isArray(automation.actions)
                    ? automation.actions
                    : Object.values(automation.actions || {});
                const triggerLabel = triggers.map(t => t.activityType).filter(Boolean).join(', ') || 'Sin disparador';
                const steps = actions.map(a => a.type).filter(Boolean);

                // Get real lastRun timestamp
                const lastRunTimestamp = automation.lastRun || null;
                const lastRunFormatted = formatLastRun(lastRunTimestamp);

                // Get dynamic icon based on trigger type
                const triggerIcon = getTriggerIcon(triggers);

                // Adapt data to what renderAutomationCard expects
                return {
                    id: key,
                    name: automation.name || 'Automatizacion sin nombre',
                    enabled: automation.enabled !== false, // default to true
                    status: automation.enabled !== false ? 'active' : 'paused',
                    lastRun: lastRunFormatted,
                    trigger: {
                        icon: triggerIcon,
                        label: triggerLabel
                    },
                    steps
                };
            });
        } else {
            allAutomations = [];
        }
        renderAutomations();
    });
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
            const totalPages = Math.ceil(allAutomations.length / itemsPerPage);
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
            const menu = e.target.closest('.relative').querySelector('div');
            menu.classList.toggle('hidden');
            return;
        }
        
        // Delete button
        if (e.target.closest('.delete-automation-btn')) {
            if (confirm('¿Estás seguro de que quieres eliminar esta automatización?')) {
                const automationRef = ref(database, `automations/${automationId}`);
                remove(automationRef).catch(err => {
                    console.error("Failed to delete automation:", err);
                    alert('No se pudo eliminar la automatización.');
                });
            }
            return;
        }

        // Edit button
        if (e.target.closest('.edit-automation-btn')) {
            window.location.href = `create-automation.html?id=${automationId}`;
            return;
        }
    });

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
