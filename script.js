
import { auth, database } from './firebase.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// --- Theme Toggle ---
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
    const applyTheme = () => {
        if (localStorage.getItem('theme') === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };
    applyTheme();
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// --- Firebase Authentication ---

// Helper function to write user data
const writeUserData = (userId, name, email) => {
    set(ref(database, 'users/' + userId), {
        username: name,
        email: email
    });
};

// --- Registration Page Logic ---
const registerForm = document.getElementById('register-form');
const googleRegisterButton = document.getElementById('google-register-button');

if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;

        if (password !== confirmPassword) {
            alert("Las contraseñas no coinciden.");
            return;
        }

        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in 
                const user = userCredential.user;
                writeUserData(user.uid, name, user.email);
                alert("¡Registro exitoso! Serás redirigido a la página de inicio de sesión.");
                window.location.href = 'login.html';
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error(errorCode, errorMessage);
                alert(`Error al registrarse: ${errorMessage}`);
            });
    });
}

if (googleRegisterButton) {
    googleRegisterButton.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider)
            .then((result) => {
                const user = result.user;
                // Check if the user is new, if so, write to DB
                const isNewUser = getAdditionalUserInfo(result).isNewUser;
                if (isNewUser) {
                    writeUserData(user.uid, user.displayName, user.email);
                }
                alert("¡Has iniciado sesión con Google! Serás redirigido...");
                // TODO: Redirect to a dashboard or protected page
                 window.location.href = 'login.html';
            }).catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error(errorCode, errorMessage);
                alert(`Error con Google: ${errorMessage}`);
            });
    });
}


// --- Login Page Logic ---
const loginForm = document.getElementById('login-form');
const loginGoogleButton = document.getElementById('login-google-button');

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in
                alert("¡Inicio de sesión exitoso!");
                // TODO: Redirect to dashboard
                 window.location.href = '#'; // Placeholder
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error(errorCode, errorMessage);
                alert(`Error al iniciar sesión: ${errorMessage}`);
            });
    });
}

if (loginGoogleButton) {
    loginGoogleButton.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider)
            .then((result) => {
                const user = result.user;
                 // Check if the user is new, if so, write to DB
                const {
                    isNewUser
                } = getAdditionalUserInfo(result);
                if (isNewUser) {
                    writeUserData(user.uid, user.displayName, user.email);
                }
                alert("¡Has iniciado sesión con Google!");
                 // TODO: Redirect to a dashboard or protected page
                window.location.href = '#'; // Placeholder
            }).catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error(errorCode, errorMessage);
                alert(`Error con Google: ${errorMessage}`);
            });
    });
}
