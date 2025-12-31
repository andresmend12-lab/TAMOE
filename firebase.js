import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js";

// ============================================
// FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDidzpojgcd8wMtFLXyXRmZMk6BHELEbSI",
  authDomain: "tamoe-86320208-a33cf.firebaseapp.com",
  databaseURL: "https://tamoe-86320208-a33cf-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tamoe-86320208-a33cf",
  storageBucket: "tamoe-86320208-a33cf.firebasestorage.app",
  messagingSenderId: "322898199328",
  appId: "1:322898199328:web:89c76af9513534ebf40d45"
};

// ============================================
// INITIALIZE FIREBASE APP
// ============================================

export const app = initializeApp(firebaseConfig);

// ============================================
// FIREBASE APP CHECK (Security)
// ============================================

// App Check helps protect your backend resources from abuse
// Configure your reCAPTCHA v3 site key in Firebase Console:
// Project Settings > App Check > Register your app
//
// IMPORTANT: Replace 'YOUR_RECAPTCHA_V3_SITE_KEY' with your actual site key
// Get it from: https://www.google.com/recaptcha/admin
//
// For development/testing, you can enable debug mode:
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

const RECAPTCHA_SITE_KEY = 'YOUR_RECAPTCHA_V3_SITE_KEY'; // TODO: Replace with actual key

// Only initialize App Check if we have a valid site key
if (RECAPTCHA_SITE_KEY !== 'YOUR_RECAPTCHA_V3_SITE_KEY') {
  try {
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
    console.log('Firebase App Check initialized');
  } catch (error) {
    console.warn('Firebase App Check initialization failed:', error);
  }
} else {
  console.warn(
    'Firebase App Check not configured. ' +
    'To enable, replace YOUR_RECAPTCHA_V3_SITE_KEY in firebase.js with your actual reCAPTCHA v3 site key.'
  );
}

// ============================================
// FIREBASE SERVICES
// ============================================

export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);
export const firestore = getFirestore(app);

// ============================================
// DEBUG HELPERS (Development Only)
// ============================================

// Enable App Check debug mode in development
// Uncomment the following line when testing locally:
// if (location.hostname === 'localhost') {
//   self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
// }
