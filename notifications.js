import { auth, database } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { ref, onValue, update, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

document.addEventListener('DOMContentLoaded', () => {
    const notificationBtn = document.getElementById('notification-toggle-btn');
    const notificationPanel = document.getElementById('notification-panel');
    const notificationList = document.getElementById('notification-list');
    const notificationBadge = document.getElementById('notification-badge');
    const noNotificationsMsg = document.getElementById('no-notifications-msg');

    if (!notificationBtn) return;

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


    notificationList.addEventListener('click', (e) => {
        const notifElement = e.target.closest('a[data-id]');
        if (notifElement) {
            e.preventDefault();
            const notificationId = notifElement.dataset.id;
            markNotificationAsRead(notificationId);
            // In a real app, you would also navigate to the relevant page
        }
    });

    function markNotificationAsRead(notificationId) {
        if (!currentUser || !notificationId) return;
        const notificationRef = ref(database, `notifications/${currentUser.uid}/${notificationId}`);
        update(notificationRef, { read: true }).catch(error => {
            console.error("Error marking notification as read:", error);
        });
    }

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
            notifElement.href = "#"; // In a real app, this would link to the task/item
            notifElement.className = `p-4 flex items-start gap-3 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors border-b border-border-dark ${!notification.read ? 'bg-primary/5 dark:bg-primary/10' : ''}`;
            notifElement.dataset.id = notification.id;

            const iconClass = notification.read ? 'text-text-muted' : 'text-primary';
            
            notifElement.innerHTML = `
                <div class="w-1 h-1 rounded-full ${!notification.read ? 'bg-primary' : 'bg-text-muted/50'} mt-2.5"></div>
                <div class="flex-1">
                    <p class="font-semibold text-gray-900 dark:text-white">${notification.title || 'Nueva Notificación'}</p>
                    <p class="text-sm text-text-muted">${notification.taskName || ''}</p>
                    <p class="text-xs text-text-muted/70 mt-1">${new Date(notification.createdAt).toLocaleString()}</p>
                </div>
            `;
            notificationList.appendChild(notifElement);
        });

        if (unreadCount > 0) {
            notificationBadge.classList.remove('hidden');
        } else {
            notificationBadge.classList.add('hidden');
        }
    }
});
