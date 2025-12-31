
import { auth, database } from './firebase.js';
import {
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    getAdditionalUserInfo,
    sendEmailVerification
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

const passwordToggles = document.querySelectorAll('[data-password-toggle]');
if (passwordToggles.length) {
    passwordToggles.forEach((toggle) => {
        const targetId = toggle.getAttribute('data-password-target');
        const input = targetId ? document.getElementById(targetId) : null;
        if (!input) return;
        toggle.addEventListener('click', () => {
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            const icon = toggle.querySelector('span');
            if (icon) {
                icon.textContent = isHidden ? 'visibility' : 'visibility_off';
            }
            toggle.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
        });
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
const resendVerificationButton = document.getElementById('resend-verification');
const loginStatus = document.getElementById('login-status');

const setLoginStatus = (message, isError = false) => {
    if (!loginStatus) return;
    loginStatus.textContent = message;
    loginStatus.classList.toggle('text-red-500', Boolean(isError));
    loginStatus.classList.toggle('dark:text-red-400', Boolean(isError));
    loginStatus.classList.toggle('text-text-muted-light', !isError);
    loginStatus.classList.toggle('dark:text-text-muted-dark', !isError);
};

const setLoginLoading = (isLoading) => {
    if (!resendVerificationButton) return;
    resendVerificationButton.disabled = Boolean(isLoading);
    resendVerificationButton.classList.toggle('opacity-70', Boolean(isLoading));
    resendVerificationButton.classList.toggle('cursor-not-allowed', Boolean(isLoading));
};

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
                    await sendEmailVerification(user, { url: buildVerifyUrl(), handleCodeInApp: true });
                } catch (error) {
                    console.warn('No se pudo enviar la verificaci\u00F3n de correo:', error);
                }
                setLoginStatus('Te enviamos el correo de verificaci\u00F3n.', false);
                window.location.href = 'verify-email.html?sent=1';
                return;
            }
            await ensureUserProfile(user);
            window.location.href = 'maindashboard.html';
        } catch (error) {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.error(errorCode, errorMessage);
            setLoginStatus('Error al iniciar sesi\u00F3n: ' + errorMessage, true);
        }
    });
}

if (resendVerificationButton) {
    resendVerificationButton.addEventListener('click', async () => {
        const email = document.getElementById('login-email')?.value.trim() || '';
        const password = document.getElementById('login-password')?.value || '';

        if (!email || !password) {
            setLoginStatus('Introduce tu correo y contrase\u00F1a para reenviar el correo.', true);
            return;
        }

        try {
            setLoginLoading(true);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            if (user.emailVerified) {
                await ensureUserProfile(user);
                window.location.href = 'maindashboard.html';
                return;
            }
            auth.languageCode = 'es';
            await sendEmailVerification(user, { url: buildVerifyUrl(), handleCodeInApp: true });
            setLoginStatus('Correo de verificaci\u00F3n reenviado.', false);
            window.location.href = 'verify-email.html?sent=1';
        } catch (error) {
            let message = 'No se pudo reenviar el correo.';
            if (error?.code === 'auth/wrong-password') {
                message = 'La contrase\u00F1a no es correcta.';
            } else if (error?.code === 'auth/user-not-found') {
                message = 'No encontramos un usuario con ese correo.';
            } else if (error?.code === 'auth/too-many-requests') {
                message = 'Demasiados intentos. Int\u00E9ntalo m\u00E1s tarde.';
            }
            setLoginStatus(message, true);
        } finally {
            setLoginLoading(false);
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




