<script type="module">
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
  getDoc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

/* ===== FIREBASE CONFIG ===== */
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

/* ================= ROLE SYSTEM ================= */
async function getRole(email){

  if(email === "pydanmeii@gmail.com") return "admin";

  const q = query(collection(db,"users"), where("email","==",email));
  const snap = await getDocs(q);

  if(!snap.empty){
    return snap.docs[0].data().role;
  }

  return "user";
}
/* ================= LOGIN SYSTEM ================= */
window.loginApp = async (pass) => {

  if (pass !== "danmei") {
    alert("Sai mật khẩu");
    return;
};
/* ================= LOGIN ================= */
window.login = async (email, pass)=>{

  const userCred = await signInWithEmailAndPassword(auth, email, pass);

  const role = await getRole(email);

  localStorage.setItem("user", JSON.stringify({
    email,
    role
  }));

  alert("Đăng nhập: " + role);

  window.location.href = "home.html";
};

/* ================= REGISTER GROUP ================= */
window.registerGroup = async (email, password, groupName)=>{

  const userCred = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(doc(db,"users",userCred.user.uid),{
    email,
    role:"group",
    groupName
  });

  alert("Tạo group thành công");
};

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
