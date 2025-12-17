import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDidzpojgcd8wMtFLXyXRmZMk6BHELEbSI",
  authDomain: "tamoe-86320208-a33cf.firebaseapp.com",
  databaseURL: "https://tamoe-86320208-a33cf-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tamoe-86320208-a33cf",
  storageBucket: "tamoe-86320208-a33cf.appspot.com",
  messagingSenderId: "322898199328",
  appId: "1:322898199328:web:89c76af9513534ebf40d45"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);
export const firestore = getFirestore(app);
