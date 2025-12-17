import { auth, database, storage } from './firebase.js';
import { onAuthStateChanged, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref as dbRef, get, update } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const profileForm = document.getElementById('profile-form');
const profileNameInput = document.getElementById('profile-name');
const profileEmailInput = document.getElementById('profile-email');
const profileDepartmentInput = document.getElementById('profile-department');
const profilePictureInput = document.getElementById('profile-picture');
const avatarCircle = document.getElementById('avatar-circle');
const avatarInitials = document.getElementById('avatar-initials');
const nameDisplay = document.getElementById('profile-name-display');
const departmentDisplay = document.getElementById('profile-department-display');
const changePhotoButton = document.getElementById('change-photo-button');
const closeButton = document.getElementById('close-profile');
const cancelButton = document.getElementById('cancel-profile');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const submitButton = profileForm ? profileForm.querySelector('button[type="submit"]') : null;

let currentUser;
let cachedUserData = null;
let selectedPhotoFile = null;

const redirectToDashboard = () => {
    window.location.href = 'maindashboard.html';
};

const getInitials = (text) => {
    if (!text) return '';
    const parts = text.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

const setAvatar = (photoURL, name, email) => {
    if (photoURL) {
        avatarCircle.style.backgroundImage = `url('${photoURL}')`;
        avatarInitials.textContent = '';
    } else {
        avatarCircle.style.backgroundImage = 'none';
        avatarCircle.style.backgroundColor = '#321a2a';
        avatarInitials.textContent = getInitials(name || email);
    }
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        if (profileEmailInput) {
            profileEmailInput.value = user.email || '';
        }
        const userDbRef = dbRef(database, 'users/' + user.uid);
        get(userDbRef).then((snapshot) => {
            if (snapshot.exists()) {
                cachedUserData = snapshot.val();
                const name = cachedUserData.username || user.displayName || '';
                const department = cachedUserData.department || '';
                const photoURL = cachedUserData.profile_picture || user.photoURL || '';

                if (profileNameInput) profileNameInput.value = name;
                if (profileDepartmentInput) profileDepartmentInput.value = department;
                if (nameDisplay) nameDisplay.textContent = name || 'Sin nombre';
                if (departmentDisplay) departmentDisplay.textContent = department || '--';
                setAvatar(photoURL, name, user.email);
            } else {
                cachedUserData = {};
                if (nameDisplay) nameDisplay.textContent = user.displayName || 'Sin nombre';
                if (departmentDisplay) departmentDisplay.textContent = '--';
                setAvatar(user.photoURL, user.displayName, user.email);
            }
        });
    } else {
        window.location.href = 'login.html';
    }
});

const triggerPhotoPicker = () => {
    profilePictureInput?.click();
};

changePhotoButton?.addEventListener('click', triggerPhotoPicker);
avatarCircle?.addEventListener('click', triggerPhotoPicker);

profilePictureInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    selectedPhotoFile = file;
    const previewURL = URL.createObjectURL(file);
    setAvatar(previewURL, profileNameInput?.value, profileEmailInput?.value);
});

closeButton?.addEventListener('click', redirectToDashboard);
cancelButton?.addEventListener('click', redirectToDashboard);

if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert('Debes iniciar sesion para actualizar tu perfil.');
            return;
        }

        const newName = profileNameInput?.value.trim() || '';
        const department = profileDepartmentInput?.value.trim() || '';
        const newPassword = newPasswordInput?.value || '';
        const confirmPassword = confirmPasswordInput?.value || '';
        const currentPassword = currentPasswordInput?.value || '';

        if (newPassword || confirmPassword || currentPassword) {
            if (!newPassword || !confirmPassword) {
                alert('Completa la nueva contrasena y la confirmacion.');
                return;
            }
            if (newPassword.length < 6) {
                alert('La nueva contrasena debe tener al menos 6 caracteres.');
                return;
            }
            if (newPassword !== confirmPassword) {
                alert('Las contrasenas nuevas no coinciden.');
                return;
            }
            if (!currentPassword) {
                alert('Ingresa tu contrasena actual para cambiarla.');
                return;
            }
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Guardando...';
        }

        try {
            const tasks = [];
            const updates = {};

            if (newName && newName !== (cachedUserData?.username || currentUser.displayName || '')) {
                tasks.push(updateProfile(currentUser, { displayName: newName }));
                updates.username = newName;
            }

            if (department !== (cachedUserData?.department || '')) {
                updates.department = department;
            }

            if (selectedPhotoFile) {
                const pictureRef = storageRef(storage, `profile_pictures/${currentUser.uid}/${selectedPhotoFile.name}`);
                const uploadTask = uploadBytes(pictureRef, selectedPhotoFile)
                    .then(snapshot => getDownloadURL(snapshot.ref))
                    .then(downloadURL => {
                        updates.profile_picture = downloadURL;
                        return updateProfile(currentUser, { photoURL: downloadURL });
                    });
                tasks.push(uploadTask);
            }

            if (Object.keys(updates).length > 0) {
                tasks.push(update(dbRef(database, `users/${currentUser.uid}`), updates));
            }

            if (newPassword) {
                const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
                await reauthenticateWithCredential(currentUser, credential);
                await updatePassword(currentUser, newPassword);
            }

            await Promise.all(tasks);
            alert('Perfil actualizado correctamente.');
            redirectToDashboard();
        } catch (error) {
            console.error('Error updating profile:', error);
            alert(`Error: ${error.message}`);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Guardar Cambios';
            }
        }
    });
}
