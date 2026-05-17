import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDQk9DlMNKwn_508fDMI_3IB_dgpgHujA",
  authDomain: "danmetopia.firebaseapp.com",
  projectId: "danmetopia",
  storageBucket: "danmetopia.appspot.com",
  messagingSenderId: "178240377870",
  appId: "1:178240377870:web:d094b222ebabadccc5585f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* ================= LOGIN SYSTEM ================= */
window.loginApp = async (email, pass) => {

  if (pass !== "danmei") {
    alert("Sai mật khẩu");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    // user đã tồn tại → bỏ qua
  }

  await signInWithEmailAndPassword(auth, email, pass);

};

/* ================= USER STATE ================= */
window.currentUser = null;

onAuthStateChanged(auth, (user) => {
  window.currentUser = user;
});

/* ================= ROLE SYSTEM ================= */
window.getRole = () => {

  const email = window.currentUser?.email || "";

  // 🔥 ADMIN
  if (email === "pydanmeii@gmail.com") return "admin";

  // 🔥 GROUP (nhóm dịch)
  if (email.includes("@group")) return "group";

  // 🔥 USER
  return "user";
};

/* ================= USER DISPLAY NAME ================= */
window.getDisplayName = () => {

  const email = window.currentUser?.email || "";

  if (!email) return "Anonymous";

  const groupName = localStorage.getItem("groupName");

  if (getRole() === "group") {
    return groupName ? `${email} (${groupName})` : email;
  }

  return email;
};
