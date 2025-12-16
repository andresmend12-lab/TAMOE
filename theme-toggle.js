document.addEventListener('DOMContentLoaded', () => {
    const themeToggleButton = document.getElementById('theme-toggle');

    if (themeToggleButton) {
        const themeIcon = themeToggleButton.querySelector('span');

        const updateIcon = () => {
            if (document.documentElement.classList.contains('dark')) {
                themeIcon.textContent = 'light_mode';
            } else {
                themeIcon.textContent = 'brightness_4';
            }
        };

        // Set initial theme based on localStorage
        if (localStorage.getItem('theme') === 'dark') {
            document.documentElement.classList.add('dark');
        }
        updateIcon();

        themeToggleButton.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');

            let theme = 'light';
            if (document.documentElement.classList.contains('dark')) {
                theme = 'dark';
            }
            localStorage.setItem('theme', theme);

            updateIcon();
        });
    }
});
