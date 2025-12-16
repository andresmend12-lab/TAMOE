
import { auth } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in, redirect to the main dashboard.
        window.location.href = 'maindashboard.html';
    } else {
        // User is not logged in, redirect to the login page.
        window.location.href = 'login.html';
    }
});
