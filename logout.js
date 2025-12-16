
import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', (event) => {
    const logoutButton = document.getElementById('logout-button');

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            signOut(auth).then(() => {
                // Sign-out successful.
                window.location.href = 'login.html';
            }).catch((error) => {
                // An error happened.
                console.error("Logout error:", error);
            });
        });
    }
});
