import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDZvF5sKBaGwt9rGJc2awfgQV6qPeeqpBM",
  authDomain: "consultorio-diego.firebaseapp.com",
  projectId: "consultorio-diego",
  storageBucket: "consultorio-diego.firebasestorage.app",
  messagingSenderId: "891539781587",
  appId: "1:891539781587:web:da680d4fdd59e8aac1a126"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
