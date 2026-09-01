import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyCIvTlTGG115yaWDeFqxi-Jc2oYH45FlME",
  authDomain: "ecni2-2026.firebaseapp.com",
  databaseURL: "https://ecni2-2026-default-rtdb.firebaseio.com",
  projectId: "ecni2-2026",
  storageBucket: "ecni2-2026.firebasestorage.app",
  messagingSenderId: "1046535202867",
  appId: "1:1046535202867:web:a23b26f739647f87221b46"
};

export const firebaseApp = initializeApp(firebaseConfig);
