
import { auth, database, storage } from './firebase.js';
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref as dbRef, get, update } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const profileForm = document.getElementById('profile-form');
const profileNameInput = document.getElementById('profile-name');
const profileDepartmentInput = document.getElementById('profile-department');
const profilePictureInput = document.getElementById('profile-picture');
const submitButton = profileForm.querySelector('button[type="submit"]');

let currentUser;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const userDbRef = dbRef(database, 'users/' + user.uid);
        get(userDbRef).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (profileNameInput) {
                    profileNameInput.value = userData.username || '';
                }
                if (profileDepartmentInput) {
                    profileDepartmentInput.value = userData.department || 'Not specified';
                }
            }
        });
    } else {
        window.location.href = 'login.html';
    }
});

if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';

        const newName = profileNameInput.value.trim();
        const newPictureFile = profilePictureInput.files[0];

        if (!currentUser) {
            alert("You must be logged in to update your profile.");
            submitButton.disabled = false;
            submitButton.textContent = 'Save Changes';
            return;
        }

        const updatePromises = [];

        if (newPictureFile) {
            const pictureRef = storageRef(storage, `profile_pictures/${currentUser.uid}/${newPictureFile.name}`);
            const uploadPromise = uploadBytes(pictureRef, newPictureFile)
                .then(snapshot => getDownloadURL(snapshot.ref))
                .then(downloadURL => {
                    return updateProfile(currentUser, { photoURL: downloadURL });
                });
            updatePromises.push(uploadPromise);
        }

        const userDbRef = dbRef(database, 'users/' + currentUser.uid);
        const nameUpdatePromise = get(userDbRef).then(snapshot => {
            const currentName = snapshot.val()?.username || '';
            if (newName && newName !== currentName) {
                 return Promise.all([
                    updateProfile(currentUser, { displayName: newName }),
                    update(dbRef(database, `users/${currentUser.uid}`), {
                        username: newName
                    })
                 ]);
            }
        });
        updatePromises.push(nameUpdatePromise);

        Promise.all(updatePromises)
            .then(() => {
                alert("Profile updated successfully!");
                window.location.href = 'maindashboard.html';
            })
            .catch(error => {
                console.error("Error updating profile:", error);
                alert(`Error: ${error.message}`);
                submitButton.disabled = false;
                submitButton.textContent = 'Save Changes';
            });
    });
}
