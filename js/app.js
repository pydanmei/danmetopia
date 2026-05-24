// ==================== FIREBASE CONFIG ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, push, update, remove, onValue, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// ==================== AUTH FUNCTIONS ====================
async function handleGuestLogin() {
  const guestName = generateRandomGuestName();
  state.currentUser = { role: "guest", displayName: guestName, nickname: guestName, uid: null };
  setUserSession(state.currentUser);
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainContainer").style.display = "block";
  showNotification(`👤 Chào mừng ${guestName} (Khách)`);
  initApp();
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
  const searchTerm = document.getElementById("searchInput")?.value.toLowerCase() || "";
  if (searchTerm) filtered = filtered.filter(s => s.title?.toLowerCase().includes(searchTerm));
  
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
      </div>
    </div>
  `).join("");
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
        <p><span class="story-detail-label">📖 Tên khác:</span> ${escapeHtml(story.otherName) || "Chưa có"}</p>
        <p><span class="story-detail-label">✍️ Tác giả:</span> ${escapeHtml(story.author) || "Chưa rõ"}</p>
        <p><span class="story-detail-label">📝 Mô tả:</span><br>${escapeHtml(story.desc) || "Chưa có mô tả"}</p>
      </div>
    </div>
  `;
  
  let chaptersHtml = `<h3>📖 DANH SÁCH CHAPTER</h3><div class="chapter-list">`;
  chapters.forEach((chap, idx) => {
    chaptersHtml += `<div class="chapter-item" onclick="window.openReader('${storyId}', ${idx})">${escapeHtml(chap.title)}</div>`;
  });
  chaptersHtml += `</div>`;
  document.getElementById("storyChapters").innerHTML = chaptersHtml;
  document.getElementById("storyModal").style.display = "flex";
};

// ==================== READER ====================
let currentChapters = [];
let currentChapterIndex = 0;

window.openReader = async (storyId, chapterIndex) => {
  refreshUserSession();
  currentChapterIndex = chapterIndex || 0;
  
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
  
  readerDiv.innerHTML = `
    <div class="reader-page">
      <div class="chapter-nav">
        <button onclick="window.changeChapter(-1)" ${currentChapterIndex === 0 ? 'disabled' : ''}>⬅️ Chapter trước</button>
        <h3>${escapeHtml(chap.title)}</h3>
        <button onclick="window.changeChapter(1)" ${currentChapterIndex === currentChapters.length - 1 ? 'disabled' : ''}>Chapter sau ➡️</button>
      </div>
      ${chap.pages?.map(page => `<img class="reader-image" src="${escapeHtml(page)}" loading="lazy">`).join("") || "<p>Không có ảnh</p>"}
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

// ==================== INITIALIZATION ====================
async function initApp() {
  console.log("Initializing app...");
  initScrollButtons();
  loadStoriesRealtime();
  
  document.getElementById("searchInput")?.addEventListener("input", () => renderCurrentTab());
  document.getElementById("sortFilter")?.addEventListener("change", () => renderCurrentTab());
  document.getElementById("homeLogo")?.addEventListener("click", () => window.location.reload());
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
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
  
  document.getElementById("guestBtn")?.addEventListener("click", handleGuestLogin);
  
  const restored = await restoreSession();
  if (!restored) {
    document.getElementById("warningOverlay").style.display = "flex";
  } else {
    document.getElementById("warningOverlay").style.display = "none";
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
    await initApp();
  }
});

// Make functions global
window.showNotification = showNotification;
window.closeModal = (id) => { document.getElementById(id).style.display = "none"; };
