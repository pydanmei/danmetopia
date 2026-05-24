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

// Khởi tạo EmailJS
emailjs.init("fPq8fpw1OqzOtj-lk");

// ==================== GENRE LIST ====================
const GENRE_LIST = [
  { name: "3D", icon: "🎮", desc: "Truyện được vẽ bằng đồ họa 3D" },
  { name: "Action", icon: "⚔️", desc: "Truyện có nhiều cảnh đánh nhau, hành động" },
  { name: "Comedy", icon: "😂", desc: "Truyện hài hước, mang lại tiếng cười" },
  { name: "Drama", icon: "💗", desc: "Truyện tình cảm, nhiều cung bậc cảm xúc" },
  { name: "Fantasy", icon: "🐉", desc: "Truyện giả tưởng, ma thuật, thế giới khác" },
  { name: "Horror", icon: "👻", desc: "Truyện kinh dị, rùng rợn" },
  { name: "Romance", icon: "💕", desc: "Truyện tập trung vào tình cảm lãng mạn" },
  { name: "School Life", icon: "📚", desc: "Truyện bối cảnh trường học, học đường" },
  { name: "Shounen Ai", icon: "💖", desc: "Truyện BL nhẹ nhàng, thuần khiết" },
  { name: "Yaoi", icon: "🔥", desc: "Truyện BL có yếu tố 18+" }
];

// ==================== STATE MANAGEMENT ====================
const state = {
  currentUser: null,
  stories: [],
  groups: [],
  userFollows: {},
  isLoading: false,
  currentTab: "all",
  selectedGenre: ""
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

// ==================== SESSION MANAGEMENT ====================
const SESSION_CONFIG = {
  guest: 60 * 60 * 1000,
  user: 7 * 24 * 60 * 60 * 1000
};

function setUserSession(userData) {
  if (!userData) return;
  const ttl = userData.role === "guest" ? SESSION_CONFIG.guest : SESSION_CONFIG.user;
  const session = { ...userData, savedAt: Date.now(), expireAt: Date.now() + ttl };
  localStorage.setItem("userSession", JSON.stringify(session));
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
    if (session.role !== "guest") state.currentUser = session;
    else state.currentUser = session;
    return true;
  } catch { return false; }
}

// ==================== OTP & EMAIL LOGIN FUNCTIONS ====================
let pendingRegisterEmail = null;

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

async function loadUserData(uid, email) {
  const snap = await get(ref(db, `users/${uid}`));
  const userData = snap.exists() ? snap.val() : null;
  const nickname = userData?.nickname || email?.split("@")[0] || "Người dùng";
  let displayName = nickname;
  if (userData?.role === "admin") displayName = `${nickname} (Admin)`;
  else if (userData?.role === "user" && userData?.privileges?.moderator) displayName = `${nickname} (Quản lý)`;
  return {
    uid, email,
    role: userData?.role || "user",
    privileges: userData?.privileges || { moderator: false, groupId: null },
    nickname: nickname,
    displayName: displayName
  };
}

// ==================== AUTH FUNCTIONS ====================
async function handleGuestLogin() {
  const guestName = generateRandomGuestName();
  state.currentUser = { role: "guest", displayName: guestName, nickname: guestName, uid: null };
  setUserSession(state.currentUser);
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainContainer").style.display = "block";
  showNotification(`👤 Chào mừng ${guestName} (Khách)`);
  updateUserDisplay();
  initApp();
}

async function handleCheckEmail() {
  console.log("handleCheckEmail called");
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) { 
    showNotification("Nhập email", true); 
    return; 
  }
  
  const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
  const isAdminEmail = ADMIN_EMAILS.includes(email);
  showLoading(true);
  const emailExists = await checkEmailExists(email);
  showLoading(false);
  
  pendingRegisterEmail = email;
  
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

async function handleVerifyOTP() {
  const otp = document.getElementById("otpCode").value.trim();
  if (!otp || otp.length !== 6) { 
    showNotification("Nhập mã OTP 6 số", true); 
    return; 
  }
  showLoading(true);
  const result = await verifyOTP(pendingRegisterEmail, otp);
  showLoading(false);
  if (!result.success) { 
    showNotification(result.message, true); 
    return; 
  }
  document.getElementById("verifiedEmail").innerText = pendingRegisterEmail;
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("registerPage").style.display = "flex";
}

async function handlePasswordLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) { 
    showNotification("Nhập email và mật khẩu", true); 
    return; 
  }
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
    console.error("Login error:", err);
    if (err.code === "auth/invalid-credential") {
      const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];
      const isAdminEmail = ADMIN_EMAILS.includes(email);
      if (isAdminEmail) {
        const confirmCreate = confirm("Email Admin chưa có tài khoản. Bạn có muốn tạo tài khoản Admin mới không?");
        if (confirmCreate) {
          pendingRegisterEmail = email;
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
  } finally { 
    showLoading(false); 
  }
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
  } catch (err) {
    console.error("Registration error:", err);
    msg.innerText = "Lỗi: " + err.message;
  } finally { 
    showLoading(false); 
  }
}

async function restoreSession() {
  const sessionStr = localStorage.getItem("userSession");
  if (!sessionStr) return false;
  try {
    const session = JSON.parse(sessionStr);
    if (!session.expireAt || Date.now() > session.expireAt) {
      localStorage.removeItem("userSession");
      return false;
    }
    if (session.role === "guest") {
      state.currentUser = session;
      return true;
    } else if (session.uid) {
      const userSnap = await get(ref(db, `users/${session.uid}`));
      if (userSnap.exists()) {
        state.currentUser = { ...session, ...userSnap.val() };
        return true;
      }
    }
    return false;
  } catch { return false; }
}

async function logout() {
  try { await signOut(auth); } catch(e) {}
  localStorage.removeItem("userSession");
  window.location.reload();
}

// ==================== UPDATE USER DISPLAY ====================
function updateUserDisplay() {
  const userDisplay = document.getElementById("userDisplay");
  const profileBtn = document.getElementById("profileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  
  if (!userDisplay) return;
  
  if (!state.currentUser || state.currentUser.role === "guest") {
    userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser?.displayName || "Guest")}`;
    if (profileBtn) profileBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
  } else {
    userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser.displayName)}`;
    if (profileBtn) profileBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
  }
}

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
      if (state.selectedGenre === genre) {
        state.selectedGenre = "";
        el.classList.remove("active");
      } else {
        document.querySelectorAll('.filter-genre-item').forEach(g => g.classList.remove("active"));
        state.selectedGenre = genre;
        el.classList.add("active");
      }
      renderCurrentTab();
    });
  });
}

// ==================== STORIES FUNCTIONS ====================
async function loadStoriesRealtime() {
  const storiesRef = ref(db, 'stories');
  onValue(storiesRef, (snapshot) => {
    const data = snapshot.val();
    state.stories = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    renderCurrentTab();
  });
}

async function getChapters(storyId) {
  const snapshot = await get(ref(db, `chapters/${storyId}`));
  const data = snapshot.val() || {};
  const chapters = Object.entries(data).map(([id, value]) => ({ id, ...value }));
  chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  return chapters;
}

async function likeStory(storyId) {
  const storyRef = ref(db, `stories/${storyId}/likes`);
  const snapshot = await get(storyRef);
  await set(storyRef, (snapshot.val() || 0) + 1);
}

// ==================== RENDER FUNCTIONS ====================
function renderCurrentTab() {
  const grid = document.getElementById("mangaGrid");
  if (!grid) return;
  
  let filtered = state.stories.filter(s => s.approved === true);
  
  if (state.selectedGenre) {
    filtered = filtered.filter(s => s.genres && s.genres.includes(state.selectedGenre));
  }
  
  const searchTerm = document.getElementById("searchInput")?.value.toLowerCase() || "";
  if (searchTerm) filtered = filtered.filter(s => s.title?.toLowerCase().includes(searchTerm));
  
  const sortBy = document.getElementById("sortFilter")?.value;
  if (sortBy === "likes") filtered.sort((a,b) => (b.likes||0) - (a.likes||0));
  else if (sortBy === "views") filtered.sort((a,b) => (b.views||0) - (a.views||0));
  else filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  
  if (filtered.length === 0) {
    grid.innerHTML = "<div style='text-align:center; padding:50px;'>📭 Không có truyện nào</div>";
    return;
  }
  
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
  if (!canUpload(state.currentUser) || state.currentUser?.role === "guest") { 
    panel.innerHTML = ""; 
    return; 
  }
  
  panel.innerHTML = `
    <div class="upload-panel">
      <h3>📤 ĐĂNG TRUYỆN MỚI</h3>
      <input id="uploadTitle" placeholder="Tên truyện *">
      <input id="uploadAuthor" placeholder="Tác giả">
      <input id="uploadGenre" list="genreDropdown" placeholder="Thể loại">
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
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById("uploadCoverPreview").innerHTML = `<img class="cover-preview" src="${ev.target.result}">`;
      };
      reader.readAsDataURL(file);
    }
  });
  
  document.getElementById("submitUploadBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("uploadTitle").value;
    if (!title) { showNotification("Nhập tên truyện", true); return; }
    showNotification("Chức năng đang hoàn thiện", true);
  });
}

// ==================== STORY DETAIL ====================
window.openStoryDetail = async (storyId) => {
  refreshUserSession();
  const story = state.stories.find(s => s.id === storyId);
  if (!story) return;
  const chapters = await getChapters(storyId);
  
  document.getElementById("storyDetailContent").innerHTML = `
    <div class="story-detail-grid">
      <img class="story-detail-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/300x450?text=No+Cover'}">
      <div class="story-detail-info">
        <h2>${escapeHtml(story.title)}</h2>
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
    chaptersHtml += `<div class="chapter-item" onclick="window.openReader('${storyId}', ${idx})">${escapeHtml(chap.title)}</div>`;
  });
  chaptersHtml += `</div>`;
  document.getElementById("storyChapters").innerHTML = chaptersHtml;
  
  let actionsHtml = `<button onclick="window.likeStoryAction('${storyId}')">❤️ Thích</button>`;
  if (isAdmin(state.currentUser)) {
    actionsHtml += `<button onclick="window.deleteStoryAction('${storyId}')" style="background:#ff4444;">🗑 Xóa truyện</button>`;
  }
  document.getElementById("storyActions").innerHTML = actionsHtml;
  document.getElementById("storyModal").style.display = "flex";
};

window.likeStoryAction = async (storyId) => {
  await likeStory(storyId);
  window.openStoryDetail(storyId);
};

window.deleteStoryAction = async (storyId) => {
  if (confirm("Xóa truyện?")) {
    await remove(ref(db, `stories/${storyId}`));
    showNotification("Đã xóa truyện");
    closeModal("storyModal");
  }
};

// ==================== READER ====================
let currentChapters = [];
let currentChapterIndex = 0;

window.openReader = async (storyId, chapterIndex) => {
  refreshUserSession();
  currentChapterIndex = chapterIndex || 0;
  
  const story = state.stories.find(s => s.id === storyId);
  if (story) {
    const viewRef = ref(db, `stories/${storyId}/views`);
    const snapshot = await get(viewRef);
    await set(viewRef, (snapshot.val() || 0) + 1);
  }
  
  const chaptersRef = ref(db, `chapters/${storyId}`);
  onValue(chaptersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      currentChapters = Object.entries(data).map(([id, value]) => ({ id, ...value }));
      currentChapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
      renderReader();
    }
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
      <div id="chapterImages">
        ${chap.pages?.map(page => `<img class="reader-image" src="${escapeHtml(page)}" loading="lazy" onerror="this.src='https://placehold.co/800x1200?text=Error'">`).join("") || "<p>Không có ảnh</p>"}
      </div>
      <div class="chapter-nav" style="margin-top:30px;">
        ${hasPrev ? `<button onclick="window.changeChapter(-1)">⬅️ Chapter trước</button>` : '<button disabled>⬅️ Chapter trước</button>'}
        <button onclick="window.scrollToTop()">⬆️ Lên đầu trang</button>
        ${hasNext ? `<button onclick="window.changeChapter(1)">Chapter sau ➡️</button>` : '<button disabled>Chapter sau ➡️</button>'}
      </div>
    </div>
  `;
}

window.changeChapter = (delta) => {
  const newIdx = currentChapterIndex + delta;
  if (newIdx >= 0 && newIdx < currentChapters.length) {
    currentChapterIndex = newIdx;
    renderReader();
    window.scrollTo(0, 0);
  }
};

window.scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.closeReaderModal = () => {
  document.getElementById("readerModal").style.display = "none";
  document.body.style.overflow = "";
};

// ==================== SCROLL BUTTONS ====================
function initScrollButtons() {
  const scrollBtn = document.getElementById("scrollTopBtn");
  const floatingBtn = document.getElementById("floatingTopBtn");
  if (scrollBtn && floatingBtn) {
    window.addEventListener("scroll", () => {
      const show = window.scrollY > 200;
      scrollBtn.style.display = show ? "flex" : "none";
      floatingBtn.style.display = show ? "flex" : "none";
    });
    scrollBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    floatingBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none";
}

// ==================== INITIALIZATION ====================
async function initApp() {
  console.log("Initializing app...");
  updateUserDisplay();
  initScrollButtons();
  renderGenreFilter();
  renderUploadPanel();
  loadStoriesRealtime();
  
  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentTab = btn.dataset.tab;
      renderCurrentTab();
    });
  });
  
  document.getElementById("searchInput")?.addEventListener("input", () => renderCurrentTab());
  document.getElementById("sortFilter")?.addEventListener("change", () => renderCurrentTab());
  document.getElementById("homeLogo")?.addEventListener("click", () => window.location.reload());
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("profileBtn")?.addEventListener("click", () => {
    showNotification("Chức năng đang phát triển");
  });
}

// ==================== STARTUP ====================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM ready");
  
  // Warning screen
  document.getElementById("warningContinueBtn")?.addEventListener("click", () => {
    const mainPass = document.getElementById("mainPassword").value;
    if (mainPass !== "danmei") {
      showNotification("Sai mật khẩu!", true);
      return;
    }
    localStorage.setItem("mainPasswordExpiry", Date.now() + 86400000);
    document.getElementById("warningOverlay").style.display = "none";
    document.getElementById("loginPage").style.display = "flex";
  });
  
  document.getElementById("exitBtn")?.addEventListener("click", () => {
    document.body.innerHTML = "<div style='height:100vh;display:flex;justify-content:center;align-items:center;background:black;color:white;'>ĐÃ THOÁT</div>";
  });
  
  // Login buttons
  document.getElementById("guestBtn")?.addEventListener("click", handleGuestLogin);
  document.getElementById("checkEmailBtn")?.addEventListener("click", handleCheckEmail);
  document.getElementById("verifyOtpBtn")?.addEventListener("click", handleVerifyOTP);
  document.getElementById("passwordLoginBtn")?.addEventListener("click", handlePasswordLogin);
  document.getElementById("completeRegisterBtn")?.addEventListener("click", handleCompleteRegistration);
  
  // Back buttons
  document.getElementById("backToEmailBtn")?.addEventListener("click", () => {
    document.getElementById("otpGroup").style.display = "none";
    document.getElementById("loginMsg").innerHTML = "";
  });
  document.getElementById("backToEmailBtn2")?.addEventListener("click", () => {
    document.getElementById("passwordGroup").style.display = "none";
    document.getElementById("loginMsg").innerHTML = "";
  });
  
  const restored = await restoreSession();
  if (!restored) {
    document.getElementById("warningOverlay").style.display = "flex";
  } else {
    document.getElementById("warningOverlay").style.display = "none";
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    updateUserDisplay();
    await initApp();
  }
});

// Make functions global
window.showNotification = showNotification;
window.closeModal = closeModal;
