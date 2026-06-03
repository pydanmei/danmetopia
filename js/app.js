// ==================== FIREBASE CONFIG ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, push, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDQk9DlMNKwn_508fDMI_3IB_dgpgHujA",
  authDomain: "danmetopia.firebaseapp.com",
  projectId: "danmetopia",
  databaseURL: "https://danmetopia-default-rtdb.asia-southeast1.firebasedatabase.app/",
  storageBucket: "danmetopia.appspot.com",
  messagingSenderId: "178240377870",
  appId: "1:178240377870:web:d094b222ebabadccc5585f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const IMGBB_API_KEY = "d16b5595d7f6044476d254c8f428cc28";

emailjs.init("fPq8fpw1OqzOtj-lk");

// ==================== GENRE LIST (33 THỂ LOẠI) ====================
const GENRE_LIST = [
  "3D", "Action", "Bara/Muscle", "Biography", "Cakeverse", "Comedy",
  "Crime", "Documentary", "Dom/Sub verse", "Drama", "Family", "Fantasy",
  "Furry", "HET/Hentai", "Historical", "Horror", "Music", "Mystery",
  "Omegaverse", "Psychological", "Romance", "School Life", "Sci-fi",
  "Shounen Ai", "Slice of Life", "Sports", "Supernatural", "Thriller",
  "Tragedy", "War", "Wuxia", "Yaoi", "Yuri"
];

const GENRE_SET = new Set(GENRE_LIST);

// Hàm tách thể loại và tags từ input gộp
function parseGenresAndTags(input) {
  if (!input || input.trim() === "") return { genres: "", tags: "" };
  let keywords = [];
  if (input.includes(",")) {
    keywords = input.split(",").map(k => k.trim()).filter(k => k);
  } else {
    keywords = input.split(" ").map(k => k.trim()).filter(k => k);
  }
  const genres = [];
  const tags = [];
  for (const kw of keywords) {
    if (GENRE_SET.has(kw)) {
      genres.push(kw);
    } else {
      tags.push(kw);
    }
  }
  return {
    genres: genres.join(", "),
    tags: tags.join(", ")
  };
}

// Hàm tạo slug từ tiêu đề
function generateSlug(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Loại bỏ dấu tiếng Việt
    .replace(/[^a-z0-9\s-]/g, "")                     // Loại bỏ ký tự đặc biệt
    .trim()
    .replace(/\s+/g, "-")                             // Thay khoảng trắng bằng dấu gạch ngang
    .replace(/-+/g, "-");                             // Loại bỏ dấu gạch ngang thừa
}

// ==================== STATE & ROUTER ====================
const state = {
  currentUser: null,
  stories: [],
  allGroups: [],
  userFollows: {},
  readingHistory: [],
  bookmarks: [],
  currentTab: "all",
  selectedGenre: "",
  searchKeyword: "",
  sortBy: "likes"
};

// Router: xử lý URL dạng /truyen/slug/ hoặc /truyen/slug/chuong-1/
function initRouter() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const parts = hash.split("/");
  if (parts[0] === "truyen" && parts[1]) {
    const storySlug = parts[1];
    const story = state.stories.find(s => s.slug === storySlug);
    if (story) {
      if (parts[2] && parts[2].startsWith("chuong-")) {
        const chapterNum = parseInt(parts[2].replace("chuong-", "")) || 1;
        window.openReader(story.id, chapterNum - 1);
      } else {
        window.openStoryDetail(story.id);
      }
    }
  }
}

window.addEventListener("hashchange", initRouter);

// ==================== HELPER FUNCTIONS ====================
function showNotification(msg, isError = false) {
  const notif = document.createElement("div");
  notif.className = "notification";
  notif.style.background = isError ? "#ff4444" : "#FF69B4";
  notif.style.color = "black";
  notif.innerText = msg;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function showLoading(show) {
  let spinner = document.getElementById("globalSpinner");
  if (show) {
    if (!spinner) {
      spinner = document.createElement("div");
      spinner.id = "globalSpinner";
      spinner.className = "spinner-overlay";
      spinner.innerHTML = '<div class="loading-spinner"></div>';
      document.body.appendChild(spinner);
    }
    spinner.style.display = "flex";
  } else {
    if (spinner) spinner.style.display = "none";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, m => m === "&" ? "&amp;" : m === "<" ? "&lt;" : "&gt;");
}

function generateRandomGuestName() {
  return `Hủ nằm vùng ${Math.floor(Math.random() * 10000)}`;
}

function isAdmin(userData) { return userData?.role === "admin"; }
function isModerator(userData) { return userData?.role === "user" && userData?.privileges?.moderator === true; }
function canModerate(userData) { return isAdmin(userData) || isModerator(userData); }
function canUpload(userData) { return userData && (userData.role === "admin" || userData.role === "user"); }
function hasGroup(userData) { return userData?.privileges?.groupId !== null; }

// ==================== SESSION ====================
const SESSION_CONFIG = { guest: 60 * 60 * 1000, user: 7 * 24 * 60 * 60 * 1000 };

function setUserSession(userData) {
  if (!userData) return;
  const ttl = userData.role === "guest" ? SESSION_CONFIG.guest : SESSION_CONFIG.user;
  localStorage.setItem("userSession", JSON.stringify({ ...userData, savedAt: Date.now(), expireAt: Date.now() + ttl }));
}

function refreshUserSession() {
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

function clearMainPasswordSession() { localStorage.removeItem("mainPasswordExpiry"); }
function isMainPasswordValid() {
  const expiry = localStorage.getItem("mainPasswordExpiry");
  return expiry && Date.now() < parseInt(expiry);
}

// ==================== CHECK NICKNAME EXISTS ====================
async function isNicknameExists(nickname) {
  const usersSnap = await get(ref(db, "users"));
  const users = usersSnap.val() || {};
  for (const uid in users) if (users[uid].nickname === nickname) return true;
  return false;
}

// ==================== AUTH ====================
let pendingRegisterEmail = null, pendingRegisterIsAdmin = false;

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

// ==================== AUTH HANDLERS ====================
async function handleWarningContinue() {
  const mainPass = document.getElementById("mainPassword").value;
  if (mainPass !== "danmei") { showNotification("❌ Sai mật khẩu chính!", true); return; }
  localStorage.setItem("mainPasswordExpiry", (Date.now() + 24 * 60 * 60 * 1000).toString());
  document.getElementById("warningOverlay").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
}

async function handleGuestLogin() {
  const guestName = generateRandomGuestName();
  state.currentUser = { role: "guest", displayName: guestName, nickname: "", uid: null };
  setUserSession(state.currentUser);
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainContainer").style.display = "block";
  showNotification(`👤 Chào mừng ${state.currentUser.displayName} (Khách)`);
  updateUserDisplay();
  initApp();
}

async function handleCheckEmail() {
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

async function handleVerifyOTP() {
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

async function handlePasswordLogin() {
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
    initApp();
  } catch (err) {
    if (err.code === "auth/invalid-credential") showNotification("Sai mật khẩu", true);
    else showNotification("Lỗi: " + err.message, true);
  } finally { showLoading(false); }
}

async function handleCompleteRegistration() {
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
    initApp();
  } catch (err) { msg.innerText = "Lỗi: " + err.message; }
  finally { showLoading(false); }
}

async function restoreSession() {
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

async function logout() {
  try { await signOut(auth); } catch(e) {}
  localStorage.removeItem("userSession");
  window.location.reload();
}

// ==================== UPDATE UI ====================
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

// ==================== LOAD DATA ====================
async function loadAllGroups() {
  try {
    const groupsSnap = await get(ref(db, "groups"));
    state.allGroups = groupsSnap.exists() ? Object.entries(groupsSnap.val()).map(([id, g]) => ({ id, ...g })) : [];
    return state.allGroups;
  } catch (err) { state.allGroups = []; return []; }
}

async function getUserGroups(uid) {
  if (!uid) return [];
  if (state.allGroups.length === 0) await loadAllGroups();
  return state.allGroups.filter(group => group.members?.includes(uid));
}

async function getUserGroupOptions() {
  if (!state.currentUser || state.currentUser.role === "guest") return [];
  return await getUserGroups(state.currentUser.uid);
}

async function loadFollows() {
  if (!state.currentUser || state.currentUser.role === "guest") return;
  const snapshot = await get(ref(db, `users/${state.currentUser.uid}/follows`));
  state.userFollows = snapshot.val() || {};
}

async function followStory(storyId) {
  if (!state.currentUser || state.currentUser.role === "guest") { showNotification("Đăng nhập để theo dõi", true); return false; }
  if (!state.userFollows[storyId]) {
    state.userFollows[storyId] = true;
    await set(ref(db, `users/${state.currentUser.uid}/follows`), state.userFollows);
    showNotification("✅ Đã theo dõi truyện");
  }
}

async function unfollowStory(storyId) {
  if (state.userFollows[storyId]) {
    delete state.userFollows[storyId];
    await set(ref(db, `users/${state.currentUser.uid}/follows`), state.userFollows);
    showNotification("Đã bỏ theo dõi");
  }
}

function isFollowing(storyId) { return !!state.userFollows[storyId]; }

// ==================== BOOKMARK & HISTORY ====================
function loadBookmarks() {
  const saved = localStorage.getItem("danmetopia_bookmarks");
  state.bookmarks = saved ? JSON.parse(saved) : [];
}
function saveBookmarks() { localStorage.setItem("danmetopia_bookmarks", JSON.stringify(state.bookmarks)); }
function addBookmark(storyId) { if (!state.bookmarks.includes(storyId)) { state.bookmarks.push(storyId); saveBookmarks(); showNotification("📑 Đã thêm vào bookmark"); } }
function removeBookmark(storyId) { state.bookmarks = state.bookmarks.filter(id => id !== storyId); saveBookmarks(); showNotification("Đã xóa khỏi bookmark"); }
function isBookmarked(storyId) { return state.bookmarks.includes(storyId); }

function loadHistory() {
  const saved = localStorage.getItem("danmetopia_history");
  state.readingHistory = saved ? JSON.parse(saved) : [];
}
function saveHistory() { localStorage.setItem("danmetopia_history", JSON.stringify(state.readingHistory)); }

// ==================== STORIES CRUD ====================
async function loadStoriesRealtime() {
  const storiesRef = ref(db, 'stories');
  onValue(storiesRef, (snapshot) => {
    const data = snapshot.val();
    state.stories = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    renderCurrentTab();
    initRouter(); // Cập nhật router sau khi stories được tải
  });
}

async function uploadImage(file) {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) { showNotification(`Ảnh ${file.name} quá lớn (tối đa 10MB)`, true); return null; }
  const formData = new FormData();
  formData.append("image", file);
  formData.append("key", IMGBB_API_KEY);
  try {
    const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
    const result = await response.json();
    return result.success ? result.data.url : null;
  } catch (err) { showNotification("Lỗi upload: " + err.message, true); return null; }
}

async function uploadMultipleImages(files) {
  if (!files || files.length === 0) return [];
  const urls = [];
  for (const file of files) {
    const url = await uploadImage(file);
    if (url) urls.push(url);
  }
  return urls;
}

async function createStory(data, coverFile, chapterImages) {
  let coverUrl = data.cover;
  if (coverFile) coverUrl = await uploadImage(coverFile);
  if (!data.title) throw new Error("Thiếu title");
  const newStoryRef = push(ref(db, 'stories'));
  const isAdminUser = isAdmin(state.currentUser);
  const slug = generateSlug(data.title);
  await set(newStoryRef, {
    title: data.title, slug: slug, otherName: data.otherName || "", author: data.author || "",
    genres: data.genres || "", tags: data.tags || "", status: data.status || "Đang tiến hành",
    desc: data.desc || "", cover: coverUrl || "", ownerUid: state.currentUser?.uid || "",
    ownerNickname: state.currentUser?.nickname || "Người dùng", groupId: data.groupId || null,
    groupName: data.groupName || "", likes: 0, views: 0, approved: isAdminUser, createdAt: Date.now(), chapters: {}
  });
  if (chapterImages && chapterImages.length > 0) {
    await addChapter(newStoryRef.key, "Chapter 1", chapterImages, 1);
  }
  showNotification(isAdminUser ? "✅ Đã đăng truyện (Admin)" : "📤 Đã gửi truyện, chờ duyệt");
}

async function updateStoryData(storyId, data) { await update(ref(db, `stories/${storyId}`), data); }
async function deleteStory(storyId) { await remove(ref(db, `stories/${storyId}`)); }
async function likeStory(storyId) { const refStory = ref(db, `stories/${storyId}/likes`); const snapshot = await get(refStory); await set(refStory, (snapshot.val() || 0) + 1); }
async function approveStory(storyId) { await update(ref(db, `stories/${storyId}`), { approved: true }); showNotification("Đã duyệt truyện"); }
async function rejectStory(storyId) { await update(ref(db, `stories/${storyId}`), { approved: false }); showNotification("Đã từ chối truyện"); }

// ==================== CHAPTERS ====================
let selectedChapterImages = [];

async function getChapters(storyId) {
  const snapshot = await get(ref(db, `chapters/${storyId}`));
  const data = snapshot.val() || {};
  const chapters = Object.entries(data).map(([id, value]) => ({ id, ...value }));
  chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  return chapters;
}

async function getChapter(storyId, chapterId) {
  const snap = await get(ref(db, `chapters/${storyId}/${chapterId}`));
  return snap.exists() ? { id: chapterId, ...snap.val() } : null;
}

async function addChapter(storyId, title, pages, chapterNumber) {
  if (!title) throw new Error("Thiếu title");
  const existingChapters = await getChapters(storyId);
  const newChapterNumber = chapterNumber || existingChapters.length + 1;
  const newChapterRef = push(ref(db, `chapters/${storyId}`));
  await set(newChapterRef, { title, pages, chapterNumber: newChapterNumber, createdAt: Date.now() });
  const storyRef = ref(db, `stories/${storyId}/chapters`);
  const snap = await get(storyRef);
  const currentChapters = snap.val() || {};
  currentChapters[newChapterRef.key] = true;
  await set(storyRef, currentChapters);
}

async function updateChapter(storyId, chapterId, data) {
  await update(ref(db, `chapters/${storyId}/${chapterId}`), data);
  showNotification("✅ Đã cập nhật chapter");
}

window.deleteChapter = async (storyId, chapterId) => {
  if (!isAdmin(state.currentUser)) { showNotification("⚠️ Chỉ Admin mới có quyền xóa chapter!", true); return; }
  if (!confirm("Xóa chapter này?")) return;
  await remove(ref(db, `chapters/${storyId}/${chapterId}`));
  const storyRef = ref(db, `stories/${storyId}/chapters`);
  const snap = await get(storyRef);
  const chapters = snap.val() || {};
  delete chapters[chapterId];
  await set(storyRef, chapters);
  showNotification("✅ Đã xóa chapter!");
  window.openStoryDetail(storyId);
};

// ==================== RENDER GENRE FILTER ====================
function renderGenreFilter() {
  const container = document.getElementById("genreFilterContainer");
  if (!container) return;
  let html = '<select id="genreSelect" class="genre-select"><option value="">-- Tất cả thể loại --</option>';
  for (const genre of GENRE_LIST) {
    html += `<option value="${genre}" ${state.selectedGenre === genre ? 'selected' : ''}>${genre}</option>`;
  }
  html += '</select>';
  container.innerHTML = html;
  document.getElementById("genreSelect")?.addEventListener("change", (e) => {
    state.selectedGenre = e.target.value;
    renderCurrentTab();
  });
}

// ==================== RENDER MAIN ====================
function renderCurrentTab() {
  const grid = document.getElementById("mangaGrid");
  if (!grid) return;
  let filtered = state.stories.filter(s => s.approved === true);
  if (state.selectedGenre) filtered = filtered.filter(s => s.genres && s.genres.includes(state.selectedGenre));
  if (state.searchKeyword) filtered = filtered.filter(s => s.title?.toLowerCase().includes(state.searchKeyword) || s.otherName?.toLowerCase().includes(state.searchKeyword) || s.tags?.toLowerCase().includes(state.searchKeyword));
  if (state.sortBy === "likes") filtered.sort((a,b) => (b.likes||0) - (a.likes||0));
  else if (state.sortBy === "views") filtered.sort((a,b) => (b.views||0) - (a.views||0));
  else filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  if (filtered.length === 0) { grid.innerHTML = "<div style='text-align:center; padding:50px;'>📭 Không có truyện nào</div>"; return; }
  grid.innerHTML = filtered.map(story => `
    <div class="manga-card" onclick="window.goToStory('${story.slug}')">
      <img class="manga-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/300x450?text=No+Cover'}" onerror="this.src='https://placehold.co/300x450?text=ERROR'">
      <div class="manga-info">
        <div class="manga-title">${escapeHtml(story.title)}</div>
        <div class="manga-meta">📚 ${escapeHtml(story.groupName) || "Cá nhân"}</div>
        <div class="manga-meta">❤️ ${story.likes || 0} | 👁 ${story.views || 0}</div>
        <div class="manga-meta">🏷️ ${escapeHtml(story.genres) || "Chưa có thể loại"}</div>
        ${story.approved === false ? '<div class="manga-meta" style="color:#FFCC00;">⏳ Chờ duyệt</div>' : ''}
      </div>
    </div>
  `).join("");
}

window.goToStory = (slug) => {
  window.location.hash = `#/truyen/${slug}`;
};

// ==================== RENDER UPLOAD PANEL ====================
function renderUploadPanel() {
  const panel = document.getElementById("uploadPanel");
  if (!panel) return;
  if (!canUpload(state.currentUser)) { panel.innerHTML = ""; return; }
  panel.innerHTML = `
    <div class="upload-panel">
      <h3>📤 ĐĂNG TRUYỆN MỚI</h3>
      <input id="uploadTitle" placeholder="Tên truyện *">
      <input id="uploadOtherName" placeholder="Tên khác">
      <input id="uploadAuthor" placeholder="Tác giả">
      <input id="uploadGenreTags" placeholder="Thể loại và Tags (cách nhau bằng dấu phẩy)">
      <div style="font-size:12px; color:#888; margin-bottom:12px;">💡 Hệ thống sẽ tự động phân biệt thể loại và tags</div>
      <select id="uploadStatus">
        <option value="Đang tiến hành">📖 Đang tiến hành</option>
        <option value="Đã hoàn thành">✅ Đã hoàn thành</option>
        <option value="Tạm ngưng">⏸ Tạm ngưng</option>
      </select>
      <select id="uploadGroupId"><option value="">-- Chọn nhóm dịch --</option></select>
      <input type="file" id="uploadCoverFile" accept="image/*">
      <div id="uploadCoverPreview"></div>
      <h4>📷 Ảnh chapter đầu tiên</h4>
      <input type="file" id="uploadChapterImages" accept="image/*" multiple>
      <div id="uploadChapterPreview" class="images-preview"></div>
      <textarea id="uploadDesc" placeholder="Mô tả truyện"></textarea>
      <button class="btn-pink" id="submitUploadBtn">📤 ĐĂNG TRUYỆN</button>
    </div>
  `;
  (async () => {
    const userGroups = await getUserGroupOptions();
    const groupSelect = document.getElementById("uploadGroupId");
    if (groupSelect) {
      for (const group of userGroups) { groupSelect.innerHTML += `<option value="${group.id}">${escapeHtml(group.groupName)}</option>`; }
    }
  })();
  let selectedCoverFile = null;
  let selectedChapterFiles = [];
  document.getElementById("uploadCoverFile")?.addEventListener("change", (e) => {
    selectedCoverFile = e.target.files[0];
    if (selectedCoverFile) { const reader = new FileReader(); reader.onload = (ev) => { document.getElementById("uploadCoverPreview").innerHTML = `<img class="cover-preview" src="${ev.target.result}">`; }; reader.readAsDataURL(selectedCoverFile); }
  });
  document.getElementById("uploadChapterImages")?.addEventListener("change", (e) => {
    selectedChapterFiles = Array.from(e.target.files);
    const previewDiv = document.getElementById("uploadChapterPreview");
    previewDiv.innerHTML = "";
    for (const file of selectedChapterFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => { previewDiv.innerHTML += `<div class="img-preview-item"><img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;"></div>`; };
      reader.readAsDataURL(file);
    }
  });
  document.getElementById("submitUploadBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("uploadTitle").value;
    if (!title) { showNotification("Nhập tên truyện", true); return; }
    showLoading(true);
    try {
      const groupId = document.getElementById("uploadGroupId").value;
      let groupName = "";
      if (groupId) { const groupSnap = await get(ref(db, `groups/${groupId}`)); if (groupSnap.exists()) groupName = groupSnap.val().groupName; }
      const genreTagsInput = document.getElementById("uploadGenreTags").value;
      const { genres, tags } = parseGenresAndTags(genreTagsInput);
      let chapterImageUrls = [];
      if (selectedChapterFiles.length > 0) chapterImageUrls = await uploadMultipleImages(selectedChapterFiles);
      await createStory({
        title, otherName: document.getElementById("uploadOtherName").value, author: document.getElementById("uploadAuthor").value,
        genres: genres, tags: tags, status: document.getElementById("uploadStatus").value,
        desc: document.getElementById("uploadDesc").value, cover: "", groupId: groupId || null, groupName: groupName
      }, selectedCoverFile, chapterImageUrls);
      document.getElementById("uploadTitle").value = "";
      document.getElementById("uploadOtherName").value = "";
      document.getElementById("uploadAuthor").value = "";
      document.getElementById("uploadGenreTags").value = "";
      document.getElementById("uploadDesc").value = "";
      document.getElementById("uploadCoverFile").value = "";
      document.getElementById("uploadChapterImages").value = "";
      document.getElementById("uploadCoverPreview").innerHTML = "";
      document.getElementById("uploadChapterPreview").innerHTML = "";
      selectedCoverFile = null;
      selectedChapterFiles = [];
    } catch (err) { showNotification("Lỗi: " + err.message, true); }
    finally { showLoading(false); }
  });
}

// ==================== STORY DETAIL ====================
window.openStoryDetail = async (storyId) => {
  refreshUserSession();
  const story = state.stories.find(s => s.id === storyId);
  if (!story) return;
  const chapters = await getChapters(storyId);
  const canEdit = state.currentUser && (isAdmin(state.currentUser) || story.ownerUid === state.currentUser?.uid || (state.currentUser.privileges?.groupId && story.groupId === state.currentUser.privileges?.groupId));
  const isMod = canModerate(state.currentUser);
  const genreList = story.genres ? story.genres.split(',').map(g => g.trim()) : [];
  const tagList = story.tags ? story.tags.split(',').map(t => t.trim()) : [];
  
  document.getElementById("storyDetailContent").innerHTML = `
    <div class="story-detail-grid">
      <div class="story-detail-cover-container" style="max-width:200px; margin:0 auto;">
        <img class="story-detail-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/200x300?text=No+Cover'}" style="width:100%; border-radius:12px;">
      </div>
      <div class="story-detail-info">
        <h2>${escapeHtml(story.title)}</h2>
        <p><span class="story-detail-label">📖 Tên khác:</span> ${escapeHtml(story.otherName) || "Chưa có"}</p>
        <p><span class="story-detail-label">✍️ Tác giả:</span> <span class="clickable-tag" onclick="filterByAuthor('${escapeHtml(story.author)}')">${escapeHtml(story.author) || "Chưa rõ"}</span></p>
        <p><span class="story-detail-label">🏷️ Thể loại:</span> ${genreList.map(g => `<span class="clickable-tag" onclick="filterByGenre('${escapeHtml(g)}')">#${escapeHtml(g)}</span>`).join(' ') || "Chưa cập nhật"}</p>
        <p><span class="story-detail-label">🔖 Tags:</span> ${tagList.map(t => `<span class="clickable-tag" onclick="filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`).join(' ') || "Chưa có"}</p>
        <p><span class="story-detail-label">📚 Nhóm dịch:</span> <span class="clickable-tag" onclick="filterByGroup('${escapeHtml(story.groupName)}')">${escapeHtml(story.groupName) || "Cá nhân"}</span></p>
        <p><span class="story-detail-label">📌 Tình trạng:</span> ${story.status === "Đã hoàn thành" ? "✅ Hoàn thành" : story.status === "Tạm ngưng" ? "⏸ Tạm ngưng" : "📖 Đang ra"}</p>
        <p><span class="story-detail-label">📖 Số chương:</span> ${chapters.length}</p>
        <p><span class="story-detail-label">📝 Mô tả:</span><br>${escapeHtml(story.desc) || "Chưa có mô tả"}</p>
        <p><span class="story-detail-label">❤️ Lượt thích:</span> ${story.likes || 0}</p>
        <p><span class="story-detail-label">👁 Lượt xem:</span> ${story.views || 0}</p>
      </div>
    </div>
  `;
  
  let chaptersHtml = `<h3>📖 DANH SÁCH CHAPTER</h3><div class="chapter-list">`;
  chapters.forEach((chap, idx) => {
    chaptersHtml += `
      <div class="chapter-item" onclick="window.goToChapter('${story.slug}', ${idx + 1})">
        <span>${escapeHtml(chap.title)}</span>
        <span style="font-size:12px;">📅 ${new Date(chap.createdAt).toLocaleDateString()}</span>
        <div class="chapter-actions">
          ${canEdit ? `<button class="chapter-edit-btn" onclick="event.stopPropagation(); window.openEditChapter('${story.id}', '${chap.id}')">✏️ Sửa</button>` : ''}
          ${isAdmin(state.currentUser) ? `<button class="chapter-delete-btn" onclick="event.stopPropagation(); window.deleteChapter('${story.id}', '${chap.id}')">🗑 Xóa</button>` : ''}
        </div>
      </div>
    `;
  });
  chaptersHtml += `</div>`;
  document.getElementById("storyChapters").innerHTML = chaptersHtml;
  
  let actionsHtml = `<button onclick="window.likeStoryAction('${story.id}')">❤️ Thích</button>`;
  if (state.currentUser && state.currentUser.role !== "guest") {
    actionsHtml += `<button onclick="window.toggleFollowAction('${story.id}')">${isFollowing(story.id) ? '⭐ Đã theo dõi' : '➕ Theo dõi'}</button>`;
    actionsHtml += `<button onclick="window.toggleBookmarkAction('${story.id}')">${isBookmarked(story.id) ? '📑 Đã bookmark' : '🔖 Bookmark'}</button>`;
  }
  if (canEdit) actionsHtml += `<button onclick="window.openEditStory('${story.id}')">✏️ Chỉnh sửa truyện</button><button onclick="window.openAddChapter('${story.id}')">📖 Thêm chapter mới</button>`;
  if (isMod && story.approved === false) actionsHtml += `<button onclick="window.approveStoryAction('${story.id}')">✅ Duyệt truyện</button>`;
  if (isAdmin(state.currentUser)) actionsHtml += `<button onclick="window.deleteStoryAction('${story.id}')" style="background:#ff4444;">🗑 Xóa truyện</button>`;
  document.getElementById("storyActions").innerHTML = actionsHtml;
  document.getElementById("storyModal").style.display = "flex";
};

window.goToChapter = (slug, chapterNum) => {
  window.location.hash = `#/truyen/${slug}/chuong-${chapterNum}`;
};

// ==================== CÁC HÀM FILTER ====================
window.filterByAuthor = (author) => {
  if (author && author !== "Chưa rõ") {
    state.searchKeyword = author;
    document.getElementById("searchInput").value = author;
    renderCurrentTab();
    closeModal("storyModal");
  }
};

window.filterByGroup = (groupName) => {
  if (groupName && groupName !== "Cá nhân") {
    state.searchKeyword = groupName;
    document.getElementById("searchInput").value = groupName;
    renderCurrentTab();
    closeModal("storyModal");
  }
};

window.filterByGenre = (genre) => { 
  state.selectedGenre = genre; 
  renderCurrentTab(); 
  closeModal("storyModal"); 
};

window.filterByTag = (tag) => { 
  state.searchKeyword = tag; 
  document.getElementById("searchInput").value = tag; 
  renderCurrentTab(); 
  closeModal("storyModal"); 
};

window.openStoryDetailChapter = (storyId, chapterIndex) => { 
  const story = state.stories.find(s => s.id === storyId);
  if (story) window.goToChapter(story.slug, chapterIndex + 1);
  closeModal("storyModal");
};

// ==================== LIKE ACTION (GUEST ALLOWED) ====================
window.likeStoryAction = async (storyId) => {
  if (!state.currentUser) {
    const guestId = "guest_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    state.currentUser = {
      uid: guestId,
      displayName: "Hủ qua đường " + Math.floor(Math.random() * 9999),
      nickname: "Hủ qua đường " + Math.floor(Math.random() * 9999),
      guest: true,
      role: "guest"
    };
    localStorage.setItem("tempGuestUser", JSON.stringify(state.currentUser));
  }
  await likeStory(storyId);
  const story = state.stories.find(s => s.id === storyId);
  if (story) window.openStoryDetail(storyId);
};

window.approveStoryAction = async (storyId) => { await approveStory(storyId); closeModal("storyModal"); };
window.deleteStoryAction = async (storyId) => { if (confirm("Xóa truyện?")) { await deleteStory(storyId); closeModal("storyModal"); } };
window.toggleFollowAction = async (storyId) => { if (isFollowing(storyId)) await unfollowStory(storyId); else await followStory(storyId); window.openStoryDetail(storyId); };
window.toggleBookmarkAction = (storyId) => { if (isBookmarked(storyId)) removeBookmark(storyId); else addBookmark(storyId); window.openStoryDetail(storyId); };

// ==================== EDIT STORY ====================
window.openEditStory = async (storyId) => {
  const story = state.stories.find(s => s.id === storyId);
  const userGroups = await getUserGroupOptions();
  let groupOptions = '<option value="">-- Không có nhóm --</option>';
  for (const group of userGroups) { groupOptions += `<option value="${group.id}" ${story.groupId === group.id ? 'selected' : ''}>${escapeHtml(group.groupName)}</option>`; }
  document.getElementById("editStoryContent").innerHTML = `
    <input id="editTitle" value="${escapeHtml(story.title)}" placeholder="Tên truyện *">
    <input id="editOtherName" value="${escapeHtml(story.otherName || '')}" placeholder="Tên khác">
    <input id="editAuthor" value="${escapeHtml(story.author || '')}" placeholder="Tác giả">
    <input id="editGenreTags" value="${escapeHtml((story.genres ? story.genres + ", " : "") + (story.tags || ""))}" placeholder="Thể loại và Tags (cách nhau bằng dấu phẩy)">
    <div style="font-size:12px; color:#888; margin-bottom:12px;">💡 Hệ thống sẽ tự động phân biệt thể loại và tags</div>
    <select id="editStatus">
      <option value="Đang tiến hành" ${story.status === "Đang tiến hành" ? "selected" : ""}>📖 Đang tiến hành</option>
      <option value="Đã hoàn thành" ${story.status === "Đã hoàn thành" ? "selected" : ""}>✅ Đã hoàn thành</option>
      <option value="Tạm ngưng" ${story.status === "Tạm ngưng" ? "selected" : ""}>⏸ Tạm ngưng</option>
    </select>
    <select id="editGroupId">${groupOptions}</select>
    <input type="file" id="editCoverFile" accept="image/*">
    <input id="editCover" value="${escapeHtml(story.cover || '')}" placeholder="Link ảnh bìa">
    <div id="editCoverPreview">${story.cover ? `<img class="cover-preview" src="${escapeHtml(story.cover)}">` : ''}</div>
    <textarea id="editDesc" placeholder="Mô tả">${escapeHtml(story.desc || '')}</textarea>
    <button onclick="window.saveEditStory('${storyId}')">💾 LƯU</button>
  `;
  document.getElementById("editCoverFile")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) { const reader = new FileReader(); reader.onload = (ev) => { document.getElementById("editCoverPreview").innerHTML = `<img class="cover-preview" src="${ev.target.result}">`; }; reader.readAsDataURL(file); }
  });
  document.getElementById("editStoryModal").style.display = "flex";
};

window.saveEditStory = async (storyId) => {
  refreshUserSession();
  const coverFile = document.getElementById("editCoverFile").files[0];
  let coverUrl = document.getElementById("editCover").value;
  if (coverFile) coverUrl = await uploadImage(coverFile);
  let groupName = "";
  const newGroupId = document.getElementById("editGroupId").value;
  if (newGroupId) { const groupSnap = await get(ref(db, `groups/${newGroupId}`)); if (groupSnap.exists()) groupName = groupSnap.val().groupName; }
  
  const genreTagsInput = document.getElementById("editGenreTags").value;
  const { genres, tags } = parseGenresAndTags(genreTagsInput);
  
  await updateStoryData(storyId, {
    title: document.getElementById("editTitle").value, otherName: document.getElementById("editOtherName").value,
    author: document.getElementById("editAuthor").value, genres: genres, tags: tags,
    status: document.getElementById("editStatus").value, groupId: newGroupId || null, groupName: groupName,
    cover: coverUrl, desc: document.getElementById("editDesc").value
  });
  closeModal("editStoryModal");
  showNotification("Đã cập nhật truyện");
  const story = state.stories.find(s => s.id === storyId);
  if (story) window.openStoryDetail(storyId);
};

// ==================== ADD/EDIT CHAPTER ====================
window.openAddChapter = (storyId) => {
  selectedChapterImages = [];
  let sortableInstance = null;
  document.getElementById("addChapterContent").innerHTML = `
    <input id="chapterTitle" placeholder="Tên chapter *">
    <input id="chapterNumber" placeholder="Số chapter (để trống tự động)">
    <input type="file" id="chapterImages" accept="image/*" multiple>
    <div id="chapterImagesPreview" class="images-preview"></div>
    <p>💡 Kéo thả ảnh để sắp xếp thứ tự</p>
    <textarea id="chapterPages" placeholder="Hoặc nhập link ảnh (mỗi dòng 1 link)" rows="10"></textarea>
    <button class="btn-pink" id="saveChapterBtn">📤 ĐĂNG CHAPTER</button>
  `;
  const previewDiv = document.getElementById("chapterImagesPreview");
  const updateSortable = () => {
    if (sortableInstance) sortableInstance.destroy();
    if (previewDiv.children.length > 0) {
      sortableInstance = new Sortable(previewDiv, { animation: 150, handle: '.img-preview-item',
        onEnd: () => { const newOrder = []; for (let i = 0; i < previewDiv.children.length; i++) newOrder.push(selectedChapterImages[i]); if (newOrder.length === selectedChapterImages.length) selectedChapterImages = newOrder; }
      });
    }
  };
  document.getElementById("chapterImages")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    selectedChapterImages = files;
    previewDiv.innerHTML = "";
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imgDiv = document.createElement("div");
        imgDiv.className = "img-preview-item";
        imgDiv.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;"><button onclick="this.parentElement.remove()">✕</button>`;
        previewDiv.appendChild(imgDiv);
        updateSortable();
      };
      reader.readAsDataURL(file);
    }
    updateSortable();
  });
  const saveBtn = document.getElementById("saveChapterBtn");
  if (saveBtn) { const newBtn = saveBtn.cloneNode(true); saveBtn.parentNode.replaceChild(newBtn, saveBtn); newBtn.addEventListener("click", () => window.saveAddChapter(storyId)); }
  document.getElementById("addChapterModal").style.display = "flex";
};

window.saveAddChapter = async (storyId) => {
  const title = document.getElementById("chapterTitle")?.value;
  const pagesText = document.getElementById("chapterPages")?.value;
  const chapterNumber = parseInt(document.getElementById("chapterNumber")?.value) || 0;
  if (!title) { showNotification("Nhập tên chapter", true); return; }
  let pages = [];
  if (selectedChapterImages.length > 0) {
    showLoading(true);
    const uploadedUrls = await uploadMultipleImages(selectedChapterImages);
    if (uploadedUrls.length > 0) pages = [...pages, ...uploadedUrls];
    showLoading(false);
  }
  if (pagesText && pagesText.trim()) { const linkPages = pagesText.split('\n').filter(p => p.trim()); pages = [...pages, ...linkPages]; }
  if (pages.length === 0) { showNotification("Thêm ít nhất 1 ảnh", true); return; }
  try {
    await addChapter(storyId, title, pages, chapterNumber);
    showNotification("✅ Đã thêm chapter!");
    closeModal("addChapterModal");
    const story = state.stories.find(s => s.id === storyId);
    if (story) window.openStoryDetail(storyId);
  } catch (err) { showNotification("Lỗi: " + err.message, true); }
};

window.openEditChapter = async (storyId, chapterId) => {
  const story = state.stories.find(s => s.id === storyId);
  if (!story) { showNotification("Không tìm thấy truyện", true); return; }
  const canEdit = state.currentUser && (isAdmin(state.currentUser) || story.ownerUid === state.currentUser?.uid || (state.currentUser.privileges?.groupId && story.groupId === state.currentUser.privileges?.groupId));
  if (!canEdit) { showNotification("⚠️ Bạn không có quyền chỉnh sửa chapter này!", true); return; }
  const chapter = await getChapter(storyId, chapterId);
  if (!chapter) { showNotification("Không tìm thấy chapter", true); return; }
  let existingPages = chapter.pages || [];
  let newImageFiles = [];
  document.getElementById("editChapterContent").innerHTML = `
    <input id="editChapterTitle" value="${escapeHtml(chapter.title)}" placeholder="Tên chapter *">
    <input id="editChapterNumber" value="${chapter.chapterNumber || 0}" type="number">
    <label style="color:#FF69B4;">📷 Ảnh hiện tại (kéo thả để sắp xếp)</label>
    <div id="existingImagesPreview" class="images-preview" style="min-height:120px;"></div>
    <label style="color:#FF69B4;">➕ Thêm ảnh mới</label>
    <input type="file" id="editNewChapterImages" accept="image/*" multiple>
    <div id="editNewChapterPreview" class="images-preview"></div>
    <label style="color:#FF69B4;">🔗 Hoặc nhập link ảnh (mỗi dòng 1 link)</label>
    <textarea id="editChapterPages" rows="8">${existingPages.join('\n')}</textarea>
    <button class="btn-pink" id="saveChapterEditBtn">💾 LƯU THAY ĐỔI</button>
  `;
  const existingPreviewDiv = document.getElementById("existingImagesPreview");
  existingPreviewDiv.innerHTML = "";
  for (let i = 0; i < existingPages.length; i++) {
    const imgDiv = document.createElement("div");
    imgDiv.className = "img-preview-item";
    imgDiv.innerHTML = `
      <img src="${escapeHtml(existingPages[i])}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">
      <button class="remove-existing-img" data-index="${i}" style="position:absolute; top:-8px; right:-8px; width:22px; height:22px; border-radius:50%; background:#ff4444; color:white; border:none; cursor:pointer; font-size:12px;">✕</button>
    `;
    existingPreviewDiv.appendChild(imgDiv);
  }
  document.querySelectorAll('.remove-existing-img').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      existingPages.splice(idx, 1);
      btn.parentElement.remove();
      document.querySelectorAll('.remove-existing-img').forEach((b, newIdx) => { b.dataset.index = newIdx; });
      showNotification("Đã xóa ảnh khỏi danh sách");
    });
  });
  new Sortable(existingPreviewDiv, { animation: 150, handle: '.img-preview-item',
    onEnd: () => { const newOrder = []; for (let i = 0; i < existingPreviewDiv.children.length; i++) { const img = existingPreviewDiv.children[i].querySelector('img'); if (img) newOrder.push(img.src); } existingPages = newOrder; }
  });
  document.getElementById("editNewChapterImages")?.addEventListener("change", (e) => {
    newImageFiles = Array.from(e.target.files);
    const previewDiv = document.getElementById("editNewChapterPreview");
    previewDiv.innerHTML = "";
    for (const file of newImageFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imgDiv = document.createElement("div");
        imgDiv.className = "img-preview-item";
        imgDiv.innerHTML = `<img src="${ev.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;"><button onclick="this.parentElement.remove()" style="position:absolute; top:-8px; right:-8px; width:22px; height:22px; border-radius:50%; background:#ff4444; color:white; border:none; cursor:pointer; font-size:12px;">✕</button>`;
        previewDiv.appendChild(imgDiv);
      };
      reader.readAsDataURL(file);
    }
  });
  const saveBtn = document.getElementById("saveChapterEditBtn");
  if (saveBtn) {
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);
    newBtn.addEventListener("click", async () => {
      const newTitle = document.getElementById("editChapterTitle").value;
      const newNumber = parseInt(document.getElementById("editChapterNumber").value) || 0;
      let newPages = [...existingPages];
      const pagesText = document.getElementById("editChapterPages").value;
      if (pagesText.trim()) { const linkPages = pagesText.split('\n').filter(p => p.trim()); newPages = [...newPages, ...linkPages]; }
      if (newImageFiles.length > 0) {
        const newImageUrls = await uploadMultipleImages(newImageFiles);
        newPages = [...newPages, ...newImageUrls];
      }
      if (!newTitle) { showNotification("Nhập tên chapter", true); return; }
      if (newPages.length === 0) { showNotification("Chapter phải có ít nhất 1 ảnh", true); return; }
      await updateChapter(storyId, chapterId, { title: newTitle, chapterNumber: newNumber, pages: newPages });
      closeModal("editChapterModal");
      showNotification("✅ Đã cập nhật chapter!");
      const story = state.stories.find(s => s.id === storyId);
      if (story) window.openStoryDetail(storyId);
    });
  }
  document.getElementById("editChapterModal").style.display = "flex";
};

// ==================== READER (TRANG RIÊNG) ====================
window.openReader = (storyId, chapterIndex) => {
  const story = state.stories.find(s => s.id === storyId);
  if (story) {
    window.location.hash = `#/truyen/${story.slug}/chuong-${chapterIndex + 1}`;
  } else {
    window.location.href = `reader.html?id=${storyId}&chapter=${chapterIndex || 0}`;
  }
};

// ==================== SCROLL BUTTONS ====================
function initScrollButtons() {
  let floatingBtn = document.getElementById("floatingTopBtn");
  if (!floatingBtn) {
    floatingBtn = document.createElement("button");
    floatingBtn.id = "floatingTopBtn";
    floatingBtn.innerHTML = "↑";
    floatingBtn.style.cssText = `
      position:fixed;
      right:18px;
      bottom:20px;
      width:48px;
      height:48px;
      border:none;
      border-radius:16px;
      background:rgba(0,0,0,0.65);
      backdrop-filter:blur(10px);
      color:white;
      font-size:22px;
      font-weight:bold;
      display:none;
      align-items:center;
      justify-content:center;
      z-index:99999;
      cursor:pointer;
      box-shadow:0 4px 12px rgba(0,0,0,0.25);
      transition:all 0.2s;
    `;
    document.body.appendChild(floatingBtn);
    floatingBtn.onclick = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const readerContent = document.getElementById("readerContent");
      if (readerContent) readerContent.scrollTo({ top: 0, behavior: "smooth" });
    };
    floatingBtn.onmouseenter = () => {
      floatingBtn.style.background = "#FF69B4";
      floatingBtn.style.color = "black";
      floatingBtn.style.transform = "scale(1.05)";
    };
    floatingBtn.onmouseleave = () => {
      floatingBtn.style.background = "rgba(0,0,0,0.65)";
      floatingBtn.style.color = "white";
      floatingBtn.style.transform = "scale(1)";
    };
  }
  const floatingBtnElem = document.getElementById("floatingTopBtn");
  window.addEventListener("scroll", () => {
    const show = window.scrollY > 250;
    floatingBtnElem.style.display = show ? "flex" : "none";
  });
}

// ==================== MODAL ====================
function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = "none"; }
window.closeModal = closeModal;

// ==================== PROFILE & AVATAR ====================
async function uploadAvatar(file) {
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) { showNotification("Ảnh đại diện tối đa 2MB", true); return null; }
  const url = await uploadImage(file);
  if (url) {
    await update(ref(db, `users/${state.currentUser.uid}`), { avatar: url });
    state.currentUser.avatar = url;
    updateUserDisplay();
    showNotification("✅ Đã cập nhật avatar");
  }
  return url;
}

window.openProfile = () => {
  if (state.currentUser?.guest) {
    document.getElementById("profileContent").innerHTML = `<div style="text-align:center; padding:30px; color:white;">🔒 Guest không thể đổi nickname</div>`;
    document.getElementById("profileModal").style.display = "flex";
    return;
  }
  document.getElementById("profileContent").innerHTML = `
    <div class="profile-field">
      <label>🖼️ Avatar</label>
      <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
        <img src="${state.currentUser?.avatar || 'https://placehold.co/100x100?text=No+Avatar'}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid #FF69B4;">
        <input type="file" id="avatarInput" accept="image/*" style="flex:1;">
      </div>
    </div>
    <div class="profile-field"><label>📧 Email</label><input value="${escapeHtml(state.currentUser?.email || '')}" disabled></div>
    <div class="profile-field"><label>🏷️ Nickname</label><input id="profileNickname" value="${escapeHtml(state.currentUser?.nickname || '')}"></div>
    <button onclick="window.saveProfile()">💾 Lưu</button>
  `;
  document.getElementById("avatarInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await uploadAvatar(file);
  });
  document.getElementById("profileModal").style.display = "flex";
};

window.saveProfile = async () => {
  const newNickname = document.getElementById("profileNickname").value;
  if (!newNickname) { showNotification("Nickname không được trống", true); return; }
  await update(ref(db, `users/${state.currentUser.uid}`), { nickname: newNickname });
  state.currentUser.nickname = newNickname;
  updateUserDisplay();
  showNotification("Đã cập nhật");
  closeModal("profileModal");
};

window.createNewGroup = async () => {
  if (state.currentUser?.role === "guest") { showNotification("Vui lòng đăng nhập để tạo nhóm", true); return; }
  const groupName = document.getElementById("groupNameInput").value;
  if (!groupName) { alert("Nhập tên nhóm"); return; }
  showLoading(true);
  try {
    const newGroupRef = push(ref(db, 'groups'));
    await set(newGroupRef, { groupName, description: document.getElementById("groupDescInput").value || '', ownerId: state.currentUser.uid, members: [state.currentUser.uid], createdAt: Date.now() });
    await update(ref(db, `users/${state.currentUser.uid}/privileges`), { groupId: newGroupRef.key });
    closeModal("groupModal");
    showNotification("✅ Tạo nhóm thành công!");
    document.getElementById("groupNameInput").value = '';
    document.getElementById("groupDescInput").value = '';
    await loadAllGroups();
  } catch (err) { showNotification("Lỗi: " + err.message, true); }
  showLoading(false);
};

// ==================== LOAD COMPONENTS ====================
async function loadComponents() {
  try {
    const headerRes = await fetch('components/header.html');
    const headerHtml = await headerRes.text();
    document.getElementById('header-placeholder').innerHTML = headerHtml;
    const footerRes = await fetch('components/footer.html');
    const footerHtml = await footerRes.text();
    document.getElementById('footer-placeholder').innerHTML = footerHtml;
    document.getElementById('homeLogo')?.addEventListener('click', () => window.location.reload());
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('profileBtn')?.addEventListener('click', window.openProfile);
    document.getElementById('createGroupBtn')?.addEventListener('click', () => document.getElementById('groupModal').style.display = 'flex');
    document.getElementById('confirmGroupBtn')?.addEventListener('click', window.createNewGroup);
    document.getElementById('adminLink')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'admin.html'; });
    document.getElementById('groupsLink')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'groups.html'; });
  } catch (err) { console.error("Error loading components:", err); }
}

// ==================== INIT ====================
async function initApp() {
  await loadComponents();
  updateUserDisplay();
  initScrollButtons();
  renderGenreFilter();
  renderUploadPanel();
  await loadAllGroups();
  await loadFollows();
  loadBookmarks();
  loadHistory();
  loadStoriesRealtime();
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => { document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); state.currentTab = btn.dataset.tab; renderCurrentTab(); });
  });
  document.getElementById("searchInput")?.addEventListener("input", (e) => { state.searchKeyword = e.target.value.toLowerCase(); renderCurrentTab(); });
  document.getElementById("sortFilter")?.addEventListener("change", (e) => { state.sortBy = e.target.value; renderCurrentTab(); });
}

// ==================== STARTUP ====================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM ready - Starting app...");
  document.getElementById("warningContinueBtn")?.addEventListener("click", handleWarningContinue);
  document.getElementById("guestBtn")?.addEventListener("click", handleGuestLogin);
  document.getElementById("checkEmailBtn")?.addEventListener("click", handleCheckEmail);
  document.getElementById("verifyOtpBtn")?.addEventListener("click", handleVerifyOTP);
  document.getElementById("passwordLoginBtn")?.addEventListener("click", handlePasswordLogin);
  document.getElementById("completeRegisterBtn")?.addEventListener("click", handleCompleteRegistration);
  document.getElementById("backToEmailBtn")?.addEventListener("click", () => { document.getElementById("otpGroup").style.display = "none"; document.getElementById("loginMsg").innerHTML = ""; });
  document.getElementById("backToEmailBtn2")?.addEventListener("click", () => { document.getElementById("passwordGroup").style.display = "none"; document.getElementById("loginMsg").innerHTML = ""; });
  if (isMainPasswordValid()) {
    if (await restoreSession()) {
      document.getElementById("warningOverlay").style.display = "none";
      document.getElementById("loginPage").style.display = "none";
      document.getElementById("mainContainer").style.display = "block";
      await initApp();
    } else {
      document.getElementById("warningOverlay").style.display = "none";
      document.getElementById("loginPage").style.display = "flex";
    }
  } else {
    document.getElementById("warningOverlay").style.display = "flex";
  }
});

// Make functions global
window.openStoryDetail = window.openStoryDetail;
window.openEditStory = window.openEditStory;
window.openAddChapter = window.openAddChapter;
window.openEditChapter = window.openEditChapter;
window.deleteChapter = window.deleteChapter;
window.openReader = window.openReader;
window.closeReaderModal = () => { window.location.href = 'index.html'; };
window.changeChapter = () => {};
window.changeChapterTo = () => {};
window.scrollToTop = () => { window.scrollTo({ top: 0, behavior: "smooth" }); };
window.closeModal = closeModal;
window.saveEditStory = window.saveEditStory;
window.saveAddChapter = window.saveAddChapter;
window.likeStoryAction = window.likeStoryAction;
window.approveStoryAction = window.approveStoryAction;
window.deleteStoryAction = window.deleteStoryAction;
window.toggleFollowAction = window.toggleFollowAction;
window.toggleBookmarkAction = window.toggleBookmarkAction;
window.openStoryDetailChapter = window.openStoryDetailChapter;
window.filterByGenre = window.filterByGenre;
window.filterByTag = window.filterByTag;
window.filterByAuthor = window.filterByAuthor;
window.filterByGroup = window.filterByGroup;
window.openProfile = window.openProfile;
window.saveProfile = window.saveProfile;
window.createNewGroup = window.createNewGroup;
window.showNotification = showNotification;