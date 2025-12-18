document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const triggerActivityType = document.getElementById('trigger-activity-type');
    const triggerType = document.getElementById('trigger-type');
    const statusChangeOptions = document.getElementById('status-change-options');
    const actionSelect = document.getElementById('action-select');
    const actionDetails = document.getElementById('action-details');
    const saveBtn = document.getElementById('save-ca-btn');
    const logoutBtn = document.getElementById('logout-button-ca');

    // --- Data Maps ---
    const childActivityMap = {
        'Project': ['Producto', 'Tarea'], // Can be an array
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
        { value: 'notify', label: 'Enviar notificación por correo' },
        { value: 'move', label: 'Mover a otro proyecto' }
    ];

    const actionTemplates = {
        notify: `<div class="p-4 rounded-lg bg-background-dark/50 border border-border-muted/50 flex flex-col gap-3"><label class="text-xs font-bold uppercase text-gray-500 mt-2">Mensaje</label><textarea class="w-full bg-surface-input border border-border-muted rounded-lg p-2 text-white" placeholder="Escribe tu mensaje..."></textarea></div>`,
        move: `<div class="p-4 rounded-lg bg-background-dark/50 border border-border-muted/50 flex flex-col gap-3"><label class="text-xs font-bold uppercase text-gray-500">Mover a Proyecto</label><select class="w-full h-12 rounded-lg bg-surface-input border-border-muted text-white focus:border-primary focus:ring-1 focus:ring-primary pl-4 pr-10 appearance-none cursor-pointer"><option>Proyecto Phoenix</option><option>Proyecto Titán</option></select></div>`,
        createChild: `<div class="p-4 rounded-lg bg-background-dark/50 border border-border-muted/50 flex flex-col gap-3"><label class="text-xs font-bold uppercase text-gray-500" id="child-activity-name-label">Nombre del Nuevo</label><input id="child-activity-name-input" class="w-full bg-surface-input border border-border-muted rounded-lg p-2 text-white" type="text"/></div>`
    };

    // --- Functions ---

    /**
     * Updates the "Tipo de Disparador" dropdown based on the selected "Tipo de Actividad".
     */
    function updateTriggerTypeOptions() {
        const selectedActivity = triggerActivityType.value;
        const triggerOptions = triggerTypesByActivity[selectedActivity] || [];
        
        triggerType.innerHTML = '';
        triggerOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            triggerType.appendChild(option);
        });

        handleTriggerTypeChange();
    }

    /**
     * Shows/hides the status change dropdown and updates available actions.
     */
    function handleTriggerTypeChange() {
        const selectedTriggerType = triggerType.value;
        if (selectedTriggerType === 'statusChange') {
            statusChangeOptions.classList.remove('hidden');
        } else {
            statusChangeOptions.classList.add('hidden');
        }
        updateActionOptions();
    }
    
    /**
     * Updates the "Acción" dropdown based on the selected activity and trigger type.
     */
    function updateActionOptions() {
        const selectedActivity = triggerActivityType.value;
        const selectedTrigger = triggerType.value;
        const childActivityNames = childActivityMap[selectedActivity] || [];
        
        actionSelect.innerHTML = '';

        if (selectedTrigger === 'created' && childActivityNames.length > 0) {
            childActivityNames.forEach(childName => {
                const createChildOption = document.createElement('option');
                // The value now includes 'createChild' and the type of child
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

        updateActionDetails();
    }

    /**
     * Updates the details section for the selected action.
     */
    function updateActionDetails() {
        const selectedActionValue = actionSelect.value;
        
        if (selectedActionValue.startsWith('createChild_')) {
            const childActivityName = selectedActionValue.split('_')[1];
            actionDetails.innerHTML = actionTemplates.createChild;
            if (childActivityName) {
                document.getElementById('child-activity-name-label').textContent = `Nombre del Nuevo ${childActivityName}`;
                document.getElementById('child-activity-name-input').placeholder = `Ej. 'Nuevo ${childActivityName}...'`;
            }
        } else {
             actionDetails.innerHTML = actionTemplates[selectedActionValue] || '';
        }
    }
    
    // --- Event Listeners ---
    triggerActivityType.addEventListener('change', updateTriggerTypeOptions);
    triggerType.addEventListener('change', handleTriggerTypeChange);
    actionSelect.addEventListener('change', updateActionDetails);

    saveBtn.addEventListener('click', () => {
        const automationName = document.getElementById('auto-name').value;
        console.log(`Guardando automatización: ${automationName}`);
        alert(`Automatización "${automationName}" guardada (simulado). Redirigiendo al dashboard.`);
        window.location.href = 'maindashboard.html#automations';
    });

    logoutBtn.addEventListener('click', () => {
        console.log("Cerrando sesión...");
        alert("Cerrando sesión (simulado).");
        window.location.href = 'login.html';
    });

    // --- Initial Setup ---
    updateTriggerTypeOptions();
});
