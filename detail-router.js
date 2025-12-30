const normalizeManageId = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return null;
    return /^[A-Za-z0-9]{2,}-\d{3,}$/.test(raw) ? raw : null;
};

const getManageIdFromLocation = () => {
    const params = new URLSearchParams(window.location.search);
    const mid = normalizeManageId(params.get('mid'));
    if (mid) return mid;

    const hashValue = window.location.hash ? window.location.hash.replace('#', '') : '';
    const hashManageId = normalizeManageId(hashValue);
    if (hashManageId) return hashManageId;

    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    const raw = decodeURIComponent(parts[0] || '').trim();
    return normalizeManageId(raw);
};

document.addEventListener('DOMContentLoaded', () => {
    const manageId = getManageIdFromLocation();
    const detailView = document.getElementById('detail-view');
    const detailFrame = document.getElementById('detail-frame');
    const treeView = document.getElementById('tree-view');
    const projectDetail = document.getElementById('project-detail');
    const dashboardTabs = document.getElementById('dashboard-tabs');

    if (!detailView || !detailFrame) return;

    if (manageId) {
        detailView.classList.remove('hidden');
        detailFrame.src = `detail.html?mid=${encodeURIComponent(manageId)}`;
        treeView?.classList.add('hidden');
        projectDetail?.classList.add('hidden');
        dashboardTabs?.classList.add('hidden');
        document.title = `Detalle ${manageId} | Tamoe`;
        return;
    }

    detailView.classList.add('hidden');
    detailFrame.removeAttribute('src');
    treeView?.classList.remove('hidden');
    dashboardTabs?.classList.remove('hidden');
});
