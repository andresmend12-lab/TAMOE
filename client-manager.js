import { auth, database } from './firebase.js';
import { ref, push, onValue, query, orderByChild, equalTo, set } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const clientView = document.getElementById('client-view');
    const projectView = document.getElementById('project-view');
    const addClientBtn = document.getElementById('add-client-btn');
    const clientListNav = document.getElementById('client-list-nav');
    const noClientsMessage = document.getElementById('no-clients-message');
    const backToClientsBtn = document.getElementById('back-to-clients-btn');
    const clientNameHeader = document.getElementById('client-name-header');
    const addClientModal = document.getElementById('add-client-modal');
    const addClientForm = document.getElementById('add-client-form');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelAddClientBtn = document.getElementById('cancel-add-client');
    const companyNameInput = document.getElementById('company-name');
    const saveClientBtn = addClientForm ? addClientForm.querySelector('button[type="submit"]') : null;

    let allClients = [];
    let currentUser = null;
    let clientsRef = null;
    let listenersAttached = false;

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
    };

    const showProjectView = (clientId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        clientNameHeader.textContent = client.name;
        clientView.classList.add('hidden');
        clientView.classList.remove('flex');
        projectView.classList.remove('hidden');
        projectView.classList.add('flex');
    };

    // Modal handling
    const openModal = () => {
        addClientModal.classList.remove('hidden');
        setTimeout(() => companyNameInput.focus(), 50);
    };

    const closeModal = () => {
        addClientModal.classList.add('hidden');
        addClientForm.reset();
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

            const newClientRef = push(ref(database, 'clients'));
            const clientData = {
                name: companyName,
                ownerId: currentUser.uid,
                createdAt: new Date().toISOString(),
                clientId: newClientRef.key
            };

            await set(newClientRef, clientData);
            closeModal();
            // UI updates via onValue listener
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

    // Attach UI listeners once
    const attachListeners = () => {
        if (listenersAttached) return;
        listenersAttached = true;

        if (addClientBtn) {
            addClientBtn.addEventListener('click', () => {
                if (!currentUser) {
                    alert("Debes iniciar sesión para añadir clientes.");
                    return;
                }
                openModal();
            });
        }

        if (addClientForm) addClientForm.addEventListener('submit', handleAddClientSubmit);
        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
        if (cancelAddClientBtn) cancelAddClientBtn.addEventListener('click', closeModal);
        if (addClientModal) addClientModal.addEventListener('click', e => { if (e.target === addClientModal) closeModal(); });
        if (backToClientsBtn) backToClientsBtn.addEventListener('click', showClientView);
    };

    // Init with user
    const initializeApp = (user) => {
        currentUser = user;
        clientsRef = query(ref(database, 'clients'), orderByChild('ownerId'), equalTo(user.uid));
        attachListeners();
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
