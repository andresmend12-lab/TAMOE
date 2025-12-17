const getManageIdFromPath = () => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    const raw = decodeURIComponent(parts[0] || '').trim();
    if (!/^[A-Za-z0-9]{2,}-\d{3,}$/.test(raw)) return null;
    return raw.toUpperCase();
};

document.addEventListener('DOMContentLoaded', () => {
    const manageId = getManageIdFromPath();
    const detailView = document.getElementById('detail-view');
    const detailFrame = document.getElementById('detail-frame');
    const treeView = document.getElementById('tree-view');
    const projectDetail = document.getElementById('project-detail');

    if (!detailView || !detailFrame) return;

    if (manageId) {
        detailView.classList.remove('hidden');
        detailFrame.src = `detail.html?mid=${encodeURIComponent(manageId)}`;
        treeView?.classList.add('hidden');
        projectDetail?.classList.add('hidden');
        document.title = `Detalle ${manageId} | Tamoe`;
        return;
    }

    detailView.classList.add('hidden');
    detailFrame.removeAttribute('src');
    treeView?.classList.remove('hidden');
});

