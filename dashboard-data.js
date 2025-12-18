
import { auth, database } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in, get the user data from the database
        const userRef = ref(database, 'users/' + user.uid);
        get(userRef).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                const userName = userData.username || 'User';
                const department = userData.department || 'No Department';
                const photoUrl = userData.profile_picture || user.photoURL || '';

                const getInitials = (value) => {
                    const text = String(value || '').trim();
                    if (!text) return '?';
                    const parts = text.split(/\s+/).filter(Boolean);
                    if (parts.length >= 2) {
                        const firstName = parts[0];
                        const firstSurname = parts.length >= 3 ? parts[parts.length - 2] : parts[1];
                        return `${firstName[0] || ''}${firstSurname[0] || ''}`.toUpperCase() || '?';
                    }
                    if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
                    return parts[0][0].toUpperCase();
                };

                // Update Welcome Message
                const welcomeMessage = document.getElementById('welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.textContent = `Good afternoon, ${userName}`;
                }

                // Update Sidebar User Info
                const sideBarUserName = document.getElementById('sidebar-user-name');
                const sideBarUserDepartment = document.getElementById('sidebar-user-department');
                const sideBarUserEmail = document.getElementById('user-email');
                const sideBarUserAvatar = document.getElementById('sidebar-user-avatar');

                if(sideBarUserName) {
                    sideBarUserName.textContent = userName;
                }
                 if(sideBarUserDepartment) {
                    sideBarUserDepartment.textContent = department;
                }
                if(sideBarUserEmail) {
                    sideBarUserEmail.textContent = user.email;
                }
                if (sideBarUserAvatar) {
                    const safePhoto = String(photoUrl || '').trim();
                    const hasPhoto = Boolean(safePhoto);
                    sideBarUserAvatar.style.backgroundImage = hasPhoto ? `url(${JSON.stringify(safePhoto)})` : '';
                    sideBarUserAvatar.textContent = hasPhoto ? '' : getInitials(userName);
                    sideBarUserAvatar.setAttribute('aria-label', userName);
                }

            } else {
                console.log("No data available for this user.");
            }
        }).catch((error) => {
            console.error(error);
        });
    }
});
