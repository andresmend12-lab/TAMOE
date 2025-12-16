
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDidzpojgcd8wMtFLXyXRmZMk6BHELEbSI",
  authDomain: "tamoe-86320208-a33cf.firebaseapp.com",
  projectId: "tamoe-86320208-a33cf",
  storageBucket: "tamoe-86320208-a33cf.appspot.com",
  messagingSenderId: "322898199328",
  appId: "1:322898199328:web:89c76af9513534ebf40d45"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export auth and database services
export const auth = getAuth(app);
export const database = getDatabase(app);
