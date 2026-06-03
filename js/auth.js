import { auth, db, ref, set, get, update, remove, push } from "./firebase-config.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showNotification, showLoading, generateRandomGuestName, isNicknameExists, escapeHtml } from "./utils.js";
import { state } from "./state.js";

emailjs.init("fPq8fpw1OqzOtj-lk");

const SESSION_CONFIG = { guest: 60 * 60 * 1000, user: 7 * 24 * 60 * 60 * 1000 };
let pendingRegisterEmail = null, pendingRegisterIsAdmin = false;

export function setUserSession(userData) {
  if (!userData) return;
  const ttl = userData.role === "guest" ? SESSION_CONFIG.guest : SESSION_CONFIG.user;
  localStorage.setItem("userSession", JSON.stringify({ ...userData, savedAt: Date.now(), expireAt: Date.now() + ttl }));
}

export function refreshUserSession() {
  const sessionStr = localStorage.getItem("userSession");
  if (!sessionStr) return false;
  try {
    const session = JSON.parse(sessionStr);
    if (!session.expireAt || Date.now() > session.expireAt) {
      localStorage.removeItem("userSession");
      return false;
    }
    const ttl = session.role === "guest" ? SESSION_CONFIG.guest : SESSION_CONFIG.user;
    session.savedAt = Date.now();
    session.expireAt = Date.now() + ttl;
    localStorage.setItem("userSession", JSON.stringify(session));
    state.currentUser = session;
    return true;
  } catch { return false; }
}

export function clearMainPasswordSession() { localStorage.removeItem("mainPasswordExpiry"); }
export function isMainPasswordValid() {
  const expiry = localStorage.getItem("mainPasswordExpiry");
  return expiry && Date.now() < parseInt(expiry);
}

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

async function sendOTPEmail(email) {
  const otp = generateOTP();
  await set(ref(db, `otp_requests/${email.replace(/\./g, "_")}`), { code: otp, expires: Date.now() + 5 * 60 * 1000 });
  try {
    await emailjs.send("service_8bxh5mm", "template_8ahbuhu", { otp: otp, to_email: email });
    showNotification("📩 Mã OTP đã gửi đến email của bạn");
  } catch { showNotification(`⚠️ Mã OTP demo: ${otp}`, true); }
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
  for (const uid in users) if (users[uid].email === email) return true;
  return false;
}

async function createNewUser(uid, email, nickname, password) {
  const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
  const isAdminEmail = ADMIN_EMAILS.includes(email);
  await set(ref(db, `users/${uid}`), {
    email, nickname, role: isAdminEmail ? "admin" : "user",
    privileges: { moderator: false, groupId: null }, follows: {}, history: {}, createdAt: Date.now()
  });
}

async function loadUserData(uid, email) {
  const snap = await get(ref(db, `users/${uid}`));
  const userData = snap.exists() ? snap.val() : null;
  const nickname = userData?.nickname || email?.split("@")[0] || "Người dùng";
  let displayName = nickname;
  if (userData?.role === "admin") displayName = `${nickname} (Admin)`;
  else if (userData?.privileges?.moderator) displayName = `${nickname} (Quản lý)`;
  else if (userData?.privileges?.groupId) {
    const groupSnap = await get(ref(db, `groups/${userData.privileges.groupId}`));
    if (groupSnap.exists()) displayName = `${nickname} (${groupSnap.val().groupName})`;
  }
  return { uid, email, role: userData?.role || "user", privileges: userData?.privileges || { moderator: false, groupId: null }, nickname, displayName, avatar: userData?.avatar };
}

export async function handleWarningContinue() {
  const mainPass = document.getElementById("mainPassword").value;
  if (mainPass !== "danmei") { showNotification("❌ Sai mật khẩu chính!", true); return; }
  localStorage.setItem("mainPasswordExpiry", (Date.now() + 24 * 60 * 60 * 1000).toString());
  document.getElementById("warningOverlay").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
}

export async function handleGuestLogin() {
  const guestName = generateRandomGuestName();
  state.currentUser = { role: "guest", displayName: guestName, nickname: "", uid: null };
  setUserSession(state.currentUser);
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainContainer").style.display = "block";
  showNotification(`👤 Chào mừng ${state.currentUser.displayName} (Khách)`);
  updateUserDisplay();
}

export async function handleCheckEmail() {
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) { showNotification("Nhập email", true); return; }
  const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
  const isAdminEmail = ADMIN_EMAILS.includes(email);
  showLoading(true);
  const emailExists = await checkEmailExists(email);
  showLoading(false);
  pendingRegisterEmail = email;
  pendingRegisterIsAdmin = isAdminEmail;
  if (emailExists) {
    document.getElementById("passwordGroup").style.display = "block";
    document.getElementById("otpGroup").style.display = "none";
    document.getElementById("loginMsg").innerHTML = "🔐 Nhập mật khẩu đã tạo khi đăng ký";
    return;
  }
  if (isAdminEmail) {
    document.getElementById("verifiedEmail").innerText = email;
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("registerPage").style.display = "flex";
    document.getElementById("registerMsg").innerHTML = "👑 Email Admin, vui lòng tạo tài khoản";
    return;
  }
  await sendOTPEmail(email);
  document.getElementById("otpGroup").style.display = "block";
  document.getElementById("passwordGroup").style.display = "none";
  document.getElementById("loginMsg").innerHTML = "📩 Mã OTP đã gửi, vui lòng kiểm tra email";
}

export async function handleVerifyOTP() {
  const otp = document.getElementById("otpCode").value.trim();
  if (!otp || otp.length !== 6) { showNotification("Nhập mã OTP 6 số", true); return; }
  showLoading(true);
  const result = await verifyOTP(pendingRegisterEmail, otp);
  showLoading(false);
  if (!result.success) { showNotification(result.message, true); return; }
  document.getElementById("verifiedEmail").innerText = pendingRegisterEmail;
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("registerPage").style.display = "flex";
  document.getElementById("registerMsg").innerHTML = "✅ Email đã xác nhận! Tạo tài khoản mới.";
}

export async function handlePasswordLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) { showNotification("Nhập email và mật khẩu", true); return; }
  showLoading(true);
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await loadUserData(userCred.user.uid, email);
    state.currentUser = userData;
    setUserSession(state.currentUser);
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    showNotification(`✅ Chào mừng ${state.currentUser.displayName}`);
    updateUserDisplay();
  } catch (err) {
    if (err.code === "auth/invalid-credential") showNotification("Sai mật khẩu", true);
    else showNotification("Lỗi: " + err.message, true);
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
  const nicknameExists = await isNicknameExists(nickname);
  if (nicknameExists && !pendingRegisterIsAdmin) { msg.innerText = "❌ Nickname đã tồn tại! Vui lòng chọn nickname khác."; return; }
  showLoading(true);
  try {
    const userCred = await createUserWithEmailAndPassword(auth, pendingRegisterEmail, password);
    await createNewUser(userCred.user.uid, pendingRegisterEmail, nickname, password);
    const userData = await loadUserData(userCred.user.uid, pendingRegisterEmail);
    state.currentUser = userData;
    setUserSession(state.currentUser);
    document.getElementById("registerPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    showNotification(`🎉 Chào mừng ${nickname}!`);
    updateUserDisplay();
  } catch (err) { msg.innerText = "Lỗi: " + err.message; }
  finally { showLoading(false); }
}

export async function restoreSession() {
  if (!isMainPasswordValid()) { clearMainPasswordSession(); return false; }
  const sessionStr = localStorage.getItem("userSession");
  if (!sessionStr) return false;
  try {
    const session = JSON.parse(sessionStr);
    if (!session.expireAt || Date.now() > session.expireAt) { localStorage.removeItem("userSession"); return false; }
    if (session.role === "guest") { state.currentUser = session; return true; }
    else if (session.uid) {
      const userSnap = await get(ref(db, `users/${session.uid}`));
      if (userSnap.exists()) { state.currentUser = { ...session, ...userSnap.val() }; return true; }
    }
    return false;
  } catch { return false; }
}

export async function logout() {
  try { await signOut(auth); } catch(e) {}
  localStorage.removeItem("userSession");
  window.location.reload();
}

function updateUserDisplay() {
  const userDisplay = document.getElementById("userDisplay");
  const profileBtn = document.getElementById("profileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const adminLink = document.getElementById("adminLink");
  const groupsLink = document.getElementById("groupsLink");
  const createGroupBtn = document.getElementById("createGroupBtn");
  if (!userDisplay) return;
  if (!state.currentUser || state.currentUser.role === "guest") {
    userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser?.displayName || "Guest")}`;
    if (profileBtn) profileBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (adminLink) adminLink.style.display = "none";
    if (groupsLink) groupsLink.style.display = "inline-block";
    if (createGroupBtn) createGroupBtn.style.display = "none";
  } else {
    if (state.currentUser?.avatar) {
      userDisplay.innerHTML = `<img src="${state.currentUser.avatar}" style="width:28px; height:28px; border-radius:50%; object-fit:cover; margin-right:8px;"> ${escapeHtml(state.currentUser.displayName)}`;
    } else {
      userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser.displayName)}`;
    }
    if (profileBtn) profileBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (adminLink) adminLink.style.display = isAdmin(state.currentUser) ? "inline-block" : "none";
    if (groupsLink) groupsLink.style.display = "inline-block";
    if (createGroupBtn) createGroupBtn.style.display = !hasGroup(state.currentUser) ? "inline-block" : "none";
  }
}
