import { auth, db, ref, set, get, child, update, remove } from './db.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showNotification, showLoading, generateRandomGuestName, getUserData, getDisplayName, escapeHtml } from './utils.js';

// Session configuration
const SESSION_CONFIG = {
  guest: 60 * 60 * 1000,      // 1 hour
  user: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export let currentUserData = null;

// Set user session
export function setUserSession(userData) {
  if (!userData) return;
  const ttl = userData.role === "guest" ? SESSION_CONFIG.guest : SESSION_CONFIG.user;
  const session = {
    ...userData,
    savedAt: Date.now(),
    expireAt: Date.now() + ttl
  };
  localStorage.setItem("userSession", JSON.stringify(session));
}

// Refresh user session
export function refreshUserSession() {
  const sessionStr = localStorage.getItem("userSession");
  if (!sessionStr) return false;
  
  const session = JSON.parse(sessionStr);
  if (!session.expireAt || Date.now() > session.expireAt) {
    localStorage.removeItem("userSession");
    return false;
  }
  
  const ttl = session.role === "guest" ? SESSION_CONFIG.guest : SESSION_CONFIG.user;
  session.savedAt = Date.now();
  session.expireAt = Date.now() + ttl;
  localStorage.setItem("userSession", JSON.stringify(session));
  
  if (session.role !== "guest") {
    currentUserData = session;
  } else {
    currentUserData = session;
  }
  return true;
}

// Check if session is valid
export function isSessionValid() {
  const sessionStr = localStorage.getItem("userSession");
  if (!sessionStr) return false;
  
  const session = JSON.parse(sessionStr);
  if (!session.expireAt || Date.now() > session.expireAt) {
    localStorage.removeItem("userSession");
    return false;
  }
  return true;
}

// Load user data
export async function loadUserData(uid, email) {
  const userData = await getUserData(uid);
  const displayName = await getDisplayName(uid, email, userData);
  return {
    uid, email,
    role: userData?.role || "user",
    privileges: userData?.privileges || { moderator: false, groupId: null },
    nickname: userData?.nickname,
    displayName: displayName
  };
}

// Create new user
async function createNewUser(uid, email, nickname) {
  const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
  const isAdminEmail = ADMIN_EMAILS.includes(email);
  await set(ref(db, `users/${uid}`), {
    email, nickname,
    role: isAdminEmail ? "admin" : "user",
    privileges: { moderator: false, groupId: null },
    follows: {}, history: [], genrePref: {}, strike: 0, bannedUntil: 0,
    createdAt: Date.now()
  });
}

// OTP Functions
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(email) {
  const otp = generateOTP();
  await set(ref(db, `otp_requests/${email.replace(/\./g, "_")}`), {
    code: otp,
    expires: Date.now() + 5 * 60 * 1000
  });
  try {
    await emailjs.send("service_8bxh5mm", "template_8ahbuhu", { otp: otp, to_email: email });
    showNotification("📩 Mã OTP đã gửi đến email của bạn");
    return true;
  } catch (error) {
    console.error("EmailJS error:", error);
    showNotification(`⚠️ Mã OTP demo: ${otp}`, true);
    return true;
  }
}

async function verifyOTP(email, inputCode) {
  const snap = await get(ref(db, `otp_requests/${email.replace(/\./g, "_")}`));
  const data = snap.val();
  if (!data) return { success: false, message: "Mã OTP không tồn tại" };
  if (Date.now() > data.expires) return { success: false, message: "Mã OTP đã hết hạn" };
  if (data.code !== inputCode) return { success: false, message: "Sai mã OTP" };
  await remove(ref(db, `otp_requests/${email.replace(/\./g, "_")}`));
  return { success: true };
}

async function checkEmailExists(email) {
  const usersSnap = await get(ref(db, "users"));
  const users = usersSnap.val() || {};
  for (const uid in users) {
    if (users[uid].email === email) return true;
  }
  return false;
}

// Authentication handlers
export async function handleGuestLogin() {
  const guestName = generateRandomGuestName();
  currentUserData = { role: "guest", displayName: guestName, nickname: guestName };
  setUserSession(currentUserData);
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainContainer").style.display = "block";
  showNotification(`👤 Chào mừng ${guestName} (Khách)`);
  
  // Dispatch event for app to know login completed
  window.dispatchEvent(new CustomEvent('user-logged-in', { detail: currentUserData }));
}

export async function handleCheckEmail() {
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) { showNotification("Nhập email", true); return; }
  
  const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
  const isAdminEmail = ADMIN_EMAILS.includes(email);
  showLoading(true);
  const emailExists = await checkEmailExists(email);
  showLoading(false);
  
  window.pendingRegisterEmail = email;
  
  if (isAdminEmail) {
    document.getElementById("passwordGroup").style.display = "block";
    document.getElementById("otpGroup").style.display = "none";
    document.getElementById("loginMsg").innerHTML = "👑 Email Admin, vui lòng nhập mật khẩu";
    return;
  }
  
  if (emailExists) {
    document.getElementById("passwordGroup").style.display = "block";
    document.getElementById("otpGroup").style.display = "none";
    document.getElementById("loginMsg").innerHTML = "";
  } else {
    await sendOTPEmail(email);
    document.getElementById("otpGroup").style.display = "block";
    document.getElementById("passwordGroup").style.display = "none";
    document.getElementById("loginMsg").innerHTML = "📩 Mã OTP đã gửi, vui lòng kiểm tra email";
  }
}

export async function handleVerifyOTP() {
  const otp = document.getElementById("otpCode").value.trim();
  if (!otp || otp.length !== 6) { showNotification("Nhập mã OTP 6 số", true); return; }
  showLoading(true);
  const result = await verifyOTP(window.pendingRegisterEmail, otp);
  showLoading(false);
  if (!result.success) { showNotification(result.message, true); return; }
  document.getElementById("verifiedEmail").innerText = window.pendingRegisterEmail;
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("registerPage").style.display = "flex";
}

export async function handlePasswordLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) { showNotification("Nhập email và mật khẩu", true); return; }
  showLoading(true);
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await loadUserData(userCred.user.uid, email);
    currentUserData = userData;
    setUserSession(currentUserData);
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    showNotification(`✅ Chào mừng ${currentUserData.displayName}`);
    window.dispatchEvent(new CustomEvent('user-logged-in', { detail: currentUserData }));
  } catch (err) {
    if (err.code === "auth/invalid-credential") {
      const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
      const isAdminEmail = ADMIN_EMAILS.includes(email);
      if (isAdminEmail) {
        const confirmCreate = confirm("Email Admin chưa có tài khoản. Bạn có muốn tạo tài khoản Admin mới không?");
        if (confirmCreate) {
          window.pendingRegisterEmail = email;
          document.getElementById("verifiedEmail").innerText = email;
          document.getElementById("loginPage").style.display = "none";
          document.getElementById("registerPage").style.display = "flex";
        } else {
          showNotification("Vui lòng tạo tài khoản Admin", true);
        }
      } else {
        showNotification("Sai email hoặc mật khẩu", true);
      }
    } else {
      showNotification("Lỗi: " + err.message, true);
    }
  } finally { showLoading(false); }
}

export async function handleCompleteRegistration() {
  const nickname = document.getElementById("nicknameInput").value.trim();
  const password = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmPassword").value;
  const msg = document.getElementById("registerMsg");
  if (!nickname) { msg.innerText = "Nhập nickname"; return; }
  if (!password || password.length < 6) { msg.innerText = "Mật khẩu phải có ít nhất 6 ký tự"; return; }
  if (password !== confirm) { msg.innerText = "Mật khẩu không khớp"; return; }
  showLoading(true);
  try {
    const userCred = await createUserWithEmailAndPassword(auth, window.pendingRegisterEmail, password);
    await createNewUser(userCred.user.uid, window.pendingRegisterEmail, nickname);
    const userData = await loadUserData(userCred.user.uid, window.pendingRegisterEmail);
    currentUserData = userData;
    setUserSession(currentUserData);
    document.getElementById("registerPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    showNotification(`🎉 Chào mừng ${nickname}!`);
    window.dispatchEvent(new CustomEvent('user-logged-in', { detail: currentUserData }));
  } catch (err) {
    msg.innerText = "Lỗi: " + err.message;
  } finally { showLoading(false); }
}

export async function restoreSession() {
  if (!isSessionValid()) {
    localStorage.removeItem("userSession");
    return false;
  }
  
  const session = JSON.parse(localStorage.getItem("userSession"));
  
  if (session.role === "guest") {
    currentUserData = session;
    document.getElementById("warningOverlay").style.display = "none";
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    window.dispatchEvent(new CustomEvent('user-logged-in', { detail: currentUserData }));
    return true;
  } else if (session.uid) {
    currentUserData = await loadUserData(session.uid, session.email);
    setUserSession(currentUserData);
    document.getElementById("warningOverlay").style.display = "none";
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    window.dispatchEvent(new CustomEvent('user-logged-in', { detail: currentUserData }));
    return true;
  }
  return false;
}

export async function logout() {
  await signOut(auth);
  localStorage.removeItem("userSession");
  window.location.reload();
}
