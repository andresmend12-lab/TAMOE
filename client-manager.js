document.addEventListener('DOMContentLoaded', () => {
    const addClientBtn = document.getElementById('add-client-btn');
    const addClientFormContainer = document.getElementById('add-client-form-container');
    const addClientForm = document.getElementById('add-client-form');
    const cancelAddClientBtn = document.getElementById('cancel-add-client');
    const clientListNav = document.getElementById('client-list-nav');
    const noClientsMessage = document.getElementById('no-clients-message');
    const companyNameInput = document.getElementById('company-name');

    // This will be replaced with database logic later
    let clients = [];

    const renderClients = () => {
        // Clear only client links, not the placeholder message
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

    const showAddClientForm = () => {
        addClientBtn.classList.add('hidden');
        addClientFormContainer.classList.remove('hidden');
        companyNameInput.focus();
    };

    const hideAddClientForm = () => {
        addClientFormContainer.classList.add('hidden');
        addClientBtn.classList.remove('hidden');
        companyNameInput.value = ''; // Clear input
    };

    addClientBtn.addEventListener('click', showAddClientForm);
    cancelAddClientBtn.addEventListener('click', hideAddClientForm);

    addClientForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const companyName = companyNameInput.value.trim();

        if (companyName) {
            clients.push({ name: companyName });
            renderClients();
            hideAddClientForm();
        }
    });

    // Initial render
    renderClients();
});
