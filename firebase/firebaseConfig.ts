import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ✅ Define AND export config here
export const firebaseConfig = {
  apiKey: "AIzaSyCNQ0Ltm-G89UgQJ8qxpxtONn6-9JMe4P8",
  authDomain: "gas-delivery-app-a8655.firebaseapp.com",
  projectId: "gas-delivery-app-a8655",
  storageBucket: "gas-delivery-app-a8655.appspot.com",
  messagingSenderId: "153428053314",
  appId: "1:153428053314:web:8a24c01ffecfd7416b8cdb",
  measurementId: "G-GYF3H551DB"
};

// ✅ Use config to initialize
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// ✅ Export both
export { app };
export const db = getFirestore(app);