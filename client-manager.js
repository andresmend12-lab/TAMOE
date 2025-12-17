import { auth, database } from './firebase.js';
import { ref, push, onValue, query, set, update, remove, runTransaction } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

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
    let listenersAttached = false;
    let selectedClientId = null;
    let selectedProjectId = null;
    let selectedProductId = null;
    let selectedTaskId = null;
    let selectedSubtaskId = null;

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

    const openDetailPage = (manageId) => {
        if (!manageId) return;
        const url = `${window.location.origin}/${encodeURIComponent(manageId)}`;
        window.open(url, '_blank', 'noopener');
    };

    const createIdChip = (manageId) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'manage-chip text-[11px] text-text-muted shrink-0 hover:text-white hover:underline';
        chip.textContent = manageId || '';
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            openDetailPage(manageId);
        });
        return chip;
    };

    const normalizeStatus = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return 'Pendiente';
        if (raw === 'pendiente') return 'Pendiente';
        if (raw === 'en proceso' || raw === 'enproceso' || raw === 'en_proceso') return 'En proceso';
        if (raw === 'finalizado' || raw === 'finalizada') return 'Finalizado';
        return 'Pendiente';
    };

    const STATUS_OPTIONS = ['Pendiente', 'En proceso', 'Finalizado'];
    const STATUS_STYLES = {
        'Pendiente': 'bg-slate-500/15 text-slate-200 border-slate-500/30',
        'En proceso': 'bg-blue-500/15 text-blue-200 border-blue-500/30',
        'Finalizado': 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    };

    const applyStatusChipStyle = (button, labelEl, status) => {
        const normalized = normalizeStatus(status);
        if (labelEl) labelEl.textContent = normalized;
        if (!button) return;
        const style = STATUS_STYLES[normalized] || STATUS_STYLES.Pendiente;
        button.className = `inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${style} hover:brightness-110 transition-colors`;
        button.setAttribute('aria-label', `Estado: ${normalized}`);
        button.title = normalized;
    };

    const updateStatusAtPath = async (path, nextStatus) => {
        if (!currentUser) {
            alert("Debes iniciar sesión para cambiar el estado.");
            return;
        }
        const normalized = normalizeStatus(nextStatus);
        await update(ref(database, path), { status: normalized });
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
        menu.className = 'action-menu hidden absolute right-0 w-44 bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-x-hidden overflow-y-auto z-50';

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
            optBtn.className = 'w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 text-left';
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
        button.className = 'p-1 rounded-md text-text-muted hover:text-white hover:bg-white/5 transition-colors';
        button.setAttribute('aria-label', 'Opciones');
        button.innerHTML = '<span class="material-symbols-outlined text-[18px]">settings</span>';

        const menu = document.createElement('div');
        menu.className = 'action-menu hidden absolute right-0 top-full mt-2 w-44 bg-surface-dark border border-border-dark rounded-lg shadow-xl overflow-hidden z-40';

        const renameButton = document.createElement('button');
        renameButton.type = 'button';
        renameButton.className = 'w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 text-left';
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

    // ManageId helpers (per client prefix + counter)
    const stripDiacritics = (value) => {
        if (typeof value !== 'string') return '';
        return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };

    const buildManagePrefixFromName = (name) => {
        const cleaned = stripDiacritics(String(name || '')).trim();
        if (!cleaned) return 'XX';

        const words = cleaned.split(/\s+/).filter(Boolean);
        const pickFirstAlnum = (word) => {
            const match = String(word).match(/[A-Za-z0-9]/);
            return match ? match[0].toUpperCase() : '';
        };

        if (words.length >= 2) {
            const initials = words.map(pickFirstAlnum).filter(Boolean).join('');
            return initials || 'XX';
        }

        const chars = (words[0].match(/[A-Za-z0-9]/g) || []).join('');
        const prefix = chars.slice(0, 2).toUpperCase();
        return (prefix || 'XX').padEnd(2, 'X');
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

    // Render list of clients
    const renderClients = () => {
        clientListNav.innerHTML = '';
        if (allClients.length > 0) {
            noClientsMessage.classList.add('hidden');
            allClients.sort((a, b) => a.name.localeCompare(b.name));
            allClients.forEach(client => {
                const row = document.createElement('div');
                row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-text-muted hover:bg-white/5 hover:text-white transition-colors';
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
                            await update(ref(database, `clients/${client.id}`), { name: nextName });
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
        } else {
            noClientsMessage.textContent = 'No hay clientes.';
            noClientsMessage.classList.remove('hidden');
        }
    };

    // View toggles
    const showClientView = () => {
        selectedClientId = null;
        selectedProjectId = null;
        selectedProductId = null;
        hideEl(backToClientsBtn);
        resetProjectDetail();
        hideEl(productListSection);
        hideEl(projectListSection);
        showEl(clientListSection);
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

    const showProjectView = (clientId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        selectedClientId = clientId;
        selectedProjectId = null;
        selectedProductId = null;
        ensureClientManageConfig(clientId).catch(error => console.error('Error ensuring manageId config:', error));
        if (clientNameHeader) clientNameHeader.textContent = client.name;
        renderProjects(clientId);
        resetProjectDetail();
        showEl(backToClientsBtn);
        hideEl(productListSection);
        showEl(projectListSection);
        hideEl(clientListSection);
    };

    const showProductView = (clientId, projectId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        const project = client.projects?.[projectId];
        if (!project) return;

        selectedClientId = clientId;
        selectedProjectId = projectId;
        selectedProductId = null;
        selectedTaskId = null;
        selectedSubtaskId = null;
        ensureClientManageConfig(clientId).catch(error => console.error('Error ensuring manageId config:', error));

        if (productClientNameHeader) productClientNameHeader.textContent = client.name;
        if (projectNameHeader) projectNameHeader.textContent = project.name;

        renderProducts(clientId, projectId);

        if (projectDetail) projectDetail.classList.remove('hidden');
        if (projectDetailName) projectDetailName.textContent = project.name;
        if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto (sin producto).';
        renderTasks(clientId, projectId, null);

        showEl(productListSection);
        hideEl(projectListSection);
        hideEl(clientListSection);
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
        addProjectModal.classList.remove('hidden');
        setTimeout(() => projectNameInput?.focus(), 50);
    };

    const closeProjectModal = () => {
        addProjectModal.classList.add('hidden');
        addProjectForm?.reset();
    };

    const openProductModal = () => {
        if (!selectedClientId || !selectedProjectId) {
            alert('Selecciona un proyecto primero.');
            return;
        }
        addProductModal.classList.remove('hidden');
        setTimeout(() => productNameInput?.focus(), 50);
    };

    const closeProductModal = () => {
        addProductModal.classList.add('hidden');
        addProductForm?.reset();
    };

    const openTaskModal = () => {
        if (!selectedClientId || !selectedProjectId) {
            alert('Selecciona un proyecto primero.');
            return;
        }
        addTaskModal.classList.remove('hidden');
        setTimeout(() => taskNameInput?.focus(), 50);
    };

    const closeTaskModal = () => {
        addTaskModal.classList.add('hidden');
        addTaskForm?.reset();
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
        const projectArray = Object.keys(projects || {}).map(key => ({ id: key, ...projects[key] }));
        if (projectArray.length === 0) {
            noProjectsMessage.textContent = 'No hay proyectos.';
            noProjectsMessage.classList.remove('hidden');
            return;
        }
        noProjectsMessage.classList.add('hidden');
        projectArray.sort((a, b) => a.name.localeCompare(b.name));
        projectArray.forEach(proj => {
            const row = document.createElement('div');
            row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-text-muted hover:bg-white/5 hover:text-white transition-colors';
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

            const statusControl = createStatusControl({
                status: proj.status,
                onChange: async (nextStatus) => {
                    await updateStatusAtPath(`clients/${clientId}/projects/${proj.id}`, nextStatus);
                    proj.status = nextStatus;
                    if (client?.projects?.[proj.id]) client.projects[proj.id].status = nextStatus;
                    renderTree();
                }
            });
            const idTag = createIdChip(proj.manageId);

            nameWrapper.append(nameSpan, statusControl, idTag);
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
                        await update(ref(database, `clients/${clientId}/projects/${proj.id}`), { name: nextName });
                        proj.name = nextName;
                        if (client?.projects?.[proj.id]) client.projects[proj.id].name = nextName;
                        nameSpan.textContent = nextName;
                        if (selectedClientId === clientId && selectedProjectId === proj.id) {
                            if (projectNameHeader) projectNameHeader.textContent = nextName;
                            if (!selectedProductId && projectDetailName) projectDetailName.textContent = nextName;
                        }
                        renderProjects(clientId);
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
                        if (client?.projects?.[proj.id]) delete client.projects[proj.id];
                        if (selectedClientId === clientId && selectedProjectId === proj.id) {
                            showProjectView(clientId);
                        } else {
                            renderProjects(clientId);
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
        const productArray = Object.keys(products || {}).map(key => ({ id: key, ...products[key] }));

        if (productArray.length === 0) {
            noProductsMessage.textContent = 'No hay productos.';
            noProductsMessage.classList.remove('hidden');
            return;
        }

        noProductsMessage.classList.add('hidden');
        productArray.sort((a, b) => a.name.localeCompare(b.name));
        productArray.forEach(prod => {
            const row = document.createElement('div');
            row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-text-muted hover:bg-white/5 hover:text-white transition-colors';
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

            const statusControl = createStatusControl({
                status: prod.status,
                onChange: async (nextStatus) => {
                    await updateStatusAtPath(`clients/${clientId}/projects/${projectId}/products/${prod.id}`, nextStatus);
                    prod.status = nextStatus;
                    if (project?.products?.[prod.id]) project.products[prod.id].status = nextStatus;
                    renderTree();
                }
            });
            const idTag = createIdChip(prod.manageId);

            nameWrapper.append(nameSpan, statusControl, idTag);
            selectButton.append(icon, nameWrapper);
            selectButton.addEventListener('click', () => {
                selectedProductId = prod.id;
                selectedTaskId = null;
                selectedSubtaskId = null;
                if (projectDetail) projectDetail.classList.remove('hidden');
                if (projectDetailName) projectDetailName.textContent = prod.name;
                if (projectDetailSub) projectDetailSub.textContent = 'Tareas del producto.';
                renderTasks(clientId, projectId, prod.id);
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
                        await update(ref(database, `clients/${clientId}/projects/${projectId}/products/${prod.id}`), { name: nextName });
                        prod.name = nextName;
                        if (project?.products?.[prod.id]) project.products[prod.id].name = nextName;
                        if (selectedClientId === clientId && selectedProjectId === projectId && selectedProductId === prod.id) {
                            if (projectDetailName) projectDetailName.textContent = nextName;
                        }
                        renderProducts(clientId, projectId);
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
                        if (project?.products?.[prod.id]) delete project.products[prod.id];
                        if (selectedClientId === clientId && selectedProjectId === projectId && selectedProductId === prod.id) {
                            selectedProductId = null;
                            selectedTaskId = null;
                            selectedSubtaskId = null;
                            if (projectDetail) projectDetail.classList.remove('hidden');
                            if (projectDetailName) projectDetailName.textContent = project?.name || 'Selecciona un proyecto';
                            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto (sin producto).';
                            renderTasks(clientId, projectId, null);
                        }
                        renderProducts(clientId, projectId);
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
        const subtaskArray = Object.keys(subtasks || {}).map(key => ({ id: key, ...subtasks[key] }));

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
        subtaskArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const basePath = productId
            ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}/subtasks`
            : `clients/${clientId}/projects/${projectId}/tasks/${taskId}/subtasks`;

        subtaskArray.forEach(subtask => {
            const row = document.createElement('div');
            row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border-dark bg-surface-darker text-white hover:bg-white/5 transition-colors';
            row.dataset.subtaskId = subtask.id;

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'flex items-center gap-3 flex-1 min-w-0 text-left';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined text-text-muted';
            icon.textContent = 'subdirectory_arrow_right';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm font-medium truncate';
            nameSpan.textContent = subtask.name;

            const nameWrapper = document.createElement('div');
            nameWrapper.className = 'flex items-center gap-2 min-w-0';

            const statusControl = createStatusControl({
                status: subtask.status,
                onChange: async (nextStatus) => {
                    await updateStatusAtPath(`${basePath}/${subtask.id}`, nextStatus);
                    subtask.status = nextStatus;
                    if (subtasks?.[subtask.id]) subtasks[subtask.id].status = nextStatus;
                    renderTree();
                }
            });
            const idTag = createIdChip(subtask.manageId);

            nameWrapper.append(nameSpan, statusControl, idTag);
            selectButton.append(icon, nameWrapper);
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
                        await update(ref(database, `${basePath}/${subtask.id}`), { name: nextName });
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
                    const confirmed = confirm(`¿Eliminar la subtarea \"${subtask.name}\"?`);
                    if (!confirmed) return;

                    try {
                        await remove(ref(database, `${basePath}/${subtask.id}`));
                        if (subtasks?.[subtask.id]) delete subtasks[subtask.id];
                        if (selectedSubtaskId === subtask.id) selectedSubtaskId = null;
                        renderSubtasks(clientId, projectId, productId, taskId);
                    } catch (error) {
                        console.error('Error deleting subtask:', error);
                        alert(`No se pudo eliminar la subtarea: ${error.message}`);
                    }
                },
            });

            row.append(selectButton, actions);
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
        treeBody.innerHTML = '';

        if (!allClients.length) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'text-text-muted text-sm';
            emptyMsg.textContent = 'No hay clientes.';
            treeBody.appendChild(emptyMsg);
            return;
        }

        const sortedClients = [...allClients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const makeSummary = (icon, name, manageId, status = null, onStatusChange = null) => {
            const summary = document.createElement('summary');
            summary.className = 'flex items-center justify-between gap-2 cursor-pointer select-none px-3 py-2 text-white hover:bg-white/5 rounded-lg';

            const left = document.createElement('div');
            left.className = 'flex items-center gap-2';
            const ic = document.createElement('span');
            ic.className = 'material-symbols-outlined text-text-muted';
            ic.textContent = icon;
            const title = document.createElement('span');
            title.className = 'text-sm font-semibold';
            title.textContent = name;
            left.append(ic, title);
            if (status !== null) {
                const statusControl = createStatusControl({
                    status,
                    onChange: async (nextStatus) => {
                        if (typeof onStatusChange === 'function') {
                            await onStatusChange(nextStatus);
                        }
                    }
                });
                left.appendChild(statusControl);
            }

            const chip = createIdChip(manageId);
            chip.classList.add('text-xs');
            summary.append(left, chip);
            return summary;
        };

        const makeTaskItem = (task, onStatusChange = null) => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-surface-dark border border-border-dark text-white';

            const left = document.createElement('div');
            left.className = 'flex items-center gap-2';
            const ic = document.createElement('span');
            ic.className = 'material-symbols-outlined text-text-muted text-[18px]';
            ic.textContent = 'check_circle';
            const name = document.createElement('span');
            name.className = 'text-sm';
            name.textContent = task.name || 'Tarea';

            const statusControl = createStatusControl({
                status: task.status,
                onChange: async (nextStatus) => {
                    if (typeof onStatusChange === 'function') {
                        await onStatusChange(nextStatus);
                    }
                }
            });
            left.append(ic, name, statusControl);

            const chip = createIdChip(task.manageId);
            chip.classList.add('text-[11px]');
            row.append(left, chip);
            return row;
        };

        sortedClients.forEach(client => {
            const clientDetails = document.createElement('details');
            clientDetails.className = 'bg-surface-dark border border-border-dark rounded-lg';
            const clientManage = client.manageId || '';
            clientDetails.dataset.manageId = client.manageId || `client:${client.id}`;
            clientDetails.appendChild(makeSummary('folder_open', client.name || 'Cliente', clientManage));

            const clientContent = document.createElement('div');
            clientContent.className = 'pl-5 pr-3 pb-3 flex flex-col gap-2';

            const projects = client.projects || {};
            const projectArray = Object.keys(projects).map(id => ({ id, ...projects[id] }));
            projectArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            if (projectArray.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'text-text-muted text-xs px-1';
                empty.textContent = 'Sin proyectos.';
                clientContent.appendChild(empty);
            } else {
                projectArray.forEach(proj => {
                    const projDetails = document.createElement('details');
                    projDetails.className = 'border border-border-dark/70 rounded-lg';
                    projDetails.dataset.manageId = proj.manageId || `project:${client.id}:${proj.id}`;
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
                                renderProjects(client.id);
                            }
                        }
                    ));

                    const projContent = document.createElement('div');
                    projContent.className = 'pl-5 pr-2 pb-2 flex flex-col gap-2';

                    // Tareas sin producto
                    const projTasks = proj.tasks || {};
                    const projTaskArray = Object.keys(projTasks).map(id => ({ id, ...projTasks[id] }));
                    projTaskArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    if (projTaskArray.length) {
                        const taskLabel = document.createElement('p');
                        taskLabel.className = 'text-text-muted text-xs px-1';
                        taskLabel.textContent = 'Tareas (sin producto)';
                        projContent.appendChild(taskLabel);
                        projTaskArray.forEach(t => {
                            const taskPath = `clients/${client.id}/projects/${proj.id}/tasks/${t.id}`;
                            const taskBlock = document.createElement('div');
                            taskBlock.className = 'flex flex-col gap-1';
                            taskBlock.appendChild(makeTaskItem(t, async (nextStatus) => {
                                await updateStatusAtPath(taskPath, nextStatus);
                                t.status = nextStatus;
                                if (projTasks?.[t.id]) projTasks[t.id].status = nextStatus;
                                if (selectedClientId === client.id && selectedProjectId === proj.id && !selectedProductId) {
                                    renderTasks(client.id, proj.id, null);
                                }
                            }));
                            const subtasks = t.subtasks || {};
                            const subArray = Object.keys(subtasks).map(id => ({ id, ...subtasks[id] }));
                            subArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                            if (subArray.length) {
                                const subList = document.createElement('div');
                                subList.className = 'pl-5 flex flex-col gap-1';
                                subArray.forEach(sub => {
                                    const row = document.createElement('div');
                                    row.className = 'flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-surface-darker border border-border-dark text-white';
                                    const l = document.createElement('div');
                                    l.className = 'flex items-center gap-2';
                                    const ic = document.createElement('span');
                                    ic.className = 'material-symbols-outlined text-text-muted text-[16px]';
                                    ic.textContent = 'subdirectory_arrow_right';
                                         const name = document.createElement('span');
                                         name.className = 'text-sm';
                                         name.textContent = sub.name || 'Subtarea';
                                     const subPath = `${taskPath}/subtasks/${sub.id}`;
                                     const statusControl = createStatusControl({
                                         status: sub.status,
                                         onChange: async (nextStatus) => {
                                             await updateStatusAtPath(subPath, nextStatus);
                                             sub.status = nextStatus;
                                             if (subtasks?.[sub.id]) subtasks[sub.id].status = nextStatus;
                                             if (
                                                 selectedClientId === client.id &&
                                                 selectedProjectId === proj.id &&
                                                 !selectedProductId &&
                                                 selectedTaskId === t.id
                                             ) {
                                                 renderSubtasks(client.id, proj.id, null, t.id);
                                             }
                                         }
                                     });
                                     l.append(ic, name, statusControl);
                                    const chip = createIdChip(sub.manageId);
                                    chip.classList.add('text-[11px]');
                                    row.append(l, chip);
                                    subList.appendChild(row);
                                });
                                taskBlock.appendChild(subList);
                            }
                            projContent.appendChild(taskBlock);
                        });
                    }

                    // Productos
                    const products = proj.products || {};
                    const productArray = Object.keys(products).map(id => ({ id, ...products[id] }));
                    productArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                    if (productArray.length === 0 && projTaskArray.length === 0) {
                        const emptyP = document.createElement('p');
                        emptyP.className = 'text-text-muted text-xs px-1';
                        emptyP.textContent = 'Sin productos ni tareas.';
                        projContent.appendChild(emptyP);
                    } else {
                        productArray.forEach(prod => {
                            const productBasePath = `clients/${client.id}/projects/${proj.id}/products/${prod.id}`;
                            const prodDetails = document.createElement('details');
                            prodDetails.className = 'border border-border-dark/60 rounded-lg';
                            prodDetails.dataset.manageId = prod.manageId || `product:${client.id}:${proj.id}:${prod.id}`;
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
                                        renderProducts(client.id, proj.id);
                                    }
                                }
                            ));

                            const prodContent = document.createElement('div');
                            prodContent.className = 'pl-5 pr-2 pb-2 flex flex-col gap-1';

                            const prodTasks = prod.tasks || {};
                            const prodTaskArray = Object.keys(prodTasks).map(id => ({ id, ...prodTasks[id] }));
                            prodTaskArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
                                    taskBlock.appendChild(makeTaskItem(t, async (nextStatus) => {
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
                                    }));
                                    const subtasks = t.subtasks || {};
                                    const subArray = Object.keys(subtasks).map(id => ({ id, ...subtasks[id] }));
                                    subArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                                    if (subArray.length) {
                                        const subList = document.createElement('div');
                                        subList.className = 'pl-5 flex flex-col gap-1';
                                        subArray.forEach(sub => {
                                            const row = document.createElement('div');
                                            row.className = 'flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-surface-darker border border-border-dark text-white';
                                            const l = document.createElement('div');
                                            l.className = 'flex items-center gap-2';
                                            const ic = document.createElement('span');
                                            ic.className = 'material-symbols-outlined text-text-muted text-[16px]';
                                            ic.textContent = 'subdirectory_arrow_right';
                                            const name = document.createElement('span');
                                            name.className = 'text-sm';
                                            name.textContent = sub.name || 'Subtarea';
                                            const subPath = `${taskPath}/subtasks/${sub.id}`;
                                            const statusControl = createStatusControl({
                                                status: sub.status,
                                                onChange: async (nextStatus) => {
                                                    await updateStatusAtPath(subPath, nextStatus);
                                                    sub.status = nextStatus;
                                                    if (subtasks?.[sub.id]) subtasks[sub.id].status = nextStatus;
                                                    if (
                                                        selectedClientId === client.id &&
                                                        selectedProjectId === proj.id &&
                                                        selectedProductId === prod.id &&
                                                        selectedTaskId === t.id
                                                    ) {
                                                        renderSubtasks(client.id, proj.id, prod.id, t.id);
                                                    }
                                                }
                                            });
                                            l.append(ic, name, statusControl);
                                            const chip = createIdChip(sub.manageId);
                                            chip.classList.add('text-[11px]');
                                            row.append(l, chip);
                                            subList.appendChild(row);
                                        });
                                        taskBlock.appendChild(subList);
                                    }
                                    prodContent.appendChild(taskBlock);
                                });
                            }

                            prodDetails.appendChild(prodContent);
                            projContent.appendChild(prodDetails);
                        });
                    }

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

        const taskArray = Object.keys(tasks || {}).map(key => ({ id: key, ...tasks[key] }));

        if (taskArray.length === 0) {
            selectedTaskId = null;
            selectedSubtaskId = null;
            noTasksMessage.textContent = productId ? 'No hay tareas para este producto.' : 'No hay tareas para este proyecto.';
            noTasksMessage.classList.remove('hidden');
            return;
        }

        noTasksMessage.classList.add('hidden');
        taskArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        taskArray.forEach(task => {
            const row = document.createElement('div');
            row.className = 'group flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border-dark bg-surface-darker text-white hover:bg-white/5 transition-colors';
            row.dataset.taskId = task.id;

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'flex items-center gap-3 flex-1 min-w-0 text-left';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined text-text-muted';
            icon.textContent = 'check_circle';

            const nameWrapper = document.createElement('div');
            nameWrapper.className = 'flex items-center gap-2 min-w-0';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm font-medium truncate';
            nameSpan.textContent = task.name;

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
            const idTag = createIdChip(task.manageId);

            nameWrapper.append(nameSpan, statusControl, idTag);
            selectButton.append(icon, nameWrapper);
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
                        await update(ref(database, taskPath), { name: nextName });
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
                    const confirmed = confirm(`¿Eliminar la tarea \"${task.name}\"?`);
                    if (!confirmed) return;

                    const taskPath = productId
                        ? `clients/${clientId}/projects/${projectId}/products/${productId}/tasks/${task.id}`
                        : `clients/${clientId}/projects/${projectId}/tasks/${task.id}`;

                    try {
                        await remove(ref(database, taskPath));
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

            row.append(selectButton, actions);
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
            showEl(backToClientsBtn);
            hideEl(productListSection);
            showEl(projectListSection);
            hideEl(clientListSection);
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
            showEl(backToClientsBtn);
            hideEl(productListSection);
            showEl(projectListSection);
            hideEl(clientListSection);
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
            if (projectDetailSub) projectDetailSub.textContent = product ? 'Tareas del producto.' : 'Tareas del proyecto (sin producto).';
        } else {
            if (projectDetailName) projectDetailName.textContent = project.name;
            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto (sin producto).';
        }

        showEl(productListSection);
        hideEl(projectListSection);
        hideEl(clientListSection);
    };

    // Fetch clients from RTDB
    const fetchClients = () => {
        if (!clientsRef) return;
        noClientsMessage.textContent = 'Cargando clientes...';
        noClientsMessage.classList.remove('hidden');
        clientListNav.innerHTML = '';

        onValue(clientsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                allClients = Object.keys(data).map(key => ({ id: key, ...data[key] }));
            } else {
                allClients = [];
            }
            syncSelectionAfterDataChange();
            renderClients();
            if (selectedClientId) {
                if (selectedProjectId) {
                    renderProducts(selectedClientId, selectedProjectId);
                    renderTasks(selectedClientId, selectedProjectId, selectedProductId);
                } else {
                    renderProjects(selectedClientId);
                }
            }
            renderTree();
        }, (error) => {
            console.error("Error fetching clients: ", error);
            noClientsMessage.textContent = `Error: ${error.message}`;
            noClientsMessage.classList.remove('hidden');
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
            const manageId = formatManageId(managePrefix, 1);
            const newClientRef = push(ref(database, 'clients'));
            const clientData = {
                name: companyName,
                createdAt: new Date().toISOString(),
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
            const projectData = {
                name: projectName,
                status: 'Pendiente',
                createdAt: new Date().toISOString(),
                projectId: newProjectRef.key,
                manageId
            };

            await set(newProjectRef, projectData);
            closeProjectModal();
            renderProjects(selectedClientId);
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
        if (!currentUser || !selectedClientId || !selectedProjectId) {
            alert("Selecciona un proyecto e inicia sesión para añadir productos.");
            return;
        }

        try {
            if (saveProductBtn) {
                saveProductBtn.disabled = true;
                saveProductBtn.textContent = "Guardando...";
            }

            const manageId = await allocateNextManageId(selectedClientId);
            const newProductRef = push(ref(database, `clients/${selectedClientId}/projects/${selectedProjectId}/products`));
            const productData = {
                name: productName,
                status: 'Pendiente',
                createdAt: new Date().toISOString(),
                productId: newProductRef.key,
                manageId
            };

            await set(newProductRef, productData);
            closeProductModal();
            renderProducts(selectedClientId, selectedProjectId);
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
        if (!currentUser || !selectedClientId || !selectedProjectId) {
            alert("Selecciona un proyecto e inicia sesión para añadir tareas.");
            return;
        }

        try {
            if (saveTaskBtn) {
                saveTaskBtn.disabled = true;
                saveTaskBtn.textContent = "Guardando...";
            }

            const manageId = await allocateNextManageId(selectedClientId);
            const taskPath = selectedProductId
                ? `clients/${selectedClientId}/projects/${selectedProjectId}/products/${selectedProductId}/tasks`
                : `clients/${selectedClientId}/projects/${selectedProjectId}/tasks`;
            const newTaskRef = push(ref(database, taskPath));
            const taskData = {
                name: taskName,
                status: 'Pendiente',
                createdAt: new Date().toISOString(),
                taskId: newTaskRef.key,
                manageId
            };

            await set(newTaskRef, taskData);
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
            const subtaskData = {
                name: subtaskName,
                status: 'Pendiente',
                createdAt: new Date().toISOString(),
                subtaskId: newSubtaskRef.key,
                manageId
            };

            await set(newSubtaskRef, subtaskData);
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

    // Attach UI listeners once
    const attachListeners = () => {
        if (listenersAttached) return;
        listenersAttached = true;

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

        userMenuToggle?.addEventListener('click', toggleUserMenu);
        document.addEventListener('click', (e) => {
            closeAllActionMenus();
            if (!userMenu || !userMenuToggle) return;
            if (userMenu.contains(e.target) || userMenuToggle.contains(e.target)) return;
            userMenu.classList.add('hidden');
        });
    };

    // Init with user
    const initializeApp = (user) => {
        currentUser = user;
        clientsRef = query(ref(database, 'clients'));
        attachListeners();
        showClientView();
        fetchClients();
    };

    // Cleanup when user logs out
    const cleanup = () => {
        currentUser = null;
        clientsRef = null;
        allClients = [];
        renderClients();
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
