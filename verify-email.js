import { auth, database } from './firebase.js';
import { applyActionCode, onAuthStateChanged, reload, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const statusEl = document.getElementById('verify-status');
const checkButton = document.getElementById('verify-check');
const resendButton = document.getElementById('verify-resend');
const loginLink = document.getElementById('verify-login-link');

const pendingProfileKey = 'pendingInviteProfile';
const verificationAppliedKey = 'emailVerificationApplied';
const urlParams = new URLSearchParams(window.location.search);
const isVerifyRedirect = urlParams.get('mode') === 'verifyEmail';
const actionCode = urlParams.get('oobCode') || '';
const wasInviteFlow = urlParams.get('invite') === '1';
const wasSentNotice = urlParams.get('sent') === '1';

const setStatus = (message, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('text-red-500', Boolean(isError));
    statusEl.classList.toggle('dark:text-red-400', Boolean(isError));
    statusEl.classList.toggle('text-text-muted-light', !isError);
    statusEl.classList.toggle('dark:text-text-muted-dark', !isError);
};

const setLoading = (isLoading) => {
    [checkButton, resendButton].forEach((button) => {
        if (!button) return;
        button.disabled = Boolean(isLoading);
        button.classList.toggle('opacity-70', Boolean(isLoading));
        button.classList.toggle('cursor-not-allowed', Boolean(isLoading));
    });
};

const buildVerifyUrl = (profile = null) => {
    try {
        const url = new URL('verify-email.html', window.location.href);
        if (profile) {
            const params = new URLSearchParams();
            params.set('invite', '1');
            if (profile.username) {
                params.set('name', profile.username);
            }
            if (profile.email) {
                params.set('email', profile.email);
            }
            if (profile.department) {
                params.set('department', profile.department);
            }
            url.search = params.toString();
        }
        return url.href;
    } catch (error) {
        return 'verify-email.html';
    }
};

const getPendingProfile = () => {
    try {
        const stored = localStorage.getItem(pendingProfileKey);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        return null;
    }
};

const captureProfileFromUrl = () => {
    if (!wasInviteFlow) return;
    const name = (urlParams.get('name') || '').trim();
    const email = (urlParams.get('email') || '').trim();
    const department = (urlParams.get('department') || '').trim();
    if (!name && !email && !department) return;

    const existing = getPendingProfile() || {};
    const merged = {
        ...existing,
        ...(name ? { username: name } : {}),
        ...(email ? { email } : {}),
        ...(department ? { department } : {}),
    };

    try {
        localStorage.setItem(pendingProfileKey, JSON.stringify(merged));
    } catch (error) {
        console.warn('No se pudo guardar el registro pendiente:', error);
    }
};

const scrubUrlParams = () => {
    try {
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
        // Ignore history errors.
    }
};

const clearPendingProfile = () => {
    try {
        localStorage.removeItem(pendingProfileKey);
    } catch (error) {
        // Ignore storage errors.
    }
};

const setVerificationApplied = () => {
    try {
        localStorage.setItem(verificationAppliedKey, '1');
    } catch (error) {
        // Ignore storage errors.
    }
};

const isVerificationApplied = () => {
    try {
        return localStorage.getItem(verificationAppliedKey) === '1';
    } catch (error) {
        return false;
    }
};

const clearVerificationApplied = () => {
    try {
        localStorage.removeItem(verificationAppliedKey);
    } catch (error) {
        // Ignore storage errors.
    }
};

const buildLoginUrl = () => {
    try {
        const url = new URL('login.html', window.location.href);
        url.searchParams.set('verified', '1');
        return url.href;
    } catch (error) {
        return 'login.html?verified=1';
    }
};

const updateLoginLink = (href) => {
    if (loginLink) {
        loginLink.href = href;
    }
};

const finalizeRegistration = async (user) => {
    const profile = getPendingProfile();
    if (!profile) {
        setStatus('No encontramos tus datos de registro. Vuelve a registrarte.', true);
        return;
    }

    const username = profile.username || user.displayName || user.email || 'Usuario';
    const email = profile.email || user.email || '';
    const department = profile.department || '';
    const profilePicture = profile.profile_picture || '';

    await set(ref(database, 'users/' + user.uid), {
        username,
        email,
        department,
        profile_picture: profilePicture
    });

    clearPendingProfile();
    clearVerificationApplied();
    await signOut(auth);
    window.location.href = buildLoginUrl();
};

const checkVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
        setStatus('Inicia sesi\u00F3n para completar tu registro.', true);
        return;
    }

    if (!isVerificationApplied() && !isVerifyRedirect) {
        setStatus('A\u00FAn no hemos detectado la verificaci\u00F3n. Revisa tu correo.', false);
        return;
    }

    try {
        setLoading(true);
        await reload(user);
        if (user.emailVerified) {
            setStatus('Correo verificado. Guardando tu perfil...', false);
            await finalizeRegistration(user);
        } else {
            setStatus('A\u00FAn no hemos detectado la verificaci\u00F3n. Revisa tu correo.', false);
        }
    } catch (error) {
        console.error('Error comprobando verificaci\u00F3n:', error);
        setStatus('No se pudo comprobar la verificaci\u00F3n. Int\u00E9ntalo de nuevo.', true);
    } finally {
        setLoading(false);
    }
};

const handleVerifyActionCode = async () => {
    if (!isVerifyRedirect || !actionCode) {
        return false;
    }

    try {
        setLoading(true);
        setStatus('Verificando correo...', false);
        await applyActionCode(auth, actionCode);
        setVerificationApplied();
        const user = auth.currentUser;
        if (user) {
            await reload(user);
            if (user.emailVerified) {
                await finalizeRegistration(user);
                return true;
            }
        }
        const loginUrl = buildLoginUrl();
        updateLoginLink(loginUrl);
        setStatus('Correo verificado. Redirigiendo a inicio de sesi\u00F3n...', false);
        setTimeout(() => {
            window.location.href = loginUrl;
        }, 1200);
        return true;
    } catch (error) {
        console.error('Error aplicando verificaci\u00F3n:', error);
        setStatus('El enlace ya no es v\u00E1lido o ha caducado.', true);
        return true;
    } finally {
        setLoading(false);
    }
};

const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
        setStatus('Inicia sesi\u00F3n para reenviar el correo.', true);
        return;
    }

    try {
        setLoading(true);
        auth.languageCode = 'es';
        const profile = getPendingProfile();
        await sendEmailVerification(user, { url: buildVerifyUrl(profile), handleCodeInApp: true });
        setStatus('Correo de verificaci\u00F3n reenviado.', false);
    } catch (error) {
        console.error('Error reenviando verificaci\u00F3n:', error);
        setStatus('No se pudo reenviar el correo.', true);
    } finally {
        setLoading(false);
    }
};

checkButton?.addEventListener('click', checkVerification);
resendButton?.addEventListener('click', resendVerification);

captureProfileFromUrl();
if (wasInviteFlow || wasSentNotice || isVerifyRedirect) {
    scrubUrlParams();
}

updateLoginLink(buildLoginUrl());

handleVerifyActionCode().then((handled) => {
    if (handled) {
        return;
    }
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (isVerificationApplied()) {
                checkVerification();
            } else {
                setStatus('Revisa tu correo para verificar tu cuenta.', false);
            }
        } else {
            if (wasSentNotice) {
                setStatus('Te enviamos un correo de verificaci\u00F3n. Rev\u00EDsalo para continuar.', false);
            } else {
                setStatus('Revisa tu correo para verificar tu cuenta.', false);
            }
        }
    });
});
