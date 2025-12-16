
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
}

document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    const visibilityToggle = document.querySelector('.cursor-pointer span');

    if (passwordInput && visibilityToggle) {
        const parent = visibilityToggle.parentElement;
        parent.addEventListener('click', () => {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                visibilityToggle.textContent = 'visibility_off';
            } else {
                passwordInput.type = 'password';
                visibilityToggle.textContent = 'visibility';
            }
        });
    }
});
