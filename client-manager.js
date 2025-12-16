import { app } from './firebase-config.js';
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const db = getFirestore(app);
    const auth = getAuth(app);

    // Views
    const clientView = document.getElementById('client-view');
    const projectView = document.getElementById('project-view');

    // Client View Elements
    const addClientBtn = document.getElementById('add-client-btn');
    const clientListNav = document.getElementById('client-list-nav');
    const noClientsMessage = document.getElementById('no-clients-message');

    // Project View Elements
    const backToClientsBtn = document.getElementById('back-to-clients-btn');
    const clientNameHeader = document.getElementById('client-name-header');
    const addProjectBtn = document.getElementById('add-project-btn');
    const projectListNav = document.getElementById('project-list-nav');
    const noProjectsMessage = document.getElementById('no-projects-message');

    // Modal Elements
    const addClientModal = document.getElementById('add-client-modal');
    const addClientForm = document.getElementById('add-client-form');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelAddClientBtn = document.getElementById('cancel-add-client');
    const companyNameInput = document.getElementById('company-name');

    let allClients = [];

    // --- View Switching Logic ---
    const showClientView = () => {
        projectView.classList.add('hidden');
        clientView.classList.remove('hidden');
        clientView.classList.add('flex');
        projectView.classList.remove('flex');
    };

    const showProjectView = (clientId) => {
        const client = allClients.find(c => c.id === clientId);
        if (!client) return;

        clientNameHeader.textContent = client.name;
        // TODO: Fetch and render projects for this client
        
        clientView.classList.add('hidden');
        projectView.classList.remove('hidden');
        clientView.classList.remove('flex');
        projectView.classList.add('flex');
    };

    // --- Data Rendering ---
    const renderClients = (clients) => {
        // Remove only client links, leaving the message paragraph intact
        clientListNav.querySelectorAll('a').forEach(link => link.remove());

        if (clients.length === 0) {
            noClientsMessage.textContent = 'No hay clientes.';
            noClientsMessage.classList.remove('hidden');
        } else {
            noClientsMessage.classList.add('hidden');
            clients.forEach(client => {
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

    // --- Data Fetching ---
    const fetchClients = async (user) => {
        if (!user) return;
        
        // Ensure the "loading" message is shown during fetch
        noClientsMessage.textContent = 'Cargando clientes...';
        noClientsMessage.classList.remove('hidden');
        clientListNav.querySelectorAll('a').forEach(link => link.remove());

        const clientsRef = collection(db, "clients");
        const q = query(clientsRef, where("ownerId", "==", user.uid));
        
        try {
            const querySnapshot = await getDocs(q);
            allClients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderClients(allClients);
        } catch (error) {
            console.error("Error fetching clients: ", error);
            noClientsMessage.textContent = 'Error al cargar clientes.';
            noClientsMessage.classList.remove('hidden');
        }
    };

    // --- Modal Logic ---
    const openModal = () => {
        addClientModal.classList.remove('hidden');
        setTimeout(() => companyNameInput.focus(), 50);
    };

    const closeModal = () => {
        addClientModal.classList.add('hidden');
        addClientForm.reset();
    };

    // --- Event Listeners ---
    addClientBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelAddClientBtn.addEventListener('click', closeModal);
    backToClientsBtn.addEventListener('click', showClientView);

    addClientModal.addEventListener('click', (e) => {
        if (e.target === addClientModal) closeModal();
    });

    addClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const companyName = companyNameInput.value.trim();
        const user = auth.currentUser;

        if (companyName && user) {
            try {
                const docRef = await addDoc(collection(db, "clients"), {
                    name: companyName,
                    ownerId: user.uid,
                    createdAt: Timestamp.fromDate(new Date())
                });
                // Optimistically update UI
                const newClient = { id: docRef.id, name: companyName };
                allClients.push(newClient);
                renderClients(allClients);
                closeModal();
            } catch (error) {
                console.error("Error adding document: ", error);
                alert("Hubo un error al guardar el cliente.");
            }
        }
    });

    // --- Initialization ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, fetch their clients.
            fetchClients(user);
        } else {
            // User is signed out, clear the list and show "no clients".
            allClients = [];
            renderClients([]); 
        }
    });
});
