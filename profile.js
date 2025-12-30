import { auth, database, storage } from './firebase.js';
import { onAuthStateChanged, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref as dbRef, get, update } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const profileForm = document.getElementById('profile-form');
const profileNameInput = document.getElementById('profile-name');
const profileEmailInput = document.getElementById('profile-email');
const profileDepartmentInput = document.getElementById('profile-department');
const profilePictureInput = document.getElementById('profile-picture');
const avatarCircle = document.getElementById('avatar-circle');
const avatarInitials = document.getElementById('avatar-initials');
const nameDisplay = document.getElementById('profile-name-display');
const departmentDisplay = document.getElementById('profile-department-display');
const removePhotoButton = document.getElementById('remove-photo-button');
const closeButton = document.getElementById('close-profile');
const cancelButton = document.getElementById('cancel-profile');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const submitButton = profileForm ? profileForm.querySelector('button[type="submit"]') : null;

let currentUser;
let cachedUserData = null;
let selectedPhotoFile = null;
let currentPhotoUrl = '';
let removePhotoRequested = false;
let photoToDeleteUrl = '';

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

const syncRemovePhotoButton = () => {
    if (!removePhotoButton) return;
    const hasPhoto = Boolean(currentPhotoUrl) || Boolean(selectedPhotoFile);
    removePhotoButton.classList.toggle('hidden', !hasPhoto);
    removePhotoButton.disabled = !hasPhoto;
    removePhotoButton.classList.toggle('opacity-50', !hasPhoto);
    removePhotoButton.classList.toggle('cursor-not-allowed', !hasPhoto);
};

const uploadProfilePhoto = async (file, uid) => {
    if (!file || !uid) return '';
    const fileName = String(file.name || 'profile').trim() || 'profile';
    const timestamp = Date.now();
    const path = `profile_pictures/${uid}/${timestamp}-${fileName}`;
    const metadata = file.type ? { contentType: file.type } : undefined;
    const pictureRef = storageRef(storage, path);
    const snapshot = await uploadBytes(pictureRef, file, metadata);
    return getDownloadURL(snapshot.ref);
};

const deleteProfilePhoto = async (photoUrl) => {
    const url = String(photoUrl || '').trim();
    if (!url) return;
    try {
        await deleteObject(storageRef(storage, url));
    } catch (error) {
        console.warn('No se pudo borrar la foto anterior:', error);
    }
};

const getSelectedPhotoFile = () => (
    selectedPhotoFile || profilePictureInput?.files?.[0] || null
);

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
                currentPhotoUrl = photoURL;
                removePhotoRequested = false;
                photoToDeleteUrl = '';

                if (profileNameInput) profileNameInput.value = name;
                if (profileDepartmentInput) profileDepartmentInput.value = department;
                if (nameDisplay) nameDisplay.textContent = name || 'Sin nombre';
                if (departmentDisplay) departmentDisplay.textContent = department || '--';
                setAvatar(photoURL, name, user.email);
                syncRemovePhotoButton();
            } else {
                cachedUserData = {};
                currentPhotoUrl = user.photoURL || '';
                removePhotoRequested = false;
                photoToDeleteUrl = '';
                if (nameDisplay) nameDisplay.textContent = user.displayName || 'Sin nombre';
                if (departmentDisplay) departmentDisplay.textContent = '--';
                setAvatar(user.photoURL, user.displayName, user.email);
                syncRemovePhotoButton();
            }
        });
    } else {
        window.location.href = 'login.html';
    }
});

const triggerPhotoPicker = () => {
    profilePictureInput?.click();
};

avatarCircle?.addEventListener('click', triggerPhotoPicker);

profilePictureInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    selectedPhotoFile = file;
    removePhotoRequested = false;
    photoToDeleteUrl = '';
    const previewURL = URL.createObjectURL(file);
    setAvatar(previewURL, profileNameInput?.value, profileEmailInput?.value);
    syncRemovePhotoButton();
});

removePhotoButton?.addEventListener('click', () => {
    if (!currentPhotoUrl && !selectedPhotoFile) return;
    removePhotoRequested = true;
    photoToDeleteUrl = currentPhotoUrl;
    currentPhotoUrl = '';
    selectedPhotoFile = null;
    if (profilePictureInput) profilePictureInput.value = '';
    setAvatar('', profileNameInput?.value, profileEmailInput?.value);
    syncRemovePhotoButton();
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
        const photoFile = getSelectedPhotoFile();

        if (photoFile && !String(photoFile.type || '').startsWith('image/')) {
            alert('La foto debe ser una imagen valida.');
            return;
        }

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

            if (removePhotoRequested) {
                updates.profile_picture = '';
                tasks.push(updateProfile(currentUser, { photoURL: '' }));
                if (photoToDeleteUrl) {
                    tasks.push(deleteProfilePhoto(photoToDeleteUrl));
                }
            } else if (photoFile) {
                const downloadURL = await uploadProfilePhoto(photoFile, currentUser.uid);
                if (downloadURL) {
                    updates.profile_picture = downloadURL;
                    tasks.push(updateProfile(currentUser, { photoURL: downloadURL }));
                }
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
            selectedPhotoFile = null;
            if (profilePictureInput) profilePictureInput.value = '';
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
