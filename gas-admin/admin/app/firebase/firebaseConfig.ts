import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCNQ0Ltm-G89UgQJ8qxpxtONn6-9JMe4P8",
  authDomain: "gas-delivery-app-a8655.firebaseapp.com",
  projectId: "gas-delivery-app-a8655",
  storageBucket:  "gas-delivery-app-a8655.firebasestorage.app",
  messagingSenderId:"153428053314",
  appId: "1:153428053314:web:8a24c01ffecfd7416b8cdb",
  measurementId: "G-GYF3H551DB"
};

const app = initializeApp(firebaseConfig);

// Choose one depending on what you use
export const db = getFirestore(app);        // for Firestore
// export const db = getDatabase(app);      // for Realtime DBs