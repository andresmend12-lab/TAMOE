import { auth, database } from './firebase.js';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, isSignInWithEmailLink, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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

        const disablePasswordFields = () => {
            [registerPasswordInput, registerConfirmPasswordInput].forEach((input) => {
                if (!input) return;
                input.value = '';
                input.required = false;
                input.disabled = true;
                const wrapper = input.closest('label');
                if (wrapper) {
                    wrapper.classList.add('hidden');
                }
            });
        };

        const getEmailFromStorage = () => {
            try {
                return localStorage.getItem('emailForSignIn') || '';
            } catch (error) {
                return '';
            }
        };

        if (isEmailLink) {
            disablePasswordFields();
            if (submitLabel) {
                submitLabel.textContent = 'Aceptar invitaci\u00F3n';
            }
            const storedEmail = getEmailFromStorage();
            if (registerEmailInput && storedEmail) {
                registerEmailInput.value = storedEmail;
            }
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const name = registerNameInput?.value.trim() || '';
                const email = registerEmailInput?.value.trim() || '';
                const department = registerDepartmentInput?.value || '';

                if (!email) {
                    alert('Introduce tu correo para aceptar la invitaci\u00F3n.');
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
                    const userRef = ref(database, 'users/' + user.uid);
                    const snapshot = await get(userRef);
                    if (!snapshot.exists()) {
                        await set(userRef, {
                            username: name || user.displayName || email,
                            email: user.email || email,
                            department: department,
                            profile_picture: ''
                        });
                    }
                    window.location.href = 'maindashboard.html';
                } catch (error) {
                    console.error("Email link sign-in error: ", error);
                    alert(`Error al aceptar la invitaci\u00F3n: ${error.message}`);
                }
            });
        } else {
            registerForm.addEventListener('submit', (e) => {
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

                createUserWithEmailAndPassword(auth, email, password)
                    .then((userCredential) => {
                        // Signed in 
                        const user = userCredential.user;
                        
                        // Save user data to Realtime Database
                        set(ref(database, 'users/' + user.uid), {
                            username: name,
                            email: email,
                            department: department,
                            profile_picture: '' // Initialize with empty profile picture
                        }).then(() => {
                            window.location.href = 'maindashboard.html';
                        }).catch((error) => {
                            console.error("Error saving user data: ", error);
                            alert("Error al guardar los datos del usuario.");
                        });
                    })
                    .catch((error) => {
                        const errorCode = error.code;
                        const errorMessage = error.message;
                        console.error("Registration error: ", errorCode, errorMessage);
                        alert(`Error de registro: ${errorMessage}`);
                    });
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
