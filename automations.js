// Mock data for automations
const allAutomations = [];

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
let itemsPerPage = 5;
let currentFilter = 'all';
let currentSearch = '';

/**
 * Renders a single automation card.
 * @param {object} automation - The automation data.
 * @returns {string} - The HTML string for the card.
 */
function renderAutomationCard(automation) {
    const { icon, color } = ICONS_BY_STATUS[automation.status] || { icon: 'help', color: 'gray' };
    const statusLabel = LABELS_BY_STATUS[automation.status] || 'Desconocido';

    return `
        <article class="group relative flex flex-col bg-white dark:bg-surface-dark border border-border-dark hover:border-primary/50 rounded-xl p-5 transition-all hover:shadow-xl hover:-translate-y-1">
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
                    <input type="checkbox" value="" class="sr-only peer" ${automation.status === 'active' ? 'checked' : ''}>
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
                <button class="hover:text-gray-900 dark:hover:text-white transition-colors">
                    <span class="material-symbols-outlined text-[20px]">more_horiz</span>
                </button>
            </div>
        </article>
    `;
}

/**
 * Main function to render automations based on current state (filters, search, pagination).
 */
function renderAutomations() {
    if (!automationsGrid) return;

    let filteredAutomations = allAutomations;

    // Apply filter
    if (currentFilter !== 'all') {
        filteredAutomations = filteredAutomations.filter(a => a.status === currentFilter);
    }
    
    // Apply search
    if (currentSearch) {
        filteredAutomations = filteredAutomations.filter(a => a.name.toLowerCase().includes(currentSearch.toLowerCase()));
    }
    
    // Handle empty state
    if (filteredAutomations.length === 0) {
        automationsGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        
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

/**
 * Initializes the automations tab functionality.
 */
function initAutomations() {
    // Find elements once the DOM is ready
    automationsGrid = document.getElementById('automations-grid');
    automationSearchInput = document.getElementById('automation-search-input');
    filterButtons = document.getElementById('automation-filter-buttons').querySelectorAll('button');
    emptyState = document.getElementById('automations-empty-state');
    paginationSummary = document.getElementById('pagination-summary');
    paginationPrev = document.getElementById('pagination-prev');
    paginationNext = document.getElementById('pagination-next');
    paginationPages = document.getElementById('pagination-pages');
    
    // Modal elements
    const createAutomationBtn = document.getElementById('create-automation-btn');
    const addAutomationModal = document.getElementById('add-automation-modal');
    const closeAutomationModalBtn = document.getElementById('close-automation-modal-btn');
    const cancelAddAutomationBtn = document.getElementById('cancel-add-automation');
    const addAutomationForm = document.getElementById('add-automation-form');


    if (!automationsGrid) {
        // Elements not found, maybe not on the right tab
        return;
    }
    
    // --- Event Listeners ---
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentFilter = button.dataset.filter;
            currentPage = 1;
            
            // Update active button style
            filterButtons.forEach(btn => btn.classList.remove('text-primary', 'border-primary', 'shadow-[0_0_10px_rgba(230,25,161,0.2)]'));
            button.classList.add('text-primary', 'border-primary', 'shadow-[0_0_10px_rgba(230,25,161,0.2)]');
            
            renderAutomations();
        });
    });

    automationSearchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        currentPage = 1;
        renderAutomations();
    });

    paginationPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderAutomations();
        }
    });

    paginationNext.addEventListener('click', () => {
        const totalPages = Math.ceil(allAutomations.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderAutomations();
        }
    });

    // Modal listeners
    createAutomationBtn.addEventListener('click', () => {
        window.location.href = 'create-automation.html';
    });

    // Initial render
    renderAutomations();
}

// Since the panel is loaded dynamically, we need to be careful.
// We'll listen for the tab click to initialize.
document.addEventListener('DOMContentLoaded', () => {
    const automationsTabButton = document.getElementById('tab-automations');
    
    let isInitialized = false;

    // Function to initialize if not already
    const tryInit = () => {
        // The panel might still be hidden but present.
        const panel = document.getElementById('tab-panel-automations');
        if (panel && !isInitialized) {
            initAutomations();
            isInitialized = true;
        }
    };
    
    // Check if the automations tab is already active on load
    if (automationsTabButton && automationsTabButton.getAttribute('aria-selected') === 'true') {
        tryInit();
    }

    // Add click listener to initialize when tab is selected
    if(automationsTabButton) {
        automationsTabButton.addEventListener('click', () => {
            // Use a small timeout to ensure the panel is visible in the DOM
            setTimeout(tryInit, 50);
        }, { once: true }); // Only need to run this once
    }
});
