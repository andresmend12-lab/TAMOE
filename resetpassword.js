import { auth } from './firebase.js';
import { confirmPasswordReset, verifyPasswordResetCode } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-password-form');
    const emailEl = document.getElementById('reset-email');
    const statusEl = document.getElementById('reset-status');
    const passwordInput = document.getElementById('reset-password');
    const confirmInput = document.getElementById('reset-confirm');
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const actionCode = params.get('oobCode');

    const setStatus = (message, isError = false) => {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.toggle('text-red-500', Boolean(isError));
        statusEl.classList.toggle('dark:text-red-400', Boolean(isError));
        statusEl.classList.toggle('text-text-muted-light', !isError);
        statusEl.classList.toggle('dark:text-text-muted-dark', !isError);
    };

    const setLoading = (isLoading) => {
        if (!submitButton) return;
        submitButton.disabled = Boolean(isLoading);
        submitButton.classList.toggle('opacity-70', Boolean(isLoading));
        submitButton.classList.toggle('cursor-not-allowed', Boolean(isLoading));
    };

    const disableForm = () => {
        [passwordInput, confirmInput, submitButton].forEach((el) => {
            if (!el) return;
            el.disabled = true;
        });
    };

    const showInvalidLink = () => {
        setStatus('El enlace no es v\u00E1lido o ha caducado.', true);
        disableForm();
    };

    if (!actionCode || mode !== 'resetPassword') {
        showInvalidLink();
        return;
    }

    verifyPasswordResetCode(auth, actionCode)
        .then((email) => {
            if (emailEl) {
                emailEl.textContent = email;
            }
        })
        .catch(() => {
            showInvalidLink();
        });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!actionCode) {
            showInvalidLink();
            return;
        }

        const password = String(passwordInput?.value || '');
        const confirm = String(confirmInput?.value || '');

        if (password.length < 8) {
            setStatus('La contrase\u00F1a debe tener al menos 8 caracteres.', true);
            return;
        }

        if (password !== confirm) {
            setStatus('Las contrase\u00F1as no coinciden.', true);
            return;
        }

        try {
            setLoading(true);
            await confirmPasswordReset(auth, actionCode, password);
            setStatus('Contrase\u00F1a actualizada. Ya puedes iniciar sesi\u00F3n.', false);
            disableForm();
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } catch (error) {
            let message = 'No se pudo actualizar la contrase\u00F1a.';
            if (error?.code === 'auth/weak-password') {
                message = 'La contrase\u00F1a es demasiado d\u00E9bil.';
            } else if (error?.code === 'auth/expired-action-code') {
                message = 'El enlace ha caducado. Solicita uno nuevo.';
            }
            setStatus(message, true);
        } finally {
            setLoading(false);
        }
    });
});
