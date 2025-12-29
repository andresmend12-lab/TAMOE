import { auth, database } from './firebase.js';
import { ref, push, onValue, query, set, update, remove, runTransaction, serverTimestamp, get } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
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
    const treeExpandToggle = document.getElementById('tree-expand-toggle');
    const treeExpandIcon = document.getElementById('tree-expand-icon');
    const treeExpandLabel = document.getElementById('tree-expand-label');
    const treeView = document.getElementById('tree-view');
    const clientSearchInput = document.getElementById('client-search-input');
    const tamoeHomeButton = document.getElementById('tamoe-home');
    const activityPathEls = Array.from(document.querySelectorAll('[data-activity-path]'));
    const statusMetricActiveProjects = document.getElementById('status-metric-active-projects');
    const statusMetricPendingTasks = document.getElementById('status-metric-pending-tasks');
    const statusMetricInProgressTasks = document.getElementById('status-metric-inprogress-tasks');
    const statusMetricDoneTasks = document.getElementById('status-metric-done-tasks');
    const statusRecentProjectsBody = document.getElementById('status-recent-projects');
    const statusScopeTitle = document.getElementById('status-scope-title');
    const statusScopeSubtitle = document.getElementById('status-scope-subtitle');
    const statusRecentTitle = document.getElementById('status-recent-title');
    const statusActivityHeader = document.getElementById('status-activity-header');
    const statusMetricActiveLabel = document.getElementById('status-metric-active-label');

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
    let clientSearchQuery = '';
    let clientsLoading = false;

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
            !statusMetricActiveProjects &&
            !statusRecentProjectsBody &&
            !statusScopeTitle &&
            !statusScopeSubtitle
        ) {
            return;
        }

        const safeClients = Array.isArray(allClients) ? allClients : [];
        const selectionClient = selectedClientId
            ? safeClients.find(c => c.id === selectedClientId)
            : null;
        const selectionProject = selectionClient?.projects?.[selectedProjectId] || null;
        const selectionProduct = selectionProject && selectedProductId
            ? selectionProject.products?.[selectedProductId]
            : null;

        const scopeType = selectionProduct
            ? 'product'
            : selectionProject
                ? 'project'
                : selectionClient
                    ? 'client'
                    : 'all';

        const scopeName = scopeType === 'product'
            ? (selectionProduct?.name || selectedProductId || 'Producto')
            : scopeType === 'project'
                ? (selectionProject?.name || selectedProjectId || 'Proyecto')
                : scopeType === 'client'
                    ? (selectionClient?.name || selectedClientId || 'Cliente')
                    : 'Todos los clientes';

        const scopeTitle = scopeType === 'product'
            ? 'Estado del producto'
            : scopeType === 'project'
                ? 'Estado del proyecto'
                : 'Estado de proyectos';

        const scopeSubtitle = scopeType === 'all'
            ? 'Resumen general de clientes, proyectos y tareas.'
            : scopeType === 'client'
                ? `Resumen del cliente ${scopeName}.`
                : scopeType === 'project'
                    ? `Resumen del proyecto ${scopeName}.`
                    : `Resumen del producto ${scopeName}.`;

        const recentTitle = scopeType === 'product'
            ? 'Producto seleccionado'
            : scopeType === 'project'
                ? 'Proyecto seleccionado'
                : 'Proyectos recientes';

        const activityHeader = scopeType === 'product' ? 'Producto' : 'Proyecto';
        const activeLabel = scopeType === 'product' ? 'Productos activos' : 'Proyectos activos';

        if (statusScopeTitle) statusScopeTitle.textContent = scopeTitle;
        if (statusScopeSubtitle) statusScopeSubtitle.textContent = scopeSubtitle;
        if (statusRecentTitle) statusRecentTitle.textContent = recentTitle;
        if (statusActivityHeader) statusActivityHeader.textContent = activityHeader;
        if (statusMetricActiveLabel) statusMetricActiveLabel.textContent = activeLabel;

        const activityRows = [];
        let activeItems = 0;
        let pendingTasks = 0;
        let inProgressTasks = 0;
        let doneTasks = 0;

        const getTasksFromProject = (project) => {
            const tasks = [];
            const projectTasks = project?.tasks || {};
            for (const [taskId, task] of Object.entries(projectTasks)) {
                tasks.push({ id: taskId, ...task });
            }
            const products = project?.products || {};
            for (const product of Object.values(products)) {
                const productTasks = product?.tasks || {};
                for (const [taskId, task] of Object.entries(productTasks)) {
                    tasks.push({ id: taskId, ...task });
                }
            }
            return tasks;
        };

        const getTasksFromProduct = (product) => {
            const tasks = [];
            const productTasks = product?.tasks || {};
            for (const [taskId, task] of Object.entries(productTasks)) {
                tasks.push({ id: taskId, ...task });
            }
            return tasks;
        };

        const countTasks = (tasks) => {
            let total = 0;
            let done = 0;
            for (const task of tasks) {
                const taskStatus = normalizeStatus(task?.status);
                total += 1;
                if (taskStatus === 'Finalizado') done += 1;
                else if (taskStatus === 'En proceso') inProgressTasks += 1;
                else pendingTasks += 1;
            }
            doneTasks += done;
            return { total, done };
        };

        if (scopeType === 'product') {
            if (selectionClient && selectionProject && selectionProduct) {
                const status = normalizeStatus(selectionProduct?.status);
                if (status !== 'Finalizado') activeItems += 1;
                const tasks = getTasksFromProduct(selectionProduct);
                const { total, done } = countTasks(tasks);
                const createdAt = selectionProduct?.createdAt || '';

                activityRows.push({
                    clientName: selectionClient?.name || selectionClient?.id || '',
                    activityName: String(selectionProduct?.name || selectedProductId || 'Producto'),
                    status,
                    manageId: selectionProduct?.manageId || '',
                    createdAt,
                    progress: total ? Math.round((done / total) * 100) : 0,
                    path: `clients/${selectionClient.id}/projects/${selectionProjectId}/products/${selectedProductId}`,
                });
            }
        } else {
            const clientsToScan = selectionClient ? [selectionClient] : safeClients;
            for (const client of clientsToScan) {
                if (!client) continue;
                const clientName = client?.name || client?.id || '';
                const projects = client?.projects || {};
                const projectEntries = scopeType === 'project' && selectedProjectId
                    ? [[selectedProjectId, projects?.[selectedProjectId]]]
                    : Object.entries(projects);

                for (const [projectId, project] of projectEntries) {
                    if (!project) continue;
                    const status = normalizeStatus(project?.status);
                    if (status !== 'Finalizado') activeItems += 1;

                    const tasks = getTasksFromProject(project);
                    const { total, done } = countTasks(tasks);
                    const createdAt = project?.createdAt || '';

                    activityRows.push({
                        clientName,
                        activityName: String(project?.name || projectId || ''),
                        status,
                        manageId: project?.manageId || '',
                        createdAt,
                        progress: total ? Math.round((done / total) * 100) : 0,
                        path: `clients/${client.id}/projects/${projectId}`,
                    });
                }
            }
        }

        if (statusMetricActiveProjects) statusMetricActiveProjects.textContent = String(activeItems);
        if (statusMetricPendingTasks) statusMetricPendingTasks.textContent = String(pendingTasks);
        if (statusMetricInProgressTasks) statusMetricInProgressTasks.textContent = String(inProgressTasks);
        if (statusMetricDoneTasks) statusMetricDoneTasks.textContent = String(doneTasks);

        if (!statusRecentProjectsBody) return;

        const parseDate = (value) => {
            const t = Date.parse(String(value || ''));
            return Number.isFinite(t) ? t : 0;
        };

        const sorted = activityRows
            .slice()
            .sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt) || String(a.activityName || '').localeCompare(String(b.activityName || '')));

        statusRecentProjectsBody.innerHTML = '';

        if (!sorted.length) {
            const tr = document.createElement('tr');
            const emptyLabel = scopeType === 'product' ? 'No hay productos.' : 'No hay proyectos.';
            tr.innerHTML = `<td class="p-4 text-text-muted text-sm" colspan="4">${emptyLabel}</td>`;
            statusRecentProjectsBody.appendChild(tr);
            return;
        }

        const top = sorted.slice(0, 8);
        for (const row of top) {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-white/5 transition-colors';

            const nameWrap = document.createElement('span');
            nameWrap.className = 'inline-flex items-baseline gap-1 min-w-0';

            const activityLabel = document.createElement(row.manageId ? 'a' : 'span');
            activityLabel.className = row.manageId
                ? 'text-gray-900 dark:text-white font-semibold hover:underline truncate'
                : 'text-gray-900 dark:text-white font-semibold truncate';
            activityLabel.textContent = row.activityName;
            if (row.manageId) {
                activityLabel.href = `/${encodeURIComponent(row.manageId)}`;
                activityLabel.target = '_blank';
                activityLabel.rel = 'noopener';
            }
            nameWrap.appendChild(activityLabel);

            if (row.manageId) {
                const idTag = createIdChip(row.manageId);
                idTag.classList.add('text-[11px]', 'font-mono');
                nameWrap.appendChild(idTag);
            }

            tr.innerHTML = `
                <td class="p-4"></td>
                <td class="p-4 text-text-muted text-sm"></td>
                <td class="p-4">
                    <div class="flex flex-col gap-1 w-32">
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-900 dark:text-white font-medium">${row.progress}%</span>
                        </div>
                        <div class="h-1.5 w-full bg-gray-200 dark:bg-background-dark rounded-full overflow-hidden">
                            <div class="h-full bg-primary rounded-full" style="width: ${row.progress}%"></div>
                        </div>
                    </div>
                </td>
                <td class="p-4"></td>
            `;

            tr.children[0].appendChild(nameWrap);
            tr.children[1].textContent = row.clientName || '-';

            const statusCell = tr.children[3];
            if (row.path) {
                const statusControl = createStatusControl({
                    status: row.status,
                    onChange: async (nextStatus) => {
                        await updateStatusAtPath(row.path, nextStatus);
                        // Re-render relevant parts of the UI
                        renderStatusDashboard();
                        renderTree();
                    }
                });
                statusCell.appendChild(statusControl);
            } else {
                const statusStyle = STATUS_STYLES[row.status] || STATUS_STYLES['Pendiente'];
                statusCell.innerHTML = `<span class="status-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-normal border ${statusStyle}">${row.status}</span>`;
            }

            statusRecentProjectsBody.appendChild(tr);
        }
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

    const sendNotification = async (targetUidValue, titleValue, taskNameValue) => {
        const targetUid = String(targetUidValue || '').trim();
        if (!targetUid) return;
        const title = String(titleValue || '').trim() || 'Notificación';
        const taskName = String(taskNameValue || '').trim();
        const fromUid = currentUser?.uid || '';

        try {
            await push(ref(database, `notifications/${targetUid}`), {
                title,
                taskName,
                fromUid,
                fromName: getCurrentActorName(),
                read: false,
                createdAt: serverTimestamp(),
            });
        } catch (error) {
            console.warn('No se pudo enviar la notificación:', error);
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
        await update(ref(database, path), { status: normalized });

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
            executeAutomations('activityStatusChanged', {
                path: path,
                type: parsed.type,
                data: itemBefore,
                oldStatus: prevStatus,
                newStatus: normalized
            });
        }
    };

    const updateAssigneeAtPath = async (path, nextUid) => {
        if (!currentUser) {
            alert("Debes iniciar sesi▋ para asignar tareas.");
            return;
        }
        const parsed = parseClientPath(path);
        const itemBefore = parsed ? getItemFromState(parsed) : null;
        const prevUid = String(itemBefore?.assigneeUid || '').trim();
        const uid = String(nextUid || '').trim();
        await update(ref(database, path), { assigneeUid: uid });

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
            await sendNotification(uid, 'Nueva asignación', itemName);
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

    // ManageId helpers (per client prefix + counter)
    const stripDiacritics = (value) => {
        if (typeof value !== 'string') return '';
        return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
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
                title: 'Inicia sesi\u00F3n',
                description: 'Inicia sesi\u00F3n para ver tus clientes.',
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
        const sortedClients = [...visibleClients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const makeChevron = (isOpen) => {
            const chevron = document.createElement('span');
            chevron.className = 'material-symbols-outlined text-[18px] text-text-muted dark:text-white';
            chevron.textContent = isOpen ? 'expand_more' : 'chevron_right';
            return chevron;
        };

        const makeSidebarRow = ({ icon, label, manageId, active = false, indentClass = '', chevron = null }) => {
            const row = document.createElement('div');
            row.className = `group flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border-dark/60 bg-white/70 dark:bg-surface-dark/70 text-text-muted dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors ${indentClass}`;
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
            button.className = `flex items-center gap-2 w-full px-3 py-2 rounded-lg text-text-muted dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors border border-dashed border-border-dark/70 ${indentClass}`;
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
            clientDetails.className = 'sidebar-tree-box border border-border-dark/70 rounded-lg bg-white/80 dark:bg-surface-dark/70 p-1';
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
            clientChildren.className = 'pl-3 pt-2 flex flex-col gap-2';

            const projects = client?.projects || {};
            const projectArray = Object.keys(projects || {}).map(id => ({ id, ...projects[id] }));
            projectArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
                    projectDetails.className = 'sidebar-tree-box border border-border-dark/60 rounded-lg bg-white/70 dark:bg-surface-dark/60 p-1';
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
                    projectChildren.className = 'pl-3 pt-2 flex flex-col gap-2';

                    const products = proj?.products || {};
                    const productArray = Object.keys(products || {}).map(id => ({ id, ...products[id] }));
                    productArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
                                            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto (sin producto).';
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
                : 'Tareas del proyecto (sin producto).';
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
        const client = allClients.find(c => c.id === selectedClientId);
        const project = client?.projects?.[selectedProjectId];
        const hasProducts = !!(project && Object.keys(project.products || {}).length);
        if (hasProducts && !selectedProductId) {
            alert('Selecciona un producto para crear tareas.');
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
                            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto (sin producto).';
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
                title: 'Inicia sesi\u00F3n',
                description: 'Inicia sesi\u00F3n para ver tus clientes.',
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
        const clientsToRender = [...baseClients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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

        const makeSummary = (icon, name, manageId, status = null, onStatusChange = null, progressInfo = null, depth = 0, kind = '') => {
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
                const subtasks = Object.entries(task?.subtasks || {}).filter(([, sub]) => sub);
                if (!subtasks.length) {
                    const empty = document.createElement('p');
                    empty.className = 'text-text-muted text-sm';
                    empty.textContent = 'No hay elementos.';
                    list.appendChild(empty);
                    return;
                }
                subtasks.forEach(([subId, sub]) => {
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
            const projectArray = selectionProjectId
                ? rawProjectArray.filter(p => p.id === selectionProjectId)
                : rawProjectArray;
            projectArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
                    const projTaskArray = Object.keys(projTasks).map(id => ({ id, ...projTasks[id] }));
                    projTaskArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    if (!selectionProductId && projTaskArray.length) {
                        const taskLabel = document.createElement('p');
                        taskLabel.className = 'text-text-muted text-xs px-1';
                        taskLabel.textContent = 'Tareas (sin producto)';
                        projContent.appendChild(taskLabel);
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
                    const productArray = selectionProductId
                        ? rawProductArray.filter(p => p.id === selectionProductId)
                        : rawProductArray;
                    productArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
                                        selectSidebarProduct(client.id, proj.id, prod.id);
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
                                showProductView(client.id, proj.id);
                                openProductModal();
                            }
                        }
                    ];
                    if (!hasProducts) {
                        projectActions.push({
                            label: 'Crear tarea',
                            icon: 'check_circle',
                            onClick: () => {
                                showProductView(client.id, proj.id);
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
            if (projectDetailSub) projectDetailSub.textContent = product ? 'Tareas del producto.' : 'Tareas del proyecto (sin producto).';
        } else {
            if (projectDetailName) projectDetailName.textContent = project.name;
            if (projectDetailSub) projectDetailSub.textContent = 'Tareas del proyecto (sin producto).';
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
            if (data) {
                allClients = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                // Normalize nested RTDB maps (extra push levels) before rendering.
                allClients = normalizeClientData(allClients);
            } else {
                allClients = [];
            }
            syncSelectionAfterDataChange();
            renderClients();
            renderTree();
            renderStatusDashboard();
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
            
            await executeAutomations('activityCreated', {
                path: `clients/${selectedClientId}/projects/${newProjectRef.key}`,
                type: 'project',
                data: projectData
            });

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
            
            await executeAutomations('activityCreated', {
                path: `clients/${selectedClientId}/projects/${selectedProjectId}/products/${newProductRef.key}`,
                type: 'product',
                data: productData
            });

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
                assigneeUid: '',
                createdAt: new Date().toISOString(),
                taskId: newTaskRef.key,
                manageId
            };

            await set(newTaskRef, taskData);
            
            await executeAutomations('activityCreated', {
                path: taskPath + `/${newTaskRef.key}`,
                type: 'task',
                data: taskData
            });

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
                assigneeUid: '',
                createdAt: new Date().toISOString(),
                subtaskId: newSubtaskRef.key,
                manageId
            };

            await set(newSubtaskRef, subtaskData);
            
            await executeAutomations('activityCreated', {
                path: subtaskPath + `/${newSubtaskRef.key}`,
                type: 'subtask',
                data: subtaskData
            });

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

    const executeAutomations = async (eventType, eventData) => {
        console.log('Executing automations for', eventType, eventData);
        const automationsRef = ref(database, 'automations');
        const snapshot = await get(automationsRef);
        if (!snapshot.exists()) {
            return;
        }

        const allAutomations = snapshot.val();
        for (const automationId in allAutomations) {
            const automation = { id: automationId, ...allAutomations[automationId] };

            if (!automation.enabled) {
                continue;
            }

            const isInScope = isActivityInScope(eventData.path, automation.scope);
            if (!isInScope) {
                continue;
            }

            for (const trigger of automation.triggers) {
                let triggerMet = false;
                if (eventType === 'activityCreated' && trigger.triggerType === 'created' && trigger.activityType.toLowerCase() === eventData.type.toLowerCase()) {
                    triggerMet = true;
                } else if (eventType === 'activityStatusChanged' && trigger.triggerType === 'statusChange' && trigger.activityType.toLowerCase() === eventData.type.toLowerCase()) {
                    if (trigger.fromState.toLowerCase() === eventData.oldStatus.toLowerCase() && trigger.toState.toLowerCase() === eventData.newStatus.toLowerCase()) {
                        triggerMet = true;
                    }
                }
                
                if (triggerMet) {
                    console.log('Trigger met for automation', automation.name);
                    for (const action of automation.actions) {
                        executeAction(action, eventData, automation);
                    }
                    // Stop checking other triggers for this automation
                    break;
                }
            }
        }
    };

    const isActivityInScope = (activityPath, scope) => {
        if (!scope || !scope.client) {
            return false; // Invalid scope
        }

        const pathParts = parseClientPath(activityPath);
        if (!pathParts) {
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
        console.log('Executing action', action.type, 'for event', eventData);
        if (action.type.startsWith('createChild_')) {
            await executeCreateChildAction(action, eventData, automation);
        } else if (action.type === 'notify') {
            console.log('Notify action needs to be implemented');
        }
    };

    const executeCreateChildAction = async (action, eventData, automation) => {
        const childType = action.type.split('_')[1]; // e.g., 'Product', 'Task', 'Subtask'
        const parentPath = eventData.path;
        const parentData = eventData.data;

        let childName = `New ${childType}`;
        
        let childPath;
        if (childType.toLowerCase() === 'product') {
            childPath = `${parentPath}/products`;
        } else if (childType.toLowerCase() === 'task') {
            childPath = `${parentPath}/tasks`;
        } else if (childType.toLowerCase() === 'subtask') {
            childPath = `${parentPath}/subtasks`;
        } else {
            console.error('Unknown child type for creation:', childType);
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
            if (childType.toLowerCase() === 'product') childData.productId = newChildRef.key;
            if (childType.toLowerCase() === 'task') childData.taskId = newChildRef.key;
            if (childType.toLowerCase() === 'subtask') childData.subtaskId = newChildRef.key;

            await set(newChildRef, childData);
            console.log(`Created new ${childType} at ${childPath}`);
            
            await logActivity(
                pathParts.clientId,
                `Automatización '${automation.name}' creó ${childType.toLowerCase()} "${childName}" para ${pathParts.type} "${parentData.name}".`,
                { action: 'automation_create_child', path: parentPath, entityType: childType.toLowerCase() }
            );

        } catch (error) {
            console.error(`Failed to create child ${childType}:`, error);
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

        clientSearchInput?.addEventListener('input', (event) => {
            clientSearchQuery = String(event?.target?.value || '');
            renderClients();
            renderTree();
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
    };

    // Init with user
    const initializeApp = (user) => {
        currentUser = user;
        if (!database) {
            console.error("Database not initialized. Check firebase.js exports.");
            return;
        }
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
