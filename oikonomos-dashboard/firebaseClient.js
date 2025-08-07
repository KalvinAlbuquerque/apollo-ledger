// src/firebaseClient.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "oikonomos-app.firebaseapp.com",
  projectId: "oikonomos-app",
  storageBucket: "oikonomos-app.appspot.com",
  messagingSenderId: "...",
  appId: "1:..."
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços que você vai usar
export const auth = getAuth(app);
export const db = getFirestore(app);