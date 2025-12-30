
import { auth, database } from './firebase.js';
import {
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    getAdditionalUserInfo,
    sendEmailVerification,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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

const pendingProfileKey = 'pendingInviteProfile';

const getPendingInviteProfile = () => {
    try {
        const stored = localStorage.getItem(pendingProfileKey);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        return null;
    }
};

const clearPendingInviteProfile = () => {
    try {
        localStorage.removeItem(pendingProfileKey);
    } catch (error) {
        // Ignore storage errors.
    }
};

const ensureUserProfile = async (user) => {
    const userRef = ref(database, 'users/' + user.uid);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
        clearPendingInviteProfile();
        return;
    }

    const pendingProfile = getPendingInviteProfile();
    const username = pendingProfile?.username || user.displayName || user.email || 'Usuario';
    const email = pendingProfile?.email || user.email || '';
    const department = pendingProfile?.department || 'Sin asignar';
    const profilePicture = pendingProfile?.profile_picture || '';

    await set(userRef, {
        username,
        email,
        department,
        profile_picture: profilePicture
    });
    clearPendingInviteProfile();
};

const buildVerifyUrl = () => {
    try {
        return new URL('verify-email.html', window.location.href).href;
    } catch (error) {
        return 'verify-email.html';
    }
};

// --- Login Page Logic ---
const loginForm = document.getElementById('login-form');
const loginGoogleButton = document.getElementById('login-google-button');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            if (!user.emailVerified) {
                try {
                    auth.languageCode = 'es';
                    await sendEmailVerification(user, { url: buildVerifyUrl() });
                } catch (error) {
                    console.warn('No se pudo enviar la verificaci\u00F3n de correo:', error);
                }
                await signOut(auth);
                window.location.href = 'verify-email.html?sent=1';
                return;
            }
            await ensureUserProfile(user);
            window.location.href = 'maindashboard.html';
        } catch (error) {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.error(errorCode, errorMessage);
            alert('Error al iniciar sesi\u00F3n: ' + errorMessage);
        }
    });
}
if (loginGoogleButton) {
    loginGoogleButton.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider)
            .then((result) => {
                const user = result.user;
                const additionalUserInfo = getAdditionalUserInfo(result);
                if (additionalUserInfo?.isNewUser) {
                    writeUserData(user.uid, user.displayName, user.email);
                }
                window.location.href = 'maindashboard.html';
            }).catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error(errorCode, errorMessage);
                alert(`Error con Google: ${errorMessage}`);
            });
    });
}




