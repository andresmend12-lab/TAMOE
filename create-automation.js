import { auth, database } from './firebase.js';
import { ref, push, serverTimestamp, get, update } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';


document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const triggersContainer = document.getElementById('triggers-container');
    const actionsContainer = document.getElementById('actions-container');
    const triggerTemplate = document.getElementById('trigger-template');
    const actionTemplate = document.getElementById('action-template');
    const addTriggerBtn = document.getElementById('add-trigger-btn');
    const addActionBtn = document.getElementById('add-action-btn');
    const workflowContainer = document.getElementById('workflow-container');
    const saveBtn = document.getElementById('save-ca-btn');
    const logoutBtn = document.getElementById('logout-button') || document.getElementById('logout-button-ca');
    const automationNameInput = document.getElementById('auto-name');
    
    // Scope elements
    const scopeClientSelect = document.getElementById('scope-client');
    const scopeProjectsContainer = document.getElementById('scope-projects-container');
    const scopeProjectsList = document.getElementById('scope-projects-list');

    // --- App State ---
    let currentUser = null;
    let clientsData = null; // To store fetched client data
    const urlParams = new URLSearchParams(window.location.search);
    const editingAutomationId = urlParams.get('id');
    let editingAutomationData = null;

    // --- Authentication ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadClients(); // Load client data once authenticated
            if (editingAutomationId) {
                await loadAutomationForEdit(editingAutomationId);
            } else {
                addTrigger();
                addAction();
            }
        } else {
            currentUser = null;
            alert("Debes iniciar sesión para crear una automatización.");
            window.location.href = 'login.html';
        }
    });

    // --- Data Maps ---
    const childActivityMap = {
        'Project': ['Producto', 'Tarea'],
        'Product': ['Tarea'],
        'Task': ['Subtarea']
    };

    const triggerTypesByActivity = {
        Project: [{ value: 'created', label: 'Cuando se crea' }],
        Product: [{ value: 'created', label: 'Cuando se crea' }],
        Task: [
            { value: 'created', label: 'Cuando se crea' },
            { value: 'statusChange', label: 'Cuando cambia el estado' }
        ]
    };

    const generalActions = [
        { value: 'notify', label: 'Enviar notificación por correo' }
    ];

    const actionTemplates = {
        notify: `<div class="p-4 rounded-lg bg-background-dark/50 border border-border-muted/50 flex flex-col gap-3"><label class="text-xs font-bold uppercase text-gray-500 mt-2">Mensaje</label><textarea class="w-full bg-surface-input border border-border-muted rounded-lg p-2 text-white" placeholder="Escribe tu mensaje..."></textarea></div>`,
        move: `<div class="p-4 rounded-lg bg-background-dark/50 border border-border-muted/50 flex flex-col gap-3"><label class="text-xs font-bold uppercase text-gray-500">Mover a Proyecto</label><select class="w-full h-12 rounded-lg bg-surface-input border-border-muted text-white focus:border-primary focus:ring-1 focus:ring-primary pl-4 pr-10 appearance-none cursor-pointer"><option>Proyecto Phoenix</option><option>Proyecto Titán</option></select></div>`,
        createChild: `<div class="p-4 rounded-lg bg-background-dark/50 border border-border-muted/50 flex flex-col gap-3"><label class="text-xs font-bold uppercase text-gray-500 child-activity-name-label">Nombre del Nuevo</label><input class="w-full bg-surface-input border border-border-muted rounded-lg p-2 text-white child-activity-name-input" type="text"/></div>`
    };

    // --- Core Functions ---

    async function loadClients() {
        const clientsRef = ref(database, 'clients');
        try {
            const snapshot = await get(clientsRef);
            if (snapshot.exists()) {
                clientsData = snapshot.val();
                populateClientScopeDropdown();
            } else {
                scopeClientSelect.innerHTML = '<option value="">No hay clientes</option>';
            }
        } catch (error) {
            console.error("Error cargando clientes:", error);
            scopeClientSelect.innerHTML = '<option value="">Error al cargar</option>';
        }
    }

    const normalizeActivityType = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'project' || raw === 'proyecto') return 'Project';
        if (raw === 'product' || raw === 'producto') return 'Product';
        if (raw === 'task' || raw === 'tarea') return 'Task';
        return 'Task';
    };

    const normalizeTriggerType = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'created' || raw === 'create') return 'created';
        if (raw === 'statuschange' || raw === 'status_change') return 'statusChange';
        return 'created';
    };

    const normalizeArray = (value) => {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.values(value);
        return [];
    };

    const setSelectValue = (select, value) => {
        if (!select || value == null) return;
        const optionExists = Array.from(select.options).some(opt => opt.value === value);
        if (optionExists) select.value = value;
    };

    const addTriggerWithData = (trigger) => {
        const triggerClone = triggerTemplate.content.cloneNode(true);
        triggersContainer.appendChild(triggerClone);
        const newBlock = triggersContainer.lastElementChild;
        const activitySelect = newBlock.querySelector('.trigger-activity-type');
        const triggerTypeSelect = newBlock.querySelector('.trigger-type');
        const normalizedActivity = normalizeActivityType(trigger?.activityType);
        setSelectValue(activitySelect, normalizedActivity);
        updateTriggerTypeOptions(newBlock);
        const normalizedTriggerType = normalizeTriggerType(trigger?.triggerType);
        setSelectValue(triggerTypeSelect, normalizedTriggerType);
        handleTriggerTypeChange(newBlock);
        if (normalizedTriggerType === 'statusChange') {
            const fromSelect = newBlock.querySelector('.status-change-options select:first-child');
            const toSelect = newBlock.querySelector('.status-change-options select:last-child');
            if (trigger?.fromState) setSelectValue(fromSelect, trigger.fromState);
            if (trigger?.toState) setSelectValue(toSelect, trigger.toState);
        }
    };

    const addActionWithData = (action, controllingTriggerBlock) => {
        const actionClone = actionTemplate.content.cloneNode(true);
        actionsContainer.appendChild(actionClone);
        const newBlock = actionsContainer.lastElementChild;
        updateActionOptions(newBlock, controllingTriggerBlock);
        const actionSelect = newBlock.querySelector('.action-select');
        if (action?.type) {
            setSelectValue(actionSelect, action.type);
        }
        updateActionDetails(newBlock);
        if (action?.type && action.type.startsWith('createChild_')) {
            const nameInput = newBlock.querySelector('.child-activity-name-input');
            if (nameInput && action?.name) {
                nameInput.value = action.name;
            }
        }
    };

    async function loadAutomationForEdit(automationId) {
        const automationRef = ref(database, `automations/${automationId}`);
        const snapshot = await get(automationRef);
        if (!snapshot.exists()) {
            alert('No se encontro la automatizacion para editar.');
            addTrigger();
            addAction();
            return;
        }

        editingAutomationData = snapshot.val();
        if (automationNameInput) automationNameInput.value = editingAutomationData?.name || '';
        if (saveBtn) saveBtn.textContent = 'Guardar cambios';

        const scope = editingAutomationData?.scope || {};
        const scopeClient = scope.client || 'all';
        if (scopeClientSelect) {
            scopeClientSelect.value = scopeClient;
        }
        renderScopeTreeForClient(scopeClient);
        if (scopeClient && scopeClient !== 'all') {
            const projectIds = Array.isArray(scope.projects) ? scope.projects : [];
            projectIds.forEach((projectId) => {
                const checkbox = scopeProjectsList.querySelector(`input[data-type="project"][value="${projectId}"]`);
                if (checkbox) checkbox.checked = true;
            });
            const productItems = Array.isArray(scope.products) ? scope.products : [];
            productItems.forEach((product) => {
                if (!product) return;
                const checkbox = scopeProjectsList.querySelector(
                    `input[data-type="product"][value="${product.productId}"][data-project-id="${product.projectId}"]`
                );
                if (checkbox) checkbox.checked = true;
            });
        }

        triggersContainer.innerHTML = '';
        actionsContainer.innerHTML = '';
        const triggers = normalizeArray(editingAutomationData?.triggers);
        const actions = normalizeArray(editingAutomationData?.actions);

        if (triggers.length === 0) {
            addTrigger();
        } else {
            triggers.forEach(trigger => addTriggerWithData(trigger));
        }

        const controllingTriggerBlock = triggersContainer.querySelector('.trigger-block');
        if (actions.length === 0) {
            addAction();
        } else {
            actions.forEach(action => addActionWithData(action, controllingTriggerBlock));
        }
    }

    function populateClientScopeDropdown() {
        scopeClientSelect.innerHTML = '<option value="">Selecciona un cliente...</option><option value="all">Todos los Clientes</option>';
        for (const clientId in clientsData) {
            const client = clientsData[clientId];
            const option = document.createElement('option');
            option.value = clientId;
            option.textContent = client.name || 'Cliente sin nombre';
            scopeClientSelect.appendChild(option);
        }
    }

    function renderScopeTreeForClient(clientId) {
        scopeProjectsList.innerHTML = '';
        if (!clientId || clientId === 'all' || !clientsData) {
            scopeProjectsContainer.classList.add('hidden');
            return;
        }

        const client = clientsData[clientId];
        const projects = client?.projects;

        if (!projects || Object.keys(projects).length === 0) {
            scopeProjectsList.innerHTML = '<p class="text-text-muted text-sm">Este cliente no tiene proyectos.</p>';
        } else {
            for (const projectId in projects) {
                const project = projects[projectId];
                const projectDetails = document.createElement('details');
                projectDetails.className = 'mb-2';
                projectDetails.open = true;

                const projectSummary = document.createElement('summary');
                projectSummary.className = 'flex items-center gap-3 cursor-pointer';
                const checkboxId = `proj-scope-${projectId}`;
                projectSummary.innerHTML = `
                    <input id="${checkboxId}" type="checkbox" value="${projectId}" data-type="project" class="h-5 w-5 rounded bg-surface-input border-border-muted text-primary focus:ring-primary scope-checkbox">
                    <label for="${checkboxId}" class="text-white font-semibold">${project.name || 'Proyecto sin nombre'}</label>
                `;
                projectDetails.appendChild(projectSummary);

                const products = project?.products;
                if (products && Object.keys(products).length > 0) {
                    const productList = document.createElement('div');
                    productList.className = 'pl-8 pt-2';
                    for (const productId in products) {
                        const product = products[productId];
                        const productCheckboxId = `prod-scope-${productId}`;
                        const productDiv = document.createElement('div');
                        productDiv.className = 'flex items-center gap-3 mb-2';
                        productDiv.innerHTML = `
                            <input id="${productCheckboxId}" type="checkbox" value="${productId}" data-project-id="${projectId}" data-type="product" class="h-5 w-5 rounded bg-surface-input border-border-muted text-primary focus:ring-primary scope-checkbox">
                            <label for="${productCheckboxId}" class="text-white">${product.name || 'Producto sin nombre'}</label>
                        `;
                        productList.appendChild(productDiv);
                    }
                    projectDetails.appendChild(productList);
                }
                scopeProjectsList.appendChild(projectDetails);
            }
        }
        scopeProjectsContainer.classList.remove('hidden');
    }
    const addTrigger = () => {
        const triggerClone = triggerTemplate.content.cloneNode(true);
        triggersContainer.appendChild(triggerClone);
        const newBlock = triggersContainer.lastElementChild;
        updateTriggerTypeOptions(newBlock);
    };

    const addAction = () => {
        const actionClone = actionTemplate.content.cloneNode(true);
        actionsContainer.appendChild(actionClone);
        const newBlock = actionsContainer.lastElementChild;
        const controllingTriggerBlock = triggersContainer.querySelector('.trigger-block');
        updateActionOptions(newBlock, controllingTriggerBlock);
    };
    
    function updateTriggerTypeOptions(triggerBlock) {
        const activitySelect = triggerBlock.querySelector('.trigger-activity-type');
        const triggerTypeSelect = triggerBlock.querySelector('.trigger-type');
        const selectedActivity = activitySelect.value;
        const triggerOptions = triggerTypesByActivity[selectedActivity] || [];
        
        triggerTypeSelect.innerHTML = '';
        triggerOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            triggerTypeSelect.appendChild(option);
        });

        handleTriggerTypeChange(triggerBlock);
    }

    function handleTriggerTypeChange(triggerBlock) {
        const triggerTypeSelect = triggerBlock.querySelector('.trigger-type');
        const statusOptions = triggerBlock.querySelector('.status-change-options');
        const selectedTriggerType = triggerTypeSelect.value;

        if (selectedTriggerType === 'statusChange') {
            statusOptions.classList.remove('hidden');
            statusOptions.classList.add('grid');
        } else {
            statusOptions.classList.add('hidden');
            statusOptions.classList.remove('grid');
        }
        
        document.querySelectorAll('.action-block').forEach(actionBlock => {
            updateActionOptions(actionBlock, triggerBlock);
        });
    }
    
    function updateActionOptions(actionBlock, triggerBlock) {
        const actionSelect = actionBlock.querySelector('.action-select');
        if (!triggerBlock) {
            actionSelect.innerHTML = '';
            generalActions.forEach(action => {
                const option = document.createElement('option');
                option.value = action.value;
                option.textContent = action.label;
                actionSelect.appendChild(option);
            });
            updateActionDetails(actionBlock);
            return;
        }

        const activitySelect = triggerBlock.querySelector('.trigger-activity-type');
        const triggerTypeSelect = triggerBlock.querySelector('.trigger-type');
        
        const selectedActivity = activitySelect.value;
        const selectedTrigger = triggerTypeSelect.value;
        const childActivityNames = childActivityMap[selectedActivity] || [];
        
        actionSelect.innerHTML = '';

        if ((selectedTrigger === 'created' || selectedTrigger === 'statusChange') && childActivityNames.length > 0) {
            childActivityNames.forEach(childName => {
                const createChildOption = document.createElement('option');
                createChildOption.value = `createChild_${childName}`; 
                createChildOption.textContent = `Crear ${childName}`;
                actionSelect.appendChild(createChildOption);
            });
        }

        generalActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action.value;
            option.textContent = action.label;
            actionSelect.appendChild(option);
        });

        updateActionDetails(actionBlock);
    }

    function updateActionDetails(actionBlock) {
        const actionSelect = actionBlock.querySelector('.action-select');
        const actionDetailsContainer = actionBlock.querySelector('.action-details');
        const selectedActionValue = actionSelect.value;
        
        if (selectedActionValue.startsWith('createChild_')) {
            const childActivityName = selectedActionValue.split('_')[1];
            actionDetailsContainer.innerHTML = actionTemplates.createChild;
            if (childActivityName) {
                actionDetailsContainer.querySelector('.child-activity-name-label').textContent = `Nombre del Nuevo ${childActivityName}`;
                actionDetailsContainer.querySelector('.child-activity-name-input').placeholder = `Ej. 'Nuevo ${childActivityName}...'`;
            }
        } else {
             actionDetailsContainer.innerHTML = actionTemplates[selectedActionValue] || '';
        }
    }

    async function saveAutomation() {
        if (!currentUser) {
            alert("Error: No has iniciado sesión.");
            return;
        }
        
        const name = automationNameInput.value.trim();
        if (!name) {
            alert("Por favor, dale un nombre a la automatización.");
            automationNameInput.focus();
            return;
        }

        const triggers = [];
        document.querySelectorAll('.trigger-block').forEach(block => {
            const activityType = block.querySelector('.trigger-activity-type').value;
            const triggerType = block.querySelector('.trigger-type').value;
            const triggerData = { activityType, triggerType };
            if (triggerType === 'statusChange') {
                const from = block.querySelector('.status-change-options select:first-child').value;
                const to = block.querySelector('.status-change-options select:last-child').value;
                triggerData.fromState = from;
                triggerData.toState = to;
            }
            triggers.push(triggerData);
        });

        if (triggers.length === 0) {
            alert("Debes añadir al menos un disparador.");
            return;
        }

        const actions = [];
        document.querySelectorAll('.action-block').forEach(block => {
            const actionType = block.querySelector('.action-select').value;
            const actionData = { type: actionType };
            if (actionType.startsWith('createChild_')) {
                const nameInput = block.querySelector('.child-activity-name-input');
                const customName = String(nameInput?.value || '').trim();
                if (customName) {
                    actionData.name = customName;
                }
            }
            actions.push(actionData);
        });

        if (actions.length === 0) {
            alert("Debes añadir al menos una acción.");
            return;
        }

        const selectedClientId = scopeClientSelect.value;
        const selectedProjects = [];
        const selectedProducts = [];
        if (selectedClientId && selectedClientId !== 'all') {
            document.querySelectorAll('#scope-projects-list input[type="checkbox"]:checked').forEach(checkbox => {
                if (checkbox.dataset.type === 'project') {
                    selectedProjects.push(checkbox.value);
                } else if (checkbox.dataset.type === 'product') {
                    selectedProducts.push({
                        projectId: checkbox.dataset.projectId,
                        productId: checkbox.value
                    });
                }
            });
        }

        const automationData = {
            name,
            triggers,
            actions,
            scope: {
                client: selectedClientId,
                projects: selectedProjects,
                products: selectedProducts
            },
            enabled: true,
            createdByUid: currentUser.uid,
            createdAt: serverTimestamp()
        };

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Guardando...';
            
            if (editingAutomationId) {
                const automationRef = ref(database, `automations/${editingAutomationId}`);
                await update(automationRef, {
                    name,
                    triggers,
                    actions,
                    scope: automationData.scope,
                    updatedAt: serverTimestamp()
                });
            } else {
                const automationsRef = ref(database, 'automations');
                await push(automationsRef, automationData);
            }
            
            alert('Automatizacion guardada con exito.');
            window.location.href = 'maindashboard.html';

        } catch (error) {
            console.error("Error guardando la automatización: ", error);
            alert(`Error al guardar: ${error.message}`);
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">save</span> Guardar Automatizacion';
        }
    }
    
    // --- Event Delegation & Listeners ---
    
    scopeClientSelect.addEventListener('change', (e) => {
        renderScopeTreeForClient(e.target.value);
    });

    workflowContainer.addEventListener('change', (e) => {
        const target = e.target;
        if (target.matches('.trigger-activity-type')) {
            updateTriggerTypeOptions(target.closest('.trigger-block'));
        }
        if (target.matches('.trigger-type')) {
            handleTriggerTypeChange(target.closest('.trigger-block'));
        }
        if (target.matches('.action-select')) {
            updateActionDetails(target.closest('.action-block'));
        }
    });

    workflowContainer.addEventListener('click', (e) => {
        if (e.target.closest('.delete-trigger-btn')) {
            e.target.closest('.trigger-block').remove();
        }
        if (e.target.closest('.delete-action-btn')) {
            e.target.closest('.action-block').remove();
        }
    });

    addTriggerBtn.addEventListener('click', addTrigger);
    addActionBtn.addEventListener('click', addAction);
    saveBtn.addEventListener('click', saveAutomation);

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut().then(() => {
                window.location.href = 'login.html';
            });
        });
    }

});
