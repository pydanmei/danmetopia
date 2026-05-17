import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

/* ================= FIREBASE ================= */
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
const db = getFirestore(app);

/* ================= CURRENT USER ================= */
window.currentUser = null;

onAuthStateChanged(auth, (user) => {
  window.currentUser = user || null;
});

/* ================= ROLE SYSTEM (GLOBAL FIX) ================= */
window.getRole = async (email) => {

  if (!email) return "guest";

  // 👑 ADMIN FIXED EMAILS
  if (
    email === "pydanmeii@gmail.com" ||
    email === "pepyl4298@gmail.com"
  ) {
    return "admin";
  }

  // 📦 CHECK GROUP IN FIRESTORE
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);

  if (!snap.empty) {
    return snap.docs[0].data().role; // group or custom role
  }

  // 👤 DEFAULT USER
  return "user";
};

/* ================= LOGIN ================= */
window.login = async (email, password) => {

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const role = await getRole(email);

    localStorage.setItem("user", JSON.stringify({
      email,
      role
    }));

    alert("Đăng nhập thành công: " + role);

    window.location.href = "home.html";

  } catch (e) {
    alert("Sai email hoặc mật khẩu");
  }
};

/* ================= REGISTER GROUP ================= */
window.registerGroup = async (email, password, groupName) => {

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      role: "group",
      groupName: groupName || ""
    });

    alert("Tạo nhóm dịch thành công");

  } catch (e) {
    alert("Lỗi tạo nhóm");
  }
};

/* ================= DISPLAY NAME ================= */
window.getDisplayName = () => {

  const data = JSON.parse(localStorage.getItem("user") || "{}");

  if (!data.email) return "Ẩn danh";

  if (data.role === "admin") {
    return "👑 " + data.email;
  }

  if (data.role === "group") {
    const g = localStorage.getItem("groupName");
    return g ? `${data.email} (${g})` : data.email;
  }

  return data.email;
};
