
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (!user) {
        // User is not logged in, redirect to login page.
        window.location.href = 'login.html';
        return;
    }

    if (!user.emailVerified) {
        signOut(auth).finally(() => {
            window.location.href = 'verify-email.html';
        });
    }
});
