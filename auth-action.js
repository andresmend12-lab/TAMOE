const statusEl = document.getElementById('action-status');
const linkEl = document.getElementById('action-link');

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || '';
const actionCode = params.get('oobCode') || '';
const continueUrl = params.get('continueUrl') || '';

const setStatus = (message) => {
    if (statusEl) {
        statusEl.textContent = message;
    }
};

const updateLink = (href) => {
    if (!linkEl) return;
    linkEl.href = href;
};

const appendIfMissing = (url, key, value) => {
    if (value && !url.searchParams.has(key)) {
        url.searchParams.set(key, value);
    }
};

const buildTargetUrl = () => {
    if (continueUrl) {
        try {
            const target = new URL(continueUrl);
            appendIfMissing(target, 'mode', mode);
            appendIfMissing(target, 'oobCode', actionCode);
            return target.href;
        } catch (error) {
            // Fall through to default routing.
        }
    }

    let fallback = 'login.html';
    if (mode === 'verifyEmail') {
        fallback = 'verify-email.html';
    } else if (mode === 'resetPassword') {
        fallback = 'resetpassword.html';
    } else if (mode === 'signIn') {
        fallback = 'register.html';
    }

    try {
        const target = new URL(fallback, window.location.href);
        appendIfMissing(target, 'mode', mode);
        appendIfMissing(target, 'oobCode', actionCode);
        return target.href;
    } catch (error) {
        return fallback;
    }
};

const targetUrl = buildTargetUrl();
updateLink(targetUrl);

if (mode === 'verifyEmail') {
    setStatus('Verificando tu correo. Te redirigimos en un momento...');
} else if (mode === 'resetPassword') {
    setStatus('Preparando el cambio de contrase\u00F1a. Te redirigimos...');
} else if (mode === 'signIn') {
    setStatus('Preparando el acceso. Te redirigimos...');
} else {
    setStatus('Redirigiendo al siguiente paso...');
}

setTimeout(() => {
    window.location.replace(targetUrl);
}, 600);
