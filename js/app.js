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

// ==================== GENRE LIST ====================
const GENRE_LIST = [
  { name: "3D", icon: "🎮", desc: "Truyện được vẽ bằng đồ họa 3D" },
  { name: "Action", icon: "⚔️", desc: "Truyện có nhiều cảnh đánh nhau, hành động" },
  { name: "Comedy", icon: "😂", desc: "Truyện hài hước" },
  { name: "Drama", icon: "💗", desc: "Truyện tình cảm" },
  { name: "Fantasy", icon: "🐉", desc: "Truyện giả tưởng" },
  { name: "Horror", icon: "👻", desc: "Truyện kinh dị" },
  { name: "Romance", icon: "💕", desc: "Truyện lãng mạn" },
  { name: "School Life", icon: "📚", desc: "Truyện học đường" },
  { name: "Shounen Ai", icon: "💖", desc: "BL nhẹ nhàng" },
  { name: "Yaoi", icon: "🔥", desc: "BL 18+" }
];

// ==================== STATE ====================
const state = {
  currentUser: null,
  stories: [],
  allGroups: [],
  userFollows: {},
  currentTab: "all",
  selectedGenre: "",
  selectedStoryId: null
};

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
function canModerate(userData) { return isAdmin(userData) || userData?.privileges?.moderator === true; }
function canUpload(userData) { return userData && (userData.role === "admin" || userData.role === "user"); }

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

// ==================== AUTH ====================
let pendingRegisterEmail = null;

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

async function sendOTPEmail(email) {
  const otp = generateOTP();
  await set(ref(db, `otp_requests/${email.replace(/\./g, "_")}`), { code: otp, expires: Date.now() + 5 * 60 * 1000 });
  try {
    await emailjs.send("service_8bxh5mm", "template_8ahbuhu", { otp: otp, to_email: email });
    showNotification("📩 Mã OTP đã gửi");
  } catch { showNotification(`⚠️ Mã OTP: ${otp}`, true); }
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

async function createNewUser(uid, email, nickname) {
  const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
  await set(ref(db, `users/${uid}`), {
    email, nickname, role: ADMIN_EMAILS.includes(email) ? "admin" : "user",
    privileges: { moderator: false, groupId: null }, follows: {}, history: [], createdAt: Date.now()
  });
}

async function loadUserData(uid, email) {
  const snap = await get(ref(db, `users/${uid}`));
  const userData = snap.exists() ? snap.val() : null;
  const nickname = userData?.nickname || email?.split("@")[0] || "Người dùng";
  let displayName = nickname;
  if (userData?.role === "admin") displayName = `${nickname} (Admin)`;
  else if (userData?.privileges?.moderator) displayName = `${nickname} (Quản lý)`;
  return { uid, email, role: userData?.role || "user", privileges: userData?.privileges || { moderator: false, groupId: null }, nickname, displayName };
}

// ==================== AUTH HANDLERS ====================
async function handleGuestLogin() {
  state.currentUser = { role: "guest", displayName: generateRandomGuestName(), nickname: "", uid: null };
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
  if (isAdminEmail) {
    document.getElementById("passwordGroup").style.display = "block";
    document.getElementById("otpGroup").style.display = "none";
    return;
  }
  if (emailExists) {
    document.getElementById("passwordGroup").style.display = "block";
    document.getElementById("otpGroup").style.display = "none";
  } else {
    await sendOTPEmail(email);
    document.getElementById("otpGroup").style.display = "block";
    document.getElementById("passwordGroup").style.display = "none";
  }
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
    if (err.code === "auth/invalid-credential") {
      const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
      if (ADMIN_EMAILS.includes(email) && confirm("Tạo tài khoản Admin mới?")) {
        pendingRegisterEmail = email;
        document.getElementById("verifiedEmail").innerText = email;
        document.getElementById("loginPage").style.display = "none";
        document.getElementById("registerPage").style.display = "flex";
      } else showNotification("Sai email hoặc mật khẩu", true);
    } else showNotification("Lỗi: " + err.message, true);
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
  showLoading(true);
  try {
    const userCred = await createUserWithEmailAndPassword(auth, pendingRegisterEmail, password);
    await createNewUser(userCred.user.uid, pendingRegisterEmail, nickname);
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
  const createGroupBtn = document.getElementById("createGroupBtn");
  if (!userDisplay) return;
  if (!state.currentUser || state.currentUser.role === "guest") {
    userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser?.displayName || "Guest")}`;
    if (profileBtn) profileBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (adminLink) adminLink.style.display = "none";
    if (createGroupBtn) createGroupBtn.style.display = "none";
  } else {
    userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser.displayName)}`;
    if (profileBtn) profileBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (adminLink) adminLink.style.display = isAdmin(state.currentUser) ? "inline-block" : "none";
    if (createGroupBtn) createGroupBtn.style.display = !state.currentUser.privileges?.groupId ? "inline-block" : "none";
  }
}

// ==================== LOAD DATA ====================
async function loadAllGroups() {
  const groupsSnap = await get(ref(db, "groups"));
  state.allGroups = groupsSnap.val() ? Object.entries(groupsSnap.val()).map(([id, g]) => ({ id, ...g })) : [];
}

async function getUserGroups(uid) {
  if (!uid) return [];
  const userGroups = [];
  for (const group of state.allGroups) {
    if (group.members && group.members.includes(uid)) userGroups.push(group);
  }
  return userGroups;
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

// ==================== STORIES CRUD ====================
async function loadStoriesRealtime() {
  const storiesRef = ref(db, 'stories');
  onValue(storiesRef, (snapshot) => {
    const data = snapshot.val();
    state.stories = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    renderCurrentTab();
  });
}

async function uploadImage(file) {
  if (!file || file.size > 10 * 1024 * 1024) return null;
  const formData = new FormData();
  formData.append("image", file);
  formData.append("key", IMGBB_API_KEY);
  const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
  const result = await response.json();
  return result.success ? result.data.url : null;
}

async function uploadMultipleImages(files) {
  const urls = [];
  for (const file of files) { const url = await uploadImage(file); if (url) urls.push(url); }
  return urls;
}

async function createStory(data, coverFile) {
  let coverUrl = data.cover;
  if (coverFile) coverUrl = await uploadImage(coverFile);
  if (!data.title) throw new Error("Thiếu title");
  const newStoryRef = push(ref(db, 'stories'));
  await set(newStoryRef, {
    title: data.title, otherName: data.otherName || "", author: data.author || "",
    genres: data.genres || "", tags: data.tags || "", status: data.status || "Đang tiến hành",
    desc: data.desc || "", cover: coverUrl || "", ownerUid: state.currentUser?.uid || "",
    ownerNickname: state.currentUser?.nickname || "Người dùng", groupId: data.groupId || null,
    groupName: data.groupName || "", likes: 0, views: 0, approved: isAdmin(state.currentUser),
    createdAt: Date.now(), chapters: {}
  });
  showNotification(isAdmin(state.currentUser) ? "✅ Đã đăng truyện (Admin)" : "📤 Đã gửi truyện, chờ duyệt");
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
  let html = '';
  for (const genre of GENRE_LIST) {
    html += `<div class="genre-tooltip filter-genre-item" data-genre="${genre.name}">${genre.icon} ${genre.name}<span class="tooltip-text">${genre.desc}</span></div>`;
  }
  container.innerHTML = html;
  document.querySelectorAll('.filter-genre-item').forEach(el => {
    el.addEventListener('click', () => {
      const genre = el.dataset.genre;
      if (state.selectedGenre === genre) { state.selectedGenre = ""; el.classList.remove("active"); }
      else { document.querySelectorAll('.filter-genre-item').forEach(g => g.classList.remove("active")); state.selectedGenre = genre; el.classList.add("active"); }
      renderCurrentTab();
    });
  });
}

// ==================== RENDER MAIN ====================
function renderCurrentTab() {
  const grid = document.getElementById("mangaGrid");
  if (!grid) return;
  let filtered = state.stories.filter(s => s.approved === true);
  if (state.selectedGenre) filtered = filtered.filter(s => s.genres && s.genres.includes(state.selectedGenre));
  const searchTerm = document.getElementById("searchInput")?.value.toLowerCase() || "";
  if (searchTerm) filtered = filtered.filter(s => s.title?.toLowerCase().includes(searchTerm));
  const sortBy = document.getElementById("sortFilter")?.value;
  if (sortBy === "likes") filtered.sort((a,b) => (b.likes||0) - (a.likes||0));
  else if (sortBy === "views") filtered.sort((a,b) => (b.views||0) - (a.views||0));
  else filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  if (filtered.length === 0) { grid.innerHTML = "<div style='text-align:center; padding:50px;'>📭 Không có truyện nào</div>"; return; }
  grid.innerHTML = filtered.map(story => `
    <div class="manga-card" onclick="window.openStoryDetail('${story.id}')">
      <img class="manga-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/300x450?text=No+Cover'}" onerror="this.src='https://placehold.co/300x450?text=ERROR'">
      <div class="manga-info">
        <div class="manga-title">${escapeHtml(story.title)}</div>
        <div class="manga-meta">📚 ${escapeHtml(story.groupName) || "Cá nhân"}</div>
        <div class="manga-meta">❤️ ${story.likes || 0} | 👁 ${story.views || 0}</div>
        ${story.approved === false ? '<div class="manga-meta" style="color:#FFCC00;">⏳ Chờ duyệt</div>' : ''}
      </div>
    </div>
  `).join("");
}

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
      <input id="uploadGenre" list="genreDropdown" placeholder="Thể loại">
      <input id="uploadTags" placeholder="Tags (cách nhau bằng dấu phẩy)">
      <select id="uploadStatus">
        <option value="Đang tiến hành">📖 Đang tiến hành</option>
        <option value="Đã hoàn thành">✅ Đã hoàn thành</option>
      </select>
      <input type="file" id="uploadCoverFile" accept="image/*">
      <div id="uploadCoverPreview"></div>
      <textarea id="uploadDesc" placeholder="Mô tả truyện"></textarea>
      <button class="btn-pink" id="submitUploadBtn">📤 ĐĂNG TRUYỆN</button>
    </div>
  `;
  document.getElementById("uploadCoverFile")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) { const reader = new FileReader(); reader.onload = (ev) => { document.getElementById("uploadCoverPreview").innerHTML = `<img class="cover-preview" src="${ev.target.result}">`; }; reader.readAsDataURL(file); }
  });
  document.getElementById("submitUploadBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("uploadTitle").value;
    if (!title) { showNotification("Nhập tên truyện", true); return; }
    showLoading(true);
    try {
      await createStory({
        title, otherName: document.getElementById("uploadOtherName").value,
        author: document.getElementById("uploadAuthor").value, genres: document.getElementById("uploadGenre").value,
        tags: document.getElementById("uploadTags").value, status: document.getElementById("uploadStatus").value,
        desc: document.getElementById("uploadDesc").value, cover: ""
      }, document.getElementById("uploadCoverFile").files[0]);
      document.getElementById("uploadTitle").value = ""; document.getElementById("uploadOtherName").value = "";
      document.getElementById("uploadAuthor").value = ""; document.getElementById("uploadGenre").value = "";
      document.getElementById("uploadTags").value = ""; document.getElementById("uploadDesc").value = "";
      document.getElementById("uploadCoverFile").value = ""; document.getElementById("uploadCoverPreview").innerHTML = "";
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
  const canEdit = state.currentUser && (isAdmin(state.currentUser) || story.ownerUid === state.currentUser?.uid);
  const isMod = canModerate(state.currentUser);
  document.getElementById("storyDetailContent").innerHTML = `
    <div class="story-detail-grid">
      <img class="story-detail-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/300x450?text=No+Cover'}">
      <div class="story-detail-info">
        <h2>${escapeHtml(story.title)}</h2>
        <p><span class="story-detail-label">📖 Tên khác:</span> ${escapeHtml(story.otherName) || "Chưa có"}</p>
        <p><span class="story-detail-label">✍️ Tác giả:</span> ${escapeHtml(story.author) || "Chưa rõ"}</p>
        <p><span class="story-detail-label">🏷️ Thể loại:</span> ${escapeHtml(story.genres) || "Chưa cập nhật"}</p>
        <p><span class="story-detail-label">📌 Tình trạng:</span> ${story.status === "Đã hoàn thành" ? "✅ Hoàn thành" : "📖 Đang ra"}</p>
        <p><span class="story-detail-label">📖 Số chương:</span> ${chapters.length}</p>
        <p><span class="story-detail-label">📝 Mô tả:</span><br>${escapeHtml(story.desc) || "Chưa có mô tả"}</p>
        <p><span class="story-detail-label">❤️ Lượt thích:</span> ${story.likes || 0}</p>
        <p><span class="story-detail-label">👁 Lượt xem:</span> ${story.views || 0}</p>
      </div>
    </div>
  `;
  let chaptersHtml = `<h3>📖 DANH SÁCH CHAPTER</h3><div class="chapter-list">`;
  chapters.forEach((chap, idx) => {
    chaptersHtml += `<div class="chapter-item" onclick="window.openStoryDetailChapter('${storyId}', ${idx})"><span>${escapeHtml(chap.title)}</span><span style="font-size:12px;">📅 ${new Date(chap.createdAt).toLocaleDateString()}</span></div>`;
  });
  chaptersHtml += `</div>`;
  document.getElementById("storyChapters").innerHTML = chaptersHtml;
  let actionsHtml = `<button onclick="window.likeStoryAction('${storyId}')">❤️ Thích</button>`;
  if (state.currentUser && state.currentUser.role !== "guest") actionsHtml += `<button onclick="window.toggleFollowAction('${storyId}')">${isFollowing(storyId) ? '⭐ Đã theo dõi' : '➕ Theo dõi'}</button>`;
  if (canEdit) actionsHtml += `<button onclick="window.openEditStory('${storyId}')">✏️ Chỉnh sửa truyện</button><button onclick="window.openAddChapter('${storyId}')">📖 Thêm chapter mới</button>`;
  if (isMod && story.approved === false) actionsHtml += `<button onclick="window.approveStoryAction('${storyId}')">✅ Duyệt truyện</button>`;
  if (isAdmin(state.currentUser)) actionsHtml += `<button onclick="window.deleteStoryAction('${storyId}')" style="background:#ff4444;">🗑 Xóa truyện</button>`;
  document.getElementById("storyActions").innerHTML = actionsHtml;
  document.getElementById("storyModal").style.display = "flex";
};

window.openStoryDetailChapter = (storyId, chapterIndex) => {
  closeModal("storyModal");
  window.openReader(storyId, chapterIndex);
};
window.likeStoryAction = async (storyId) => { await likeStory(storyId); window.openStoryDetail(storyId); };
window.approveStoryAction = async (storyId) => { await approveStory(storyId); closeModal("storyModal"); };
window.deleteStoryAction = async (storyId) => { if (confirm("Xóa truyện?")) { await deleteStory(storyId); closeModal("storyModal"); } };
window.toggleFollowAction = async (storyId) => { if (isFollowing(storyId)) await unfollowStory(storyId); else await followStory(storyId); window.openStoryDetail(storyId); };

// ==================== EDIT STORY ====================
window.openEditStory = async (storyId) => {
  const story = state.stories.find(s => s.id === storyId);
  const userGroups = await getUserGroups(state.currentUser?.uid);
  let groupOptions = '<option value="">-- Không có nhóm --</option>';
  for (const group of userGroups) { groupOptions += `<option value="${group.id}" ${story.groupId === group.id ? 'selected' : ''}>${escapeHtml(group.groupName)}</option>`; }
  document.getElementById("editStoryContent").innerHTML = `
    <input id="editTitle" value="${escapeHtml(story.title)}" placeholder="Tên truyện *">
    <input id="editOtherName" value="${escapeHtml(story.otherName || '')}" placeholder="Tên khác">
    <input id="editAuthor" value="${escapeHtml(story.author || '')}" placeholder="Tác giả">
    <input id="editGenre" list="genreDropdown" value="${escapeHtml(story.genres || '')}" placeholder="Thể loại">
    <input id="editTags" value="${escapeHtml(story.tags || '')}" placeholder="Tags">
    <select id="editStatus"><option value="Đang tiến hành" ${story.status === "Đang tiến hành" ? "selected" : ""}>📖 Đang tiến hành</option><option value="Đã hoàn thành" ${story.status === "Đã hoàn thành" ? "selected" : ""}>✅ Đã hoàn thành</option></select>
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
  await updateStoryData(storyId, {
    title: document.getElementById("editTitle").value, otherName: document.getElementById("editOtherName").value,
    author: document.getElementById("editAuthor").value, genres: document.getElementById("editGenre").value,
    tags: document.getElementById("editTags").value, status: document.getElementById("editStatus").value,
    groupId: newGroupId || null, groupName: groupName, cover: coverUrl, desc: document.getElementById("editDesc").value
  });
  closeModal("editStoryModal");
  showNotification("Đã cập nhật truyện");
  window.openStoryDetail(storyId);
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
    <p>💡 Kéo thả ảnh để sắp xếp</p>
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
    window.openStoryDetail(storyId);
  } catch (err) { showNotification("Lỗi: " + err.message, true); }
};

window.openEditChapter = async (storyId, chapterId) => {
  const chapter = await getChapter(storyId, chapterId);
  if (!chapter) return;
  let existingPages = chapter.pages || [];
  document.getElementById("editChapterContent").innerHTML = `
    <input id="editChapterTitle" value="${escapeHtml(chapter.title)}" placeholder="Tên chapter *">
    <input id="editChapterNumber" value="${chapter.chapterNumber || 0}" type="number">
    <label>📷 Ảnh hiện tại</label>
    <div id="existingImagesPreview" class="images-preview"></div>
    <input type="file" id="editNewChapterImages" accept="image/*" multiple>
    <div id="editNewChapterPreview" class="images-preview"></div>
    <textarea id="editChapterPages" rows="10">${existingPages.join('\n')}</textarea>
    <button class="btn-pink" id="saveChapterEditBtn">💾 LƯU</button>
  `;
  const existingPreviewDiv = document.getElementById("existingImagesPreview");
  for (let i = 0; i < existingPages.length; i++) {
    const imgDiv = document.createElement("div");
    imgDiv.className = "img-preview-item";
    imgDiv.innerHTML = `<img src="${escapeHtml(existingPages[i])}" style="width:100%;height:100%;object-fit:cover;"><button onclick="this.parentElement.remove()">✕</button>`;
    existingPreviewDiv.appendChild(imgDiv);
  }
  let newImageFiles = [];
  document.getElementById("editNewChapterImages")?.addEventListener("change", (e) => {
    newImageFiles = Array.from(e.target.files);
    const previewDiv = document.getElementById("editNewChapterPreview");
    previewDiv.innerHTML = "";
    for (const file of newImageFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imgDiv = document.createElement("div");
        imgDiv.className = "img-preview-item";
        imgDiv.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;"><button onclick="this.parentElement.remove()">✕</button>`;
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
      await updateChapter(storyId, chapterId, { title: newTitle, chapterNumber: newNumber, pages: newPages });
      closeModal("editChapterModal");
      window.openStoryDetail(storyId);
    });
  }
  document.getElementById("editChapterModal").style.display = "flex";
};

// ==================== READER ====================
let currentChapters = [];
let currentChapterIndex = 0;

window.openReader = async (storyId, chapterIndex) => {
  refreshUserSession();
  currentChapterIndex = chapterIndex || 0;
  const story = state.stories.find(s => s.id === storyId);
  if (story) { const viewRef = ref(db, `stories/${storyId}/views`); const snapshot = await get(viewRef); await set(viewRef, (snapshot.val() || 0) + 1); }
  const chaptersRef = ref(db, `chapters/${storyId}`);
  onValue(chaptersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) { currentChapters = Object.entries(data).map(([id, value]) => ({ id, ...value })); currentChapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0)); renderReader(); }
  });
  document.getElementById("readerModal").style.display = "flex";
  document.body.style.overflow = "hidden";
};

function renderReader() {
  if (!currentChapters[currentChapterIndex]) return;
  const chap = currentChapters[currentChapterIndex];
  const readerDiv = document.getElementById("readerContent");
  const hasPrev = currentChapterIndex > 0;
  const hasNext = currentChapterIndex < currentChapters.length - 1;
  readerDiv.innerHTML = `
    <div class="reader-page">
      <div class="chapter-nav">
        ${hasPrev ? `<button onclick="window.changeChapter(-1)">⬅️ Chapter trước</button>` : '<button disabled>⬅️ Chapter trước</button>'}
        <h3>${escapeHtml(chap.title)}</h3>
        ${hasNext ? `<button onclick="window.changeChapter(1)">Chapter sau ➡️</button>` : '<button disabled>Chapter sau ➡️</button>'}
      </div>
      <div id="chapterImages">${chap.pages?.map(page => `<img class="reader-image" src="${escapeHtml(page)}" loading="lazy" onerror="this.src='https://placehold.co/800x1200?text=Error'">`).join("") || "<p>Không có ảnh</p>"}</div>
      <div class="chapter-nav" style="margin-top:30px;margin-bottom:30px;">
        ${hasPrev ? `<button onclick="window.changeChapter(-1)">⬅️ Chapter trước</button>` : '<button disabled>⬅️ Chapter trước</button>'}
        <button onclick="window.scrollToTop()" style="background:#FFCCCC;">⬆️ Lên đầu trang</button>
        ${hasNext ? `<button onclick="window.changeChapter(1)">Chapter sau ➡️</button>` : '<button disabled>Chapter sau ➡️</button>'}
      </div>
      <div class="chapter-list-section"><h4>📑 MỤC LỤC CHAPTER</h4><div class="chapter-list">${currentChapters.map((c, i) => `<div class="chapter-item" onclick="window.changeChapterTo(${i})"><span>${escapeHtml(c.title)}</span><span style="font-size:12px;">📅 ${new Date(c.createdAt).toLocaleDateString()}</span></div>`).join("")}</div></div>
    </div>
  `;
}

window.changeChapter = (delta) => {
  const newIdx = currentChapterIndex + delta;
  if (newIdx >= 0 && newIdx < currentChapters.length) { currentChapterIndex = newIdx; renderReader(); window.scrollTo(0, 0); }
};
window.changeChapterTo = (index) => { currentChapterIndex = index; renderReader(); window.scrollTo(0, 0); };
window.scrollToTop = () => { window.scrollTo({ top: 0, behavior: "smooth" }); };
window.closeReaderModal = () => { document.getElementById("readerModal").style.display = "none"; document.body.style.overflow = ""; };

// ==================== SCROLL BUTTONS ====================
function initScrollButtons() {
  const scrollBtn = document.getElementById("scrollTopBtn");
  const floatingBtn = document.getElementById("floatingTopBtn");
  if (scrollBtn && floatingBtn) {
    window.addEventListener("scroll", () => { const show = window.scrollY > 200; scrollBtn.style.display = show ? "flex" : "none"; floatingBtn.style.display = show ? "flex" : "none"; });
    scrollBtn.onclick = () => window.scrollTo(0, 0);
    floatingBtn.onclick = () => window.scrollTo(0, 0);
  }
}

// ==================== MODAL ====================
function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = "none"; }
window.closeModal = closeModal;

// ==================== PROFILE & GROUP ====================
window.openProfile = () => {
  document.getElementById("profileContent").innerHTML = `
    <div class="profile-field"><label>📧 Email</label><input value="${escapeHtml(state.currentUser?.email || '')}" disabled></div>
    <div class="profile-field"><label>🏷️ Nickname</label><input id="profileNickname" value="${escapeHtml(state.currentUser?.nickname || '')}"></div>
    <button onclick="window.saveProfile()">💾 Lưu</button>
  `;
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
  const groupName = document.getElementById("groupNameInput").value;
  if (!groupName) { alert("Nhập tên nhóm"); return; }
  showLoading(true);
  const newGroupRef = push(ref(db, 'groups'));
  await set(newGroupRef, { groupName, description: document.getElementById("groupDescInput").value || "", ownerId: state.currentUser.uid, members: [state.currentUser.uid], createdAt: Date.now() });
  await update(ref(db, `users/${state.currentUser.uid}/privileges`), { groupId: newGroupRef.key });
  closeModal("groupModal");
  showNotification("✅ Tạo nhóm thành công!");
  setTimeout(() => window.location.reload(), 1000);
  showLoading(false);
};

// ==================== INIT ====================
async function initApp() {
  updateUserDisplay();
  initScrollButtons();
  renderGenreFilter();
  renderUploadPanel();
  await loadAllGroups();
  await loadFollows();
  loadStoriesRealtime();
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => { document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); state.currentTab = btn.dataset.tab; renderCurrentTab(); });
  });
  document.getElementById("searchInput")?.addEventListener("input", () => renderCurrentTab());
  document.getElementById("sortFilter")?.addEventListener("change", () => renderCurrentTab());
  document.getElementById("homeLogo")?.addEventListener("click", () => window.location.reload());
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("profileBtn")?.addEventListener("click", window.openProfile);
  document.getElementById("createGroupBtn")?.addEventListener("click", () => document.getElementById("groupModal").style.display = "flex");
  document.getElementById("confirmGroupBtn")?.addEventListener("click", window.createNewGroup);
  document.getElementById("adminLink")?.addEventListener("click", (e) => { e.preventDefault(); window.location.href = "admin.html"; });
  document.getElementById("groupsLink")?.addEventListener("click", (e) => { e.preventDefault(); window.location.href = "groups.html"; });
}

// ==================== STARTUP ====================
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("warningContinueBtn")?.addEventListener("click", () => {
    if (document.getElementById("mainPassword").value !== "danmei") { showNotification("Sai mật khẩu!", true); return; }
    localStorage.setItem("mainPasswordExpiry", Date.now() + 86400000);
    document.getElementById("warningOverlay").style.display = "none";
    document.getElementById("loginPage").style.display = "flex";
  });
  document.getElementById("exitBtn")?.addEventListener("click", () => { document.body.innerHTML = "<div style='height:100vh;display:flex;justify-content:center;align-items:center;background:black;color:white;'>ĐÃ THOÁT</div>"; });
  document.getElementById("guestBtn")?.addEventListener("click", handleGuestLogin);
  document.getElementById("checkEmailBtn")?.addEventListener("click", handleCheckEmail);
  document.getElementById("verifyOtpBtn")?.addEventListener("click", handleVerifyOTP);
  document.getElementById("passwordLoginBtn")?.addEventListener("click", handlePasswordLogin);
  document.getElementById("completeRegisterBtn")?.addEventListener("click", handleCompleteRegistration);
  document.getElementById("backToEmailBtn")?.addEventListener("click", () => { document.getElementById("otpGroup").style.display = "none"; });
  document.getElementById("backToEmailBtn2")?.addEventListener("click", () => { document.getElementById("passwordGroup").style.display = "none"; });
  if (await restoreSession()) {
    document.getElementById("warningOverlay").style.display = "none";
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    await initApp();
  } else document.getElementById("warningOverlay").style.display = "flex";
});
