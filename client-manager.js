import { app } from './firebase-config.js';
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);
    const db = getFirestore(app);

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

    // --- UI Rendering ---
    const renderClients = () => {
        clientListNav.innerHTML = ''; // Clear the list completely
        if (allClients.length === 0) {
            noClientsMessage.textContent = 'No hay clientes.';
            noClientsMessage.classList.remove('hidden');
            clientListNav.appendChild(noClientsMessage);
        } else {
            noClientsMessage.classList.add('hidden');
            allClients.sort((a, b) => a.name.localeCompare(b.name)); // Sort clients alphabetically
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
        }
    };

    // --- View Management ---
    const showClientView = () => {
        projectView.classList.add('hidden', 'flex');
        clientView.classList.remove('hidden');
        clientView.classList.add('flex');
    };

    const showProjectView = (clientId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;
        clientNameHeader.textContent = client.name;
        // Future: fetchAndRenderProjects(client.id);
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

    // --- Core Logic ---
    const initialize = (user) => {
        // Fetch initial data
        const fetchClients = async () => {
            noClientsMessage.textContent = 'Cargando clientes...';
            noClientsMessage.classList.remove('hidden');
            clientListNav.innerHTML = '';
            clientListNav.appendChild(noClientsMessage);

            const clientsRef = collection(db, "clients");
            const q = query(clientsRef, where("ownerId", "==", user.uid));
            try {
                const querySnapshot = await getDocs(q);
                allClients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderClients();
            } catch (error) {
                console.error("Error fetching clients: ", error);
                noClientsMessage.textContent = 'Error al cargar clientes.';
            }
        };

        // Set up event listeners that require a user
        addClientForm.onsubmit = async (e) => {
            e.preventDefault();
            const companyName = companyNameInput.value.trim();
            if (companyName) {
                try {
                    const docRef = await addDoc(collection(db, "clients"), {
                        name: companyName,
                        ownerId: user.uid,
                        createdAt: Timestamp.now()
                    });
                    allClients.push({ id: docRef.id, name: companyName, createdAt: Timestamp.now() });
                    renderClients();
                    closeModal();
                } catch (error) {
                    console.error("Error adding client: ", error);
                    alert("Hubo un error al guardar el cliente.");
                }
            }
        };

        fetchClients();
    };


    // --- App Initialization ---
    addClientBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelAddClientBtn.addEventListener('click', closeModal);
    addClientModal.addEventListener('click', e => { if (e.target === addClientModal) closeModal(); });
    backToClientsBtn.addEventListener('click', showClientView);
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, initialize the main app logic.
            initialize(user);
        } else {
            // User is signed out. Clear the UI and state.
            allClients = [];
            renderClients();
            console.log("User is signed out.");
        }
    });
});
