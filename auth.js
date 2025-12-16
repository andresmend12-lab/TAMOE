
import { auth, database } from './firebase.js';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const googleRegisterButton = document.getElementById('google-register-button');

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;
            const department = document.getElementById('register-department').value;

            if (password !== confirmPassword) {
                alert("Las contraseñas no coinciden.");
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
                    alert(`Error de inicio de sesión con Google: ${errorMessage}`);
                });
        });
    }
});
