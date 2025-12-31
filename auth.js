import { auth, database } from './firebase.js';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, isSignInWithEmailLink, signInWithEmailLink, sendEmailVerification, updatePassword } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const googleRegisterButton = document.getElementById('google-register-button');

    if (registerForm) {
        const registerNameInput = document.getElementById('register-name');
        const registerEmailInput = document.getElementById('register-email');
        const registerPasswordInput = document.getElementById('register-password');
        const registerConfirmPasswordInput = document.getElementById('register-confirm-password');
        const registerDepartmentInput = document.getElementById('register-department');
        const submitLabel = registerForm.querySelector('button[type="submit"] span');
        const isEmailLink = isSignInWithEmailLink(auth, window.location.href);
        const departmentField = document.getElementById('department-field');
        const departmentToggle = document.getElementById('department-toggle');
        const departmentMenu = document.getElementById('department-menu');
        const departmentValue = document.getElementById('department-value');
        const pendingProfileKey = 'pendingInviteProfile';

        const closeDepartmentMenu = () => {
            if (!departmentMenu) return;
            departmentMenu.classList.add('hidden');
            departmentToggle?.setAttribute('aria-expanded', 'false');
        };

        if (departmentToggle && departmentMenu && registerDepartmentInput) {
            const options = Array.from(departmentMenu.querySelectorAll('.department-option'));
            departmentToggle.addEventListener('click', (event) => {
                event.preventDefault();
                const isHidden = departmentMenu.classList.contains('hidden');
                if (isHidden) {
                    departmentMenu.classList.remove('hidden');
                    departmentToggle.setAttribute('aria-expanded', 'true');
                } else {
                    closeDepartmentMenu();
                }
            });

            options.forEach((option) => {
                option.addEventListener('click', () => {
                    const value = option.getAttribute('data-value') || '';
                    registerDepartmentInput.value = value;
                    if (departmentValue) {
                        departmentValue.textContent = option.textContent.trim();
                        departmentValue.classList.remove('text-text-muted-light', 'dark:text-text-muted-dark');
                    }
                    closeDepartmentMenu();
                });
            });

            document.addEventListener('click', (event) => {
                if (!departmentField || departmentField.contains(event.target)) return;
                closeDepartmentMenu();
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeDepartmentMenu();
                }
            });
        }

        const getEmailFromStorage = () => {
            try {
                return localStorage.getItem('emailForSignIn') || '';
            } catch (error) {
                return '';
            }
        };

        const savePendingProfile = (profile) => {
            try {
                localStorage.setItem(pendingProfileKey, JSON.stringify(profile));
            } catch (error) {
                console.warn('No se pudo guardar el registro pendiente:', error);
            }
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

        if (isEmailLink) {
            if (submitLabel) {
                submitLabel.textContent = 'Unirme al equipo';
            }
            const storedEmail = getEmailFromStorage();
            if (registerEmailInput && storedEmail) {
                registerEmailInput.value = storedEmail;
            }
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const name = registerNameInput?.value.trim() || '';
                const email = registerEmailInput?.value.trim() || '';
                const password = registerPasswordInput?.value || '';
                const confirmPassword = registerConfirmPasswordInput?.value || '';
                const department = registerDepartmentInput?.value || '';

                if (!email) {
                    alert('Introduce tu correo para aceptar la invitaci\u00F3n.');
                    return;
                }

                if (password.length < 8) {
                    alert('La contrase\u00F1a debe tener al menos 8 caracteres.');
                    return;
                }

                if (password !== confirmPassword) {
                    alert('Las contrase\u00F1as no coinciden.');
                    return;
                }

                if (!department) {
                    alert('Por favor, selecciona un departamento.');
                    return;
                }

                try {
                    const result = await signInWithEmailLink(auth, email, window.location.href);
                    localStorage.removeItem('emailForSignIn');
                    const user = result.user;
                    if (!user) {
                        throw new Error('No se pudo completar la invitaci\u00F3n.');
                    }
                    await updatePassword(user, password);
                    const pendingProfile = {
                        username: name || user.displayName || email,
                        email: user.email || email,
                        department: department,
                        profile_picture: ''
                    };
                    savePendingProfile(pendingProfile);
                    try {
                        auth.languageCode = 'es';
                        await sendEmailVerification(user, { url: buildVerifyUrl(pendingProfile), handleCodeInApp: true });
                    } catch (error) {
                        console.warn('No se pudo enviar la verificaci\u00F3n de correo:', error);
                        alert('No se pudo enviar la verificaci\u00F3n de correo.');
                        return;
                    }
                    window.location.href = 'verify-email.html?sent=1';
                } catch (error) {
                    console.error("Email link sign-in error: ", error);
                    alert(`Error al aceptar la invitaci\u00F3n: ${error.message}`);
                }
            });
        } else {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const name = registerNameInput?.value || '';
                const email = registerEmailInput?.value || '';
                const password = registerPasswordInput?.value || '';
                const confirmPassword = registerConfirmPasswordInput?.value || '';
                const department = registerDepartmentInput?.value || '';

                if (password !== confirmPassword) {
                    alert("Las contrase\u00F1as no coinciden.");
                    return;
                }

                if (!department) {
                    alert("Por favor, selecciona un departamento.");
                    return;
                }

                try {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    const user = userCredential.user;
                    const pendingProfile = {
                        username: name || user.displayName || email,
                        email: user.email || email,
                        department: department,
                        profile_picture: ''
                    };
                    savePendingProfile(pendingProfile);
                    try {
                        auth.languageCode = 'es';
                        await sendEmailVerification(user, { url: buildVerifyUrl(pendingProfile), handleCodeInApp: true });
                    } catch (error) {
                        console.warn('No se pudo enviar la verificaci\u00F3n de correo:', error);
                    }
                    window.location.href = 'verify-email.html?sent=1';
                } catch (error) {
                    const errorCode = error.code;
                    const errorMessage = error.message;
                    console.error("Registration error: ", errorCode, errorMessage);
                    if (errorCode === 'auth/email-already-in-use') {
                        alert('Este correo ya est\u00E1 registrado.');
                    } else {
                        alert(`Error de registro: ${errorMessage}`);
                    }
                }
            });
        }
    }

    if (googleRegisterButton) {
        googleRegisterButton.addEventListener('click', () => {
            const provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider)
                .then((result) => {
                    const user = result.user;
                    
                    // For Google Sign-In, we might not have the department right away.
                    // We can either ask for it in a subsequent step or set a default.
                    // For now, let's save the basic info.
                    set(ref(database, 'users/' + user.uid), {
                        username: user.displayName,
                        email: user.email,
                        department: 'Not specified', // Default value
                        profile_picture: user.photoURL || ''
                    }).then(() => {
                        window.location.href = 'maindashboard.html';
                    }).catch((error) => {
                        console.error("Error saving user data: ", error);
                    });

                }).catch((error) => {
                    const errorCode = error.code;
                    const errorMessage = error.message;
                    console.error("Google sign-in error: ", errorCode, errorMessage);
                    alert(`Error de inicio de sesi\u00F3n con Google: ${errorMessage}`);
                });
        });
    }
});
