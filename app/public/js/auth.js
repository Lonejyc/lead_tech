import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseApp } from "./firebase-init.js";

const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

const authGate = document.getElementById("auth-gate");
const appContent = document.getElementById("app-content");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userLabel = document.getElementById("user-label");

loginBtn.addEventListener("click", () => {
  signInWithPopup(auth, provider).catch(error => {
    console.error("Google sign-in failed:", error);
  });
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

onAuthStateChanged(auth, user => {
  if (user) {
    authGate.hidden = true;
    appContent.hidden = false;
    userLabel.textContent = `Connecté en tant que ${user.displayName || user.email}`;
  } else {
    authGate.hidden = false;
    appContent.hidden = true;
  }
});
