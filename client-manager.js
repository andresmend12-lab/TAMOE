import { app } from './firebase-config.js';
import { getDatabase, ref, push, onValue, query, orderByChild, equalTo, set } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);
    const db = getDatabase(app);

    // --- DOM Elements ---
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

    let allClients = [];
    let currentUser = null;
    let clientsRef = null;

    // --- UI Rendering ---
    const renderClients = () => {
        clientListNav.innerHTML = ''; // Clear the list
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

    // --- View Management ---
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

    // --- Modal Management ---
    const openModal = () => {
        addClientModal.classList.remove('hidden');
        setTimeout(() => companyNameInput.focus(), 50);
    };

    const closeModal = () => {
        addClientModal.classList.add('hidden');
        addClientForm.reset();
    };

    // --- Data Fetching (Realtime DB) ---
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

    // --- Form Submission (Realtime DB) ---
    const handleAddClientSubmit = async (e) => {
        e.preventDefault();
        const companyName = companyNameInput.value.trim();
        if (companyName && currentUser) {
            try {
                const newClientRef = push(ref(db, 'clients'));
                await set(newClientRef, {
                    name: companyName,
                    ownerId: currentUser.uid,
                    createdAt: new Date().toISOString()
                });
                closeModal();
                // The onValue listener will automatically update the UI
            } catch (error) {
                console.error("Error adding client: ", error);
                alert("Hubo un error al guardar el cliente.");
            }
        }
    };

    // --- Initialization ---
    const initializeApp = (user) => {
        currentUser = user;
        clientsRef = query(ref(db, 'clients'), orderByChild('ownerId'), equalTo(user.uid));
        
        // Attach event listeners
        addClientBtn.addEventListener('click', openModal);
        addClientForm.addEventListener('submit', handleAddClientSubmit);
        closeModalBtn.addEventListener('click', closeModal);
        cancelAddClientBtn.addEventListener('click', closeModal);
        addClientModal.addEventListener('click', e => { if (e.target === addClientModal) closeModal(); });
        backToClientsBtn.addEventListener('click', showClientView);
        
        fetchClients();
    };

    const cleanup = () => {
        currentUser = null;
        clientsRef = null;
        allClients = [];
        renderClients();
        noClientsMessage.textContent = "Por favor, inicie sesión.";
        noClientsMessage.classList.remove('hidden');
        // Detach listeners if necessary, though onAuthStateChanged handles re-initialization
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            initializeApp(user);
        } else {
            cleanup();
        }
    });
});
