import { auth } from './firebase.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgot-password-form');
    const emailInput = document.getElementById('forgot-email');
    const statusEl = document.getElementById('forgot-status');
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;

    const setStatus = (message, isError = false) => {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.toggle('text-red-400', Boolean(isError));
        statusEl.classList.toggle('text-text-muted-light', !isError);
        statusEl.classList.toggle('dark:text-text-muted-dark', !isError);
    };

    const setLoading = (isLoading) => {
        if (!submitButton) return;
        submitButton.disabled = Boolean(isLoading);
        submitButton.classList.toggle('opacity-70', Boolean(isLoading));
        submitButton.classList.toggle('cursor-not-allowed', Boolean(isLoading));
    };

    const buildLoginUrl = () => {
        try {
            return new URL('login.html', window.location.href).href;
        } catch (error) {
            return 'login.html';
        }
    };

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = String(emailInput?.value || '').trim();
        if (!email) {
            setStatus('Introduce un correo v\u00E1lido.', true);
            return;
        }

        setStatus('Enviando enlace...', false);
        setLoading(true);

        try {
            auth.languageCode = 'es';
            await sendPasswordResetEmail(auth, email, {
                url: buildLoginUrl(),
            });
            if (emailInput) {
                emailInput.value = '';
            }
            setStatus('Revisa tu correo para restablecer la contrase\u00F1a.', false);
        } catch (error) {
            let message = 'No se pudo enviar el enlace de restablecimiento.';
            if (error?.code === 'auth/user-not-found') {
                message = 'No encontramos un usuario con ese correo.';
            } else if (error?.code === 'auth/invalid-email') {
                message = 'El correo no es v\u00E1lido.';
            } else if (error?.code === 'auth/too-many-requests') {
                message = 'Demasiadas solicitudes, int\u00E9ntalo m\u00E1s tarde.';
            }
            setStatus(message, true);
        } finally {
            setLoading(false);
        }
    });
});
