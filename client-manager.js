document.addEventListener('DOMContentLoaded', () => {
    // Sidebar elements
    const addClientBtn = document.getElementById('add-client-btn');
    const clientListNav = document.getElementById('client-list-nav');
    const noClientsMessage = document.getElementById('no-clients-message');

    // Modal elements
    const addClientModal = document.getElementById('add-client-modal');
    const addClientForm = document.getElementById('add-client-form');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelAddClientBtn = document.getElementById('cancel-add-client');
    const companyNameInput = document.getElementById('company-name');

    // This will be replaced with database logic later
    let clients = [];

    const renderClients = () => {
        clientListNav.querySelectorAll('a').forEach(link => link.remove());

        if (clients.length === 0) {
            noClientsMessage.classList.remove('hidden');
        } else {
            noClientsMessage.classList.add('hidden');
            clients.forEach(client => {
                const clientLink = document.createElement('a');
                clientLink.href = '#'; // Or a client-specific URL later
                clientLink.className = 'flex items-center gap-3 px-3 py-2 rounded-lg text-text-muted hover:bg-white/5 hover:text-white transition-colors';
                clientLink.innerHTML = `
                    <span class="material-symbols-outlined">folder_open</span>
                    <span class="text-sm font-medium">${client.name}</span>
                `;
                clientListNav.appendChild(clientLink);
            });
        }
    };

    const openModal = () => {
        addClientModal.classList.remove('hidden');
        setTimeout(() => companyNameInput.focus(), 50); // Focus after transition
    };

    const closeModal = () => {
        addClientModal.classList.add('hidden');
        companyNameInput.value = ''; // Clear input
    };

    // Event Listeners
    addClientBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelAddClientBtn.addEventListener('click', closeModal);

    // Close modal if clicking on the background overlay
    addClientModal.addEventListener('click', (e) => {
        if (e.target === addClientModal) {
            closeModal();
        }
    });

    addClientForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const companyName = companyNameInput.value.trim();

        if (companyName) {
            clients.push({ name: companyName });
            renderClients();
            closeModal();
        }
    });

    // Initial render of client list
    renderClients();
});
