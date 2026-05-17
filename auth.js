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

/* ================= LOGIN ================= */
window.loginApp = async (email, pass)=>{

  if(pass !== "danmei"){
    alert("Sai mật khẩu");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
  } catch(e){
    // user đã tồn tại thì bỏ qua
  }

  await signInWithEmailAndPassword(auth, email, pass);

}

/* ================= CURRENT USER ================= */
window.currentUser = null;

onAuthStateChanged(auth,(user)=>{
  window.currentUser = user;
});

/* ================= ROLE ================= */
window.getRole = ()=>{
  const email = window.currentUser?.email || "";

  if(email === "admin@danmei.com") return "admin";

  if(email.includes("@group")) return "group";

  return "user";
}
