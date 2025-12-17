import { auth, database } from './firebase.js';
import { ref, push, onValue, query, set } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const clientView = document.getElementById('client-view');
    const projectView = document.getElementById('project-view');
    const addClientBtn = document.getElementById('add-client-btn');
    const addProjectBtn = document.getElementById('add-project-btn');
    const addProductBtn = document.getElementById('add-product-btn');
    const addTaskBtn = document.getElementById('add-task-btn');
    const clientListNav = document.getElementById('client-list-nav');
    const projectListNav = document.getElementById('project-list-nav');
    const clientListSection = document.getElementById('client-list-section');
    const projectListSection = document.getElementById('project-list-section');
    const noClientsMessage = document.getElementById('no-clients-message');
    const noProjectsMessage = document.getElementById('no-projects-message');
    const backToClientsBtn = document.getElementById('back-to-clients-btn');
    const clientNameHeader = document.getElementById('client-name-header');
    const projectDetail = document.getElementById('project-detail');
    const projectDetailName = document.getElementById('project-detail-name');
    const projectDetailEmpty = document.getElementById('project-detail-empty');

    // Modals & forms
    const addClientModal = document.getElementById('add-client-modal');
    const addProjectModal = document.getElementById('add-project-modal');
    const addProductModal = document.getElementById('add-product-modal');
    const addTaskModal = document.getElementById('add-task-modal');

    const addClientForm = document.getElementById('add-client-form');
    const addProjectForm = document.getElementById('add-project-form');
    const addProductForm = document.getElementById('add-product-form');
    const addTaskForm = document.getElementById('add-task-form');

    const closeModalBtn = document.getElementById('close-modal-btn');
    const closeProjectModalBtn = document.getElementById('close-project-modal-btn');
    const closeProductModalBtn = document.getElementById('close-product-modal-btn');
    const closeTaskModalBtn = document.getElementById('close-task-modal-btn');

    const cancelAddClientBtn = document.getElementById('cancel-add-client');
    const cancelAddProjectBtn = document.getElementById('cancel-add-project');
    const cancelAddProductBtn = document.getElementById('cancel-add-product');
    const cancelAddTaskBtn = document.getElementById('cancel-add-task');

    const companyNameInput = document.getElementById('company-name');
    const projectNameInput = document.getElementById('project-name');
    const productNameInput = document.getElementById('product-name');
    const taskNameInput = document.getElementById('task-name');

    const saveClientBtn = addClientForm ? addClientForm.querySelector('button[type="submit"]') : null;
    const saveProjectBtn = addProjectForm ? addProjectForm.querySelector('button[type="submit"]') : null;
    const saveProductBtn = addProductForm ? addProductForm.querySelector('button[type="submit"]') : null;
    const saveTaskBtn = addTaskForm ? addTaskForm.querySelector('button[type="submit"]') : null;

    let allClients = [];
    let currentUser = null;
    let clientsRef = null;
    let listenersAttached = false;
    let selectedClientId = null;
    let selectedProjectId = null;

    // User dropdown
    const userMenuToggle = document.getElementById('user-menu-toggle');
    const userMenu = document.getElementById('user-menu');
    const toggleUserMenu = () => {
        if (!userMenu) return;
        userMenu.classList.toggle('hidden');
    };

    // helpers to show/hide elements
    const showEl = el => el && el.classList.remove('hidden');
    const hideEl = el => el && el.classList.add('hidden');

    // Render list of clients
    const renderClients = () => {
        clientListNav.innerHTML = '';
        if (allClients.length > 0) {
            noClientsMessage.classList.add('hidden');
            allClients.sort((a, b) => a.name.localeCompare(b.name));
            allClients.forEach(client => {
                const clientLink = document.createElement('a');
                clientLink.href = '#';
                clientLink.className = 'flex items-center gap-3 px-3 py-2 rounded-lg text-text-muted hover:bg-white/5 hover:text-white transition-colors';
                clientLink.setAttribute('data-client-id', client.id);
                clientLink.innerHTML = `
                    <span class="material-symbols-outlined">folder_open</span>
                    <span class="text-sm font-medium">${client.name}</span>
                `;
                clientLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    showProjectView(client.id);
                });
                clientListNav.appendChild(clientLink);
            });
        } else {
            noClientsMessage.textContent = 'No hay clientes.';
            noClientsMessage.classList.remove('hidden');
        }
    };

    // View toggles
    const showClientView = () => {
        projectView.classList.add('hidden');
        projectView.classList.remove('flex');
        clientView.classList.remove('hidden');
        clientView.classList.add('flex');
        hideEl(backToClientsBtn);
        hideEl(addProductBtn);
        resetProjectDetail();
        hideEl(projectListSection);
        showEl(clientListSection);
    };

    const resetProjectDetail = () => {
        selectedProjectId = null;
        if (projectDetail) projectDetail.classList.add('hidden');
        if (projectDetailName) projectDetailName.textContent = 'Selecciona un proyecto';
        if (projectDetailEmpty) projectDetailEmpty.textContent = 'Selecciona un proyecto en la barra lateral.';
    };

    const showProjectView = (clientId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        clientNameHeader.textContent = client.name;
        selectedClientId = clientId;
        renderProjects(clientId);
        resetProjectDetail();
        clientView.classList.add('hidden');
        clientView.classList.remove('flex');
        projectView.classList.remove('hidden');
        projectView.classList.add('flex');
        showEl(backToClientsBtn);
        hideEl(addProductBtn);
        showEl(projectListSection);
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

    // Render projects of selected client
    const renderProjects = (clientId) => {
        if (!projectListNav || !noProjectsMessage) return;
        projectListNav.innerHTML = '';
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
            const item = document.createElement('div');
            item.className = 'flex items-center gap-3 px-3 py-2 rounded-lg text-text-muted hover:bg-white/5 hover:text-white transition-colors cursor-pointer';
            item.innerHTML = `
                <span class="material-symbols-outlined">layers</span>
                <span class="text-sm font-medium">${proj.name}</span>
            `;
            item.addEventListener('click', () => {
                selectedProjectId = proj.id;
                showEl(addProductBtn);
                if (projectDetail) projectDetail.classList.remove('hidden');
                if (projectDetailName) projectDetailName.textContent = proj.name;
                if (projectDetailEmpty) projectDetailEmpty.textContent = 'Puedes crear productos o tareas para este proyecto.';
            });
            projectListNav.appendChild(item);
        });
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
            renderClients();
            if (selectedClientId) {
                renderProjects(selectedClientId);
            }
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
            alert("Debes iniciar sesion para anadir clientes.");
            return;
        }

        try {
            if (saveClientBtn) {
                saveClientBtn.disabled = true;
                saveClientBtn.textContent = "Guardando...";
            }

            const newClientRef = push(ref(database, 'clients'));
            const clientData = {
                name: companyName,
                createdAt: new Date().toISOString(),
                clientId: newClientRef.key
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
            alert("Selecciona un cliente e inicia sesion para anadir proyectos.");
            return;
        }

        try {
            if (saveProjectBtn) {
                saveProjectBtn.disabled = true;
                saveProjectBtn.textContent = "Guardando...";
            }

            const newProjectRef = push(ref(database, `clients/${selectedClientId}/projects`));
            const projectData = {
                name: projectName,
                createdAt: new Date().toISOString(),
                projectId: newProjectRef.key
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
            alert("Selecciona un proyecto e inicia sesion para anadir productos.");
            return;
        }

        try {
            if (saveProductBtn) {
                saveProductBtn.disabled = true;
                saveProductBtn.textContent = "Guardando...";
            }

            const newProductRef = push(ref(database, `clients/${selectedClientId}/projects/${selectedProjectId}/products`));
            const productData = {
                name: productName,
                createdAt: new Date().toISOString(),
                productId: newProductRef.key
            };

            await set(newProductRef, productData);
            closeProductModal();
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
            alert("Selecciona un proyecto e inicia sesion para anadir tareas.");
            return;
        }

        try {
            if (saveTaskBtn) {
                saveTaskBtn.disabled = true;
                saveTaskBtn.textContent = "Guardando...";
            }

            const newTaskRef = push(ref(database, `clients/${selectedClientId}/projects/${selectedProjectId}/tasks`));
            const taskData = {
                name: taskName,
                createdAt: new Date().toISOString(),
                taskId: newTaskRef.key
            };

            await set(newTaskRef, taskData);
            closeTaskModal();
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

    // Attach UI listeners once
    const attachListeners = () => {
        if (listenersAttached) return;
        listenersAttached = true;

        addClientBtn?.addEventListener('click', () => {
            if (!currentUser) {
                alert("Debes iniciar sesion para anadir clientes.");
                return;
            }
            openModal();
        });

        addProjectBtn?.addEventListener('click', () => {
            if (!currentUser) {
                alert("Debes iniciar sesion para anadir proyectos.");
                return;
            }
            openProjectModal();
        });

        addProductBtn?.addEventListener('click', openProductModal);
        addTaskBtn?.addEventListener('click', openTaskModal);

        addClientForm?.addEventListener('submit', handleAddClientSubmit);
        addProjectForm?.addEventListener('submit', handleAddProjectSubmit);
        addProductForm?.addEventListener('submit', handleAddProductSubmit);
        addTaskForm?.addEventListener('submit', handleAddTaskSubmit);

        closeModalBtn?.addEventListener('click', closeModal);
        closeProjectModalBtn?.addEventListener('click', closeProjectModal);
        closeProductModalBtn?.addEventListener('click', closeProductModal);
        closeTaskModalBtn?.addEventListener('click', closeTaskModal);

        cancelAddClientBtn?.addEventListener('click', closeModal);
        cancelAddProjectBtn?.addEventListener('click', closeProjectModal);
        cancelAddProductBtn?.addEventListener('click', closeProductModal);
        cancelAddTaskBtn?.addEventListener('click', closeTaskModal);

        addClientModal?.addEventListener('click', e => { if (e.target === addClientModal) closeModal(); });
        addProjectModal?.addEventListener('click', e => { if (e.target === addProjectModal) closeProjectModal(); });
        addProductModal?.addEventListener('click', e => { if (e.target === addProductModal) closeProductModal(); });
        addTaskModal?.addEventListener('click', e => { if (e.target === addTaskModal) closeTaskModal(); });

        backToClientsBtn?.addEventListener('click', () => {
            resetProjectDetail();
            showClientView();
        });

        userMenuToggle?.addEventListener('click', toggleUserMenu);
        document.addEventListener('click', (e) => {
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
        fetchClients();
    };

    // Cleanup when user logs out
    const cleanup = () => {
        currentUser = null;
        clientsRef = null;
        allClients = [];
        renderClients();
        noClientsMessage.textContent = "Por favor, inicie sesion.";
        noClientsMessage.classList.remove('hidden');
        resetProjectDetail();
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
