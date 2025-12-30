import { auth, database } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { ref, onValue, remove, get, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

document.addEventListener('DOMContentLoaded', () => {
    const notificationBtn = document.getElementById('notification-toggle-btn');
    const notificationPanel = document.getElementById('notification-panel');
    const notificationList = document.getElementById('notification-list');
    const notificationBadge = document.getElementById('notification-badge');
    const noNotificationsMsg = document.getElementById('no-notifications-msg');
    const clearNotificationsBtn = document.getElementById('clear-notifications-btn');

    if (!notificationBtn || !notificationPanel || !notificationList || !notificationBadge || !noNotificationsMsg) return;

    let currentUser = null;
    let notificationsRef = null;

    const togglePanel = () => {
        if (notificationPanel.classList.contains('hidden')) {
            notificationPanel.classList.remove('hidden');
            // Here we could mark notifications as seen, for now, just show.
        } else {
            notificationPanel.classList.add('hidden');
        }
    };

    notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
    });

    // Close panel if clicking outside
    document.addEventListener('click', (e) => {
        if (!notificationPanel.classList.contains('hidden') && !notificationPanel.contains(e.target)) {
            notificationPanel.classList.add('hidden');
        }
    });

    const resolveNotificationManageId = async (manageIdValue, pathValue) => {
        const manageId = String(manageIdValue || '').trim();
        if (manageId) return manageId;
        const path = String(pathValue || '').trim();
        if (!path) return '';
        try {
            const snap = await get(ref(database, path));
            const data = snap.val();
            return String(data?.manageId || '').trim();
        } catch (error) {
            console.error("Error resolving manageId:", error);
            return '';
        }
    };

    const openNotificationTarget = (manageIdValue) => {
        const manageId = String(manageIdValue || '').trim();
        if (!manageId) return;

        const detailView = document.getElementById('detail-view');
        const detailFrame = document.getElementById('detail-frame');
        if (detailView && detailFrame) {
            document.getElementById('tab-projects')?.click();
            detailView.classList.remove('hidden');
            detailFrame.src = `detail.html?mid=${encodeURIComponent(manageId)}`;
            document.getElementById('tree-view')?.classList.add('hidden');
            document.getElementById('project-detail')?.classList.add('hidden');
            document.getElementById('dashboard-tabs')?.classList.add('hidden');
            if (window.location.protocol !== 'file:') {
                const targetPath = `/${encodeURIComponent(manageId)}`;
                if (window.location.pathname !== targetPath) {
                    try {
                        window.history.pushState({}, '', targetPath);
                    } catch (error) {
                        // Ignore history update failures.
                    }
                }
            }
            document.title = `Detalle ${manageId} | Tamoe`;
            return;
        }

        const encoded = encodeURIComponent(manageId);
        const origin = window.location.origin;
        const target = origin && origin !== 'null'
            ? `${origin}/${encoded}`
            : `maindashboard.html?mid=${encoded}`;
        window.location.assign(target);
    };

    const deleteNotification = async (notificationId) => {
        if (!currentUser || !notificationId) return;
        const notificationRef = ref(database, `notifications/${currentUser.uid}/${notificationId}`);
        try {
            await remove(notificationRef);
        } catch (error) {
            console.error("Error deleting notification:", error);
        }
    };

    const clearAllNotifications = async () => {
        if (!currentUser) return;
        const notificationRef = ref(database, `notifications/${currentUser.uid}`);
        try {
            await remove(notificationRef);
        } catch (error) {
            console.error("Error clearing notifications:", error);
        }
    };

    const buildNotificationTitle = (notification) => {
        const base = String(notification?.title || '').trim() || 'Nueva notificacion';
        const name = String(notification?.taskName || '').trim();
        return name ? `${base} "${name}"` : base;
    };

    const buildNotificationMeta = (notification) => {
        const parts = [];
        const manageId = String(notification?.manageId || '').trim();
        const fromName = String(notification?.fromName || '').trim();
        if (manageId) parts.push(manageId);
        if (fromName) parts.push(`Asignado por ${fromName}`);
        return parts.join(' | ');
    };


    notificationList.addEventListener('click', async (e) => {
        const notifElement = e.target.closest('a[data-id]');
        if (notifElement) {
            e.preventDefault();
            const notificationId = notifElement.dataset.id;
            const manageId = await resolveNotificationManageId(
                notifElement.dataset.manageId || '',
                notifElement.dataset.path || ''
            );
            await deleteNotification(notificationId);
            openNotificationTarget(manageId);
        }
    });

    clearNotificationsBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        clearAllNotifications();
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            notificationsRef = ref(database, 'notifications/' + currentUser.uid);
            
            // Listen for changes in notifications
            onValue(notificationsRef, (snapshot) => {
                const notifications = snapshot.val();
                renderNotifications(notifications);
            });

        } else {
            currentUser = null;
            notificationBtn.classList.add('hidden');
        }
    });

    function renderNotifications(notifications) {
        notificationList.innerHTML = '';
        let unreadCount = 0;

        if (!notifications) {
            noNotificationsMsg.classList.remove('hidden');
            notificationBadge.classList.add('hidden');
            notificationBadge.textContent = '';
            return;
        }

        noNotificationsMsg.classList.add('hidden');
        
        const sortedNotifications = Object.keys(notifications)
            .map(key => ({ id: key, ...notifications[key] }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        sortedNotifications.forEach(notification => {
            if (!notification.read) {
                unreadCount++;
            }

            const notifElement = document.createElement('a');
            const manageId = String(notification.manageId || '').trim();
            notifElement.href = manageId ? `/${encodeURIComponent(manageId)}` : "#";
            notifElement.className = `p-4 flex items-start gap-3 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors border-b border-border-dark ${!notification.read ? 'bg-primary/5 dark:bg-primary/10' : ''}`;
            notifElement.dataset.id = notification.id;
            if (manageId) {
                notifElement.dataset.manageId = manageId;
            }
            const path = String(notification.path || '').trim();
            if (path) {
                notifElement.dataset.path = path;
            }

            const metaLine = buildNotificationMeta(notification);
            
            notifElement.innerHTML = `
                <div class="w-1 h-1 rounded-full ${!notification.read ? 'bg-primary' : 'bg-text-muted/50'} mt-2.5"></div>
                <div class="flex-1">
                    <p class="font-semibold text-gray-900 dark:text-white">${buildNotificationTitle(notification)}</p>
                    <p class="text-sm text-text-muted">${metaLine}</p>
                    <p class="text-xs text-text-muted/70 mt-1">${new Date(notification.createdAt).toLocaleString()}</p>
                </div>
            `;
            notificationList.appendChild(notifElement);
        });

        if (unreadCount > 0) {
            notificationBadge.classList.remove('hidden');
            notificationBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        } else {
            notificationBadge.classList.add('hidden');
            notificationBadge.textContent = '';
        }
    }
});

