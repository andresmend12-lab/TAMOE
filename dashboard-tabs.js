document.addEventListener('DOMContentLoaded', () => {
    const tabsRoot = document.getElementById('dashboard-tabs');
    if (!tabsRoot) return;

    const tabButtons = Array.from(tabsRoot.querySelectorAll('[role="tab"][data-tab]'));
    const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));
    if (!tabButtons.length || !tabPanels.length) return;

    const getPanelByTab = (tabKey) => document.getElementById(`tab-panel-${tabKey}`) || tabPanels.find(p => p.dataset.tabPanel === tabKey);

    const setActiveTab = (tabKey) => {
        const nextPanel = getPanelByTab(tabKey);
        if (!nextPanel) return;

        tabButtons.forEach((btn) => {
            const isActive = btn.dataset.tab === tabKey;
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.classList.toggle('bg-primary', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('shadow-lg', isActive);
            btn.classList.toggle('shadow-primary/20', isActive);
            btn.classList.toggle('border', !isActive);
            btn.classList.toggle('border-gray-200', !isActive);
            btn.classList.toggle('dark:border-border-dark', !isActive);
            btn.classList.toggle('bg-white/60', !isActive);
            btn.classList.toggle('dark:bg-surface-dark', !isActive);
            btn.classList.toggle('text-gray-700', !isActive);
            btn.classList.toggle('dark:text-text-muted', !isActive);
        });

        tabPanels.forEach((panel) => {
            const isActive = panel === nextPanel || panel.dataset.tabPanel === tabKey || panel.id === `tab-panel-${tabKey}`;
            panel.classList.toggle('hidden', !isActive);
        });
    };

    tabButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tabKey = String(btn.dataset.tab || '').trim();
            if (!tabKey) return;
            setActiveTab(tabKey);
        });
    });

    // Support for ?tab= query parameter (priority 1)
    const tabFromQueryParam = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (!tabParam) return null;
        const cleanTab = tabParam.trim();
        return tabButtons.some(btn => btn.dataset.tab === cleanTab) ? cleanTab : null;
    };

    // Support for #hash (priority 2)
    const tabFromHash = () => {
        const rawHash = window.location.hash ? window.location.hash.replace('#', '').trim() : '';
        if (!rawHash) return null;
        return tabButtons.some(btn => btn.dataset.tab === rawHash) ? rawHash : null;
    };

    // Priority: query param > hash > aria-selected > first tab
    const initial = tabFromQueryParam()
        || tabFromHash()
        || tabButtons.find(b => b.getAttribute('aria-selected') === 'true')?.dataset.tab
        || tabButtons[0]?.dataset.tab;

    if (initial) setActiveTab(initial);

    // Clean up URL after activating tab from query param
    if (tabFromQueryParam() && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('tab');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
});
