// ==================== CORE IMPORTS ====================
import { FirebaseService } from './core/firebaseService.js';
import { API } from './core/api.js';
import { state, subscribe, setState } from './core/state.js';
import { ADMIN_EMAILS, GENRE_LIST, SESSION_CONFIG, IMGBB_API_KEY } from './core/constants.js';

// ==================== MODULES IMPORTS ====================
import { 
  handleGuestLogin, handleCheckEmail, handleVerifyOTP, 
  handlePasswordLogin, handleCompleteRegistration, 
  logout, restoreSession, refreshUserSession,
  setUserSession, getUserData, loadUserData 
} from './modules/auth.js';

import { 
  loadStoriesRealtime, loadAllGroups, loadFollows,
  renderGenreFilter, renderCurrentTab, scheduleRender,
  followStory, unfollowStory, likeStory, approveStory, rejectStory, deleteStory,
  getChapters 
} from './modules/data.js';

import { 
  initUI, closeModal, openStoryDetail, openEditStory, saveEditStory,
  openProfile, saveProfile, createNewGroup 
} from './modules/ui.js';

import { initUploadPanel, uploadImage, uploadMultipleImages, createStory } from './modules/upload.js';
import { initScrollButtons, showNotification, showLoading, escapeHtml, generateRandomGuestName, isAdmin, canModerate, hasGroup, imageCache } from './modules/utils.js';
import { openReader, closeReaderModal, changeChapter, changeChapterTo, scrollToTop } from './modules/reader.js';

// ==================== GLOBAL API (window.API) ====================
window.API = {
  // Auth
  handleGuestLogin, handleCheckEmail, handleVerifyOTP,
  handlePasswordLogin, handleCompleteRegistration, logout,
  restoreSession, refreshUserSession, setUserSession,
  getUserData, loadUserData,
  
  // Data
  loadStoriesRealtime, loadAllGroups, loadFollows,
  renderGenreFilter, renderCurrentTab, scheduleRender,
  followStory, unfollowStory, likeStory, approveStory, rejectStory, deleteStory,
  getChapters,
  
  // UI
  initUI, closeModal, openStoryDetail, openEditStory, saveEditStory,
  openProfile, saveProfile, createNewGroup,
  
  // Upload
  initUploadPanel, uploadImage, uploadMultipleImages, createStory,
  
  // Utils
  initScrollButtons, showNotification, showLoading, escapeHtml,
  generateRandomGuestName, isAdmin, canModerate, hasGroup,
  
  // Reader
  openReader, closeReaderModal, changeChapter, changeChapterTo, scrollToTop
};

// ==================== INITIALIZATION ====================
console.log("🚀 App starting...");
console.log("✅ Firebase ready");
console.log("✅ State ready");

// EmailJS init
emailjs.init("fPq8fpw1OqzOtj-lk");

// Load header and footer
async function loadComponents() {
  try {
    const headerRes = await fetch('components/header.html');
    const headerHtml = await headerRes.text();
    document.getElementById('header-placeholder').innerHTML = headerHtml;
    
    const footerRes = await fetch('components/footer.html');
    const footerHtml = await footerRes.text();
    document.getElementById('footer-placeholder').innerHTML = footerHtml;
    
    attachHeaderEvents();
    console.log("✅ Components loaded");
  } catch (err) {
    console.error('Error loading components:', err);
    showNotification("Lỗi tải giao diện: " + err.message, true);
  }
}

function attachHeaderEvents() {
  document.getElementById('homeLogo')?.addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('logoutBtn')?.addEventListener('click', () => API.logout());
  document.getElementById('profileBtn')?.addEventListener('click', () => API.openProfile());
  document.getElementById('createGroupBtn')?.addEventListener('click', () => document.getElementById('groupModal').style.display = 'flex');
  document.getElementById('confirmGroupBtn')?.addEventListener('click', () => API.createNewGroup());
}

// Initialize app
async function initApp() {
  console.log("📱 Initializing app...");
  await loadComponents();
  await API.loadAllGroups();
  await API.loadFollows();
  API.renderGenreFilter();
  API.initUploadPanel();
  API.loadStoriesRealtime();
  API.initScrollButtons();
  API.initUI();
  await updateUserDisplay();
  console.log("✅ App initialized");
  
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.currentTab = btn.dataset.tab;
      API.scheduleRender();
    });
  });
  
  document.getElementById('searchInput')?.addEventListener('input', () => API.scheduleRender());
  document.getElementById('sortFilter')?.addEventListener('change', () => API.scheduleRender());
}

// Update user display
async function updateUserDisplay() {
  const userDisplay = document.getElementById("userDisplay");
  const groupsLink = document.getElementById("groupsLink");
  const profileBtn = document.getElementById("profileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const createGroupBtn = document.getElementById("createGroupBtn");
  const adminLink = document.getElementById("adminLink");
  
  if (!userDisplay) return;
  if (!state.currentUser || state.currentUser.role === "guest") {
    userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser?.displayName || "Guest")}`;
    if (groupsLink) groupsLink.style.display = "inline-block";
    if (profileBtn) profileBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (createGroupBtn) createGroupBtn.style.display = "none";
    if (adminLink) adminLink.style.display = "none";
  } else {
    userDisplay.innerHTML = `👤 ${escapeHtml(state.currentUser.displayName)}`;
    if (groupsLink) groupsLink.style.display = "inline-block";
    if (profileBtn) profileBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (createGroupBtn) createGroupBtn.style.display = !hasGroup(state.currentUser) ? "inline-block" : "none";
    if (adminLink) adminLink.style.display = canModerate(state.currentUser) ? "inline-block" : "none";
  }
}

// Subscribe to state changes
subscribe('currentUser', () => updateUserDisplay());

// ==================== WARNING & LOGIN FLOW ====================
document.getElementById('warningContinueBtn')?.addEventListener('click', () => {
  const mainPass = document.getElementById('mainPassword').value;
  if (mainPass !== 'danmei') {
    showNotification('❌ Sai mật khẩu chính!', true);
    return;
  }
  localStorage.setItem('mainPasswordExpiry', (Date.now() + 24 * 60 * 60 * 1000).toString());
  document.getElementById('warningOverlay').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  console.log("✅ Password correct, showing login page");
});

document.getElementById('exitBtn')?.addEventListener('click', () => {
  document.body.innerHTML = '<div style="height:100vh;display:flex;justify-content:center;align-items:center;background:black;color:white;">ĐÃ THOÁT</div>';
});

document.getElementById('guestBtn')?.addEventListener('click', async () => {
  console.log("👤 Guest login clicked");
  await API.handleGuestLogin();
  await initApp();
});

document.getElementById('checkEmailBtn')?.addEventListener('click', API.handleCheckEmail);
document.getElementById('verifyOtpBtn')?.addEventListener('click', API.handleVerifyOTP);
document.getElementById('passwordLoginBtn')?.addEventListener('click', API.handlePasswordLogin);
document.getElementById('completeRegisterBtn')?.addEventListener('click', API.handleCompleteRegistration);

document.getElementById('backToEmailBtn')?.addEventListener('click', () => {
  document.getElementById('otpGroup').style.display = 'none';
  document.getElementById('loginMsg').innerHTML = '';
});

document.getElementById('backToEmailBtn2')?.addEventListener('click', () => {
  document.getElementById('passwordGroup').style.display = 'none';
  document.getElementById('loginMsg').innerHTML = '';
});

// ==================== SESSION CHECK ====================
async function checkSession() {
  try {
    console.log("🔐 Checking session...");
    const restored = await Promise.race([
      API.restoreSession(),
      new Promise((resolve) => setTimeout(() => resolve(false), 5000))
    ]);
    
    if (!restored) {
      console.log("⚠️ No valid session, showing warning");
      document.getElementById('warningOverlay').style.display = 'flex';
    } else {
      console.log("✅ Session restored, showing main app");
      document.getElementById('warningOverlay').style.display = 'none';
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('mainContainer').style.display = 'block';
      await initApp();
    }
  } catch (err) {
    console.error("Session check error:", err);
    document.getElementById('warningOverlay').style.display = 'flex';
    showNotification("Lỗi khôi phục phiên: " + err.message, true);
  }
}

checkSession();

window.showHome = () => {
  window.location.href = 'index.html';
};
