
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleButton = document.getElementById('theme-toggle');

    if (themeToggleButton) {
        const themeIcon = themeToggleButton.querySelector('span'); // Get the icon element

        // Function to update the icon based on the current theme
        const updateIcon = () => {
            if (document.documentElement.classList.contains('dark')) {
                themeIcon.textContent = 'light_mode';
            } else {
                themeIcon.textContent = 'brightness_4';
            }
        };

        // On page load, set the correct theme and icon
        if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        updateIcon(); // Set the initial icon

        // Add click event listener
        themeToggleButton.addEventListener('click', () => {
            // Toggle the 'dark' class on the root <html> element
            document.documentElement.classList.toggle('dark');

            // Save the theme preference to localStorage
            if (document.documentElement.classList.contains('dark')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'light');
            }

            // Update the icon
            updateIcon();
        });
    }
});
