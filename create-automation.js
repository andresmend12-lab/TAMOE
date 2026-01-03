import { auth, database } from './firebase.js';
import { ref, push, serverTimestamp, get, update } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import {
    TRIGGER_TYPES,
    TRIGGER_CONTEXT_FIELDS,
    OPERATORS_BY_FIELD_TYPE,
    OPERATOR_LABELS,
    CONDITION_OPERATORS
} from './automation-engine.js';


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

    // Condition elements (v2)
    const conditionsSection = document.getElementById('conditions-section');
    const conditionsBuilder = document.getElementById('conditions-builder');
    const conditionRulesContainer = document.getElementById('condition-rules-container');
    const conditionRuleTemplate = document.getElementById('condition-rule-template');
    const toggleConditionsBtn = document.getElementById('toggle-conditions-btn');
    const toggleConditionsIcon = document.getElementById('toggle-conditions-icon');
    const toggleConditionsText = document.getElementById('toggle-conditions-text');
    const noConditionsMessage = document.getElementById('no-conditions-message');
    const addConditionBtn = document.getElementById('add-condition-btn');
    const logicalOpBtns = document.querySelectorAll('.logical-op-btn');

    // --- App State ---
    let currentUser = null;
    let clientsData = null; // To store fetched client data
    const urlParams = new URLSearchParams(window.location.search);
    const editingAutomationId = urlParams.get('id');
    let editingAutomationData = null;
    let conditionsLogicalOperator = 'AND'; // 'AND' or 'OR'
    let conditionsEnabled = false;

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

    // Mapeo de activityType a triggerType del engine
    const activityToTriggerType = {
        'Project': TRIGGER_TYPES.PROJECT_CREATED,
        'Product': TRIGGER_TYPES.PRODUCT_CREATED,
        'Task': TRIGGER_TYPES.TASK_CREATED
    };

    // --- Condition Functions (v2) ---

    function getCurrentTriggerType() {
        const triggerBlock = triggersContainer.querySelector('.trigger-block');
        if (!triggerBlock) return null;

        const activitySelect = triggerBlock.querySelector('.trigger-activity-type');
        const triggerTypeSelect = triggerBlock.querySelector('.trigger-type');

        if (!activitySelect || !triggerTypeSelect) return null;

        const activityType = activitySelect.value;
        const triggerType = triggerTypeSelect.value;

        if (triggerType === 'statusChange' && activityType === 'Task') {
            return TRIGGER_TYPES.TASK_STATUS_CHANGED;
        }

        return activityToTriggerType[activityType] || null;
    }

    function getContextFieldsForTrigger(triggerType) {
        return TRIGGER_CONTEXT_FIELDS[triggerType] || [];
    }

    function getOperatorsForFieldType(fieldType) {
        return OPERATORS_BY_FIELD_TYPE[fieldType] || OPERATORS_BY_FIELD_TYPE['string'];
    }

    function toggleConditionsVisibility(show) {
        conditionsEnabled = show;
        if (show) {
            conditionsBuilder.classList.remove('hidden');
            noConditionsMessage.classList.add('hidden');
            toggleConditionsIcon.textContent = 'remove';
            toggleConditionsText.textContent = 'Ocultar condiciones';
        } else {
            conditionsBuilder.classList.add('hidden');
            noConditionsMessage.classList.remove('hidden');
            toggleConditionsIcon.textContent = 'add';
            toggleConditionsText.textContent = 'Agregar condiciones';
            // Clear all condition rules when hiding
            conditionRulesContainer.innerHTML = '';
        }
    }

    function updateLogicalOperatorUI(operator) {
        conditionsLogicalOperator = operator;
        logicalOpBtns.forEach(btn => {
            if (btn.dataset.operator === operator) {
                btn.classList.remove('bg-surface-input', 'text-gray-400');
                btn.classList.add('bg-primary', 'text-white');
            } else {
                btn.classList.remove('bg-primary', 'text-white');
                btn.classList.add('bg-surface-input', 'text-gray-400');
            }
        });
    }

    function addConditionRule(ruleData = null) {
        if (!conditionRuleTemplate) return;

        const clone = conditionRuleTemplate.content.cloneNode(true);
        conditionRulesContainer.appendChild(clone);

        const newRule = conditionRulesContainer.lastElementChild;
        const fieldSelect = newRule.querySelector('.condition-field');
        const operatorSelect = newRule.querySelector('.condition-operator');

        // Populate field options based on current trigger
        updateConditionFieldOptions(fieldSelect);

        // Populate operator options based on first field
        updateConditionOperatorOptions(operatorSelect, fieldSelect);

        // If we have data to pre-populate
        if (ruleData) {
            if (ruleData.field) {
                fieldSelect.value = ruleData.field;
                updateConditionOperatorOptions(operatorSelect, fieldSelect);
            }
            if (ruleData.op) {
                operatorSelect.value = ruleData.op;
            }
            updateConditionValueInput(newRule, ruleData.value);
        } else {
            updateConditionValueInput(newRule);
        }
    }

    function updateConditionFieldOptions(fieldSelect) {
        const triggerType = getCurrentTriggerType();
        const fields = getContextFieldsForTrigger(triggerType);

        fieldSelect.innerHTML = '';

        if (fields.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Selecciona un disparador primero';
            opt.disabled = true;
            fieldSelect.appendChild(opt);
            return;
        }

        fields.forEach(field => {
            const opt = document.createElement('option');
            opt.value = field.field;
            opt.textContent = field.label;
            opt.dataset.type = field.type;
            if (field.options) {
                opt.dataset.options = JSON.stringify(field.options);
            }
            fieldSelect.appendChild(opt);
        });
    }

    function updateConditionOperatorOptions(operatorSelect, fieldSelect) {
        const selectedOption = fieldSelect.options[fieldSelect.selectedIndex];
        const fieldType = selectedOption?.dataset?.type || 'string';
        const operators = getOperatorsForFieldType(fieldType);

        operatorSelect.innerHTML = '';

        operators.forEach(op => {
            const opt = document.createElement('option');
            opt.value = op;
            opt.textContent = OPERATOR_LABELS[op] || op;
            operatorSelect.appendChild(opt);
        });
    }

    function updateConditionValueInput(ruleElement, existingValue = null) {
        const fieldSelect = ruleElement.querySelector('.condition-field');
        const operatorSelect = ruleElement.querySelector('.condition-operator');
        const valueContainer = ruleElement.querySelector('.condition-value-container');

        const selectedOption = fieldSelect.options[fieldSelect.selectedIndex];
        const fieldType = selectedOption?.dataset?.type || 'string';
        const fieldOptions = selectedOption?.dataset?.options ? JSON.parse(selectedOption.dataset.options) : null;
        const operator = operatorSelect.value;

        // Operators that don't need a value input
        const noValueOps = [CONDITION_OPERATORS.IS_EMPTY, CONDITION_OPERATORS.IS_NOT_EMPTY, CONDITION_OPERATORS.EXISTS];

        if (noValueOps.includes(operator)) {
            valueContainer.innerHTML = '<span class="text-gray-500 text-sm italic px-3 leading-10">Sin valor requerido</span>';
            return;
        }

        // For enum fields with options, show a select
        if (fieldType === 'enum' && fieldOptions) {
            let html = `<select class="condition-value w-full h-10 rounded-lg bg-surface-input border-border-muted text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary pl-3 pr-8 appearance-none cursor-pointer">`;
            fieldOptions.forEach(opt => {
                const selected = existingValue === opt ? 'selected' : '';
                html += `<option value="${opt}" ${selected}>${opt}</option>`;
            });
            html += `</select>`;
            valueContainer.innerHTML = html;
        } else {
            // Default text input
            const value = existingValue !== null ? existingValue : '';
            valueContainer.innerHTML = `<input type="text" class="condition-value w-full h-10 rounded-lg bg-surface-input border border-border-muted text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary px-3" placeholder="Valor..." value="${value}">`;
        }
    }

    function refreshAllConditionFields() {
        const rules = conditionRulesContainer.querySelectorAll('.condition-rule');
        rules.forEach(rule => {
            const fieldSelect = rule.querySelector('.condition-field');
            const operatorSelect = rule.querySelector('.condition-operator');

            // Store current values
            const currentField = fieldSelect.value;
            const currentOp = operatorSelect.value;
            const valueInput = rule.querySelector('.condition-value');
            const currentValue = valueInput?.value || '';

            // Refresh field options
            updateConditionFieldOptions(fieldSelect);

            // Try to restore field selection
            if (Array.from(fieldSelect.options).some(opt => opt.value === currentField)) {
                fieldSelect.value = currentField;
            }

            // Refresh operator options
            updateConditionOperatorOptions(operatorSelect, fieldSelect);

            // Try to restore operator selection
            if (Array.from(operatorSelect.options).some(opt => opt.value === currentOp)) {
                operatorSelect.value = currentOp;
            }

            // Refresh value input
            updateConditionValueInput(rule, currentValue);
        });
    }

    function getConditionsData() {
        if (!conditionsEnabled) return null;

        const rules = [];
        conditionRulesContainer.querySelectorAll('.condition-rule').forEach(rule => {
            const field = rule.querySelector('.condition-field').value;
            const op = rule.querySelector('.condition-operator').value;
            const valueInput = rule.querySelector('.condition-value');
            const value = valueInput?.value || '';

            if (field && op) {
                rules.push({ field, op, value });
            }
        });

        if (rules.length === 0) return null;

        return {
            operator: conditionsLogicalOperator,
            rules
        };
    }

    function loadConditionsFromData(conditions) {
        if (!conditions || !conditions.rules || conditions.rules.length === 0) {
            toggleConditionsVisibility(false);
            return;
        }

        toggleConditionsVisibility(true);
        updateLogicalOperatorUI(conditions.operator || 'AND');

        conditions.rules.forEach(rule => {
            addConditionRule(rule);
        });
    }

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

        // Load conditions (v2)
        if (editingAutomationData?.conditions) {
            loadConditionsFromData(editingAutomationData.conditions);
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

        // Refresh condition fields when trigger changes (v2)
        refreshAllConditionFields();
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

        // Get conditions (v2)
        const conditions = getConditionsData();

        const automationData = {
            name,
            triggers,
            actions,
            conditions, // v2: condiciones opcionales
            scope: {
                client: selectedClientId,
                projects: selectedProjects,
                products: selectedProducts
            },
            enabled: true,
            createdBy: currentUser.uid,
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
                    conditions, // v2
                    scope: automationData.scope,
                    updatedAt: serverTimestamp()
                });
            } else {
                const automationsRef = ref(database, 'automations');
                await push(automationsRef, automationData);
            }
            
            alert('Automatización guardada con éxito.');
            // Clear dirty state before navigation
            if (typeof window.clearDirtyState === 'function') {
                window.clearDirtyState();
            }
            window.location.href = 'maindashboard.html?tab=automations';

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

    // --- Condition Event Listeners (v2) ---

    // Toggle conditions visibility
    if (toggleConditionsBtn) {
        toggleConditionsBtn.addEventListener('click', () => {
            toggleConditionsVisibility(!conditionsEnabled);
            if (conditionsEnabled && conditionRulesContainer.children.length === 0) {
                addConditionRule();
            }
        });
    }

    // Add condition button
    if (addConditionBtn) {
        addConditionBtn.addEventListener('click', () => {
            addConditionRule();
        });
    }

    // Logical operator buttons
    logicalOpBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            updateLogicalOperatorUI(btn.dataset.operator);
        });
    });

    // Condition field/operator changes (delegated)
    if (conditionRulesContainer) {
        conditionRulesContainer.addEventListener('change', (e) => {
            const target = e.target;
            const rule = target.closest('.condition-rule');
            if (!rule) return;

            if (target.matches('.condition-field')) {
                const operatorSelect = rule.querySelector('.condition-operator');
                updateConditionOperatorOptions(operatorSelect, target);
                updateConditionValueInput(rule);
            }

            if (target.matches('.condition-operator')) {
                updateConditionValueInput(rule);
            }
        });

        // Delete condition button
        conditionRulesContainer.addEventListener('click', (e) => {
            if (e.target.closest('.delete-condition-btn')) {
                e.target.closest('.condition-rule').remove();
                // If no rules left, hide the builder
                if (conditionRulesContainer.children.length === 0) {
                    toggleConditionsVisibility(false);
                }
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut().then(() => {
                window.location.href = 'login.html';
            });
        });
    }

});
