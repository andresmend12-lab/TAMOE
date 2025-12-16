
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

                // Update Welcome Message
                const welcomeMessage = document.getElementById('welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.textContent = `Good afternoon, ${userName}`;
                }

                // Update Sidebar User Info
                const sideBarUserName = document.getElementById('sidebar-user-name');
                const sideBarUserDepartment = document.getElementById('sidebar-user-department');
                const sideBarUserEmail = document.getElementById('user-email');
                const sideBarUserAvatar = document.getElementById('user-avatar');

                if(sideBarUserName) {
                    sideBarUserName.textContent = userName;
                }
                 if(sideBarUserDepartment) {
                    sideBarUserDepartment.textContent = department;
                }
                if(sideBarUserEmail) {
                    sideBarUserEmail.textContent = user.email;
                }
                 if (sideBarUserAvatar && user.photoURL) {
                    sideBarUserAvatar.style.backgroundImage = `url(${user.photoURL})`;
                }

            } else {
                console.log("No data available for this user.");
            }
        }).catch((error) => {
            console.error(error);
        });
    }
});
