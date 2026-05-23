// ==================== CORE IMPORTS ====================
import { db, auth } from './core/firebase.js';
import { ADMIN_EMAILS } from './core/constants.js';

// ==================== MODULES IMPORTS ====================
import { 
  currentUserData, setUserSession, refreshUserSession,
  handleGuestLogin, handleCheckEmail, handleVerifyOTP, 
  handlePasswordLogin, handleCompleteRegistration, 
  logout, restoreSession, getUserData, loadUserData 
} from './modules/auth.js';

import { 
  allStories, loadStoriesRealtime, loadAllGroups, loadFollows,
  renderGenreFilter, renderCurrentTab, scheduleRender 
} from './modules/data.js';

import { 
  initUI, closeModal, showNotification, showLoading, 
  openStoryDetail, openEditStory, saveEditStory, 
  openProfile, saveProfile, createNewGroup, updateUserDisplay 
} from './modules/ui.js';

import { initUploadPanel } from './modules/upload.js';
import { initScrollButtons, escapeHtml, generateRandomGuestName, isAdmin, canModerate } from './modules/utils.js';
import { openReader, closeReaderModal, changeChapter, changeChapterTo, scrollToTop } from './modules/reader.js';

// ==================== GLOBAL EXPORTS ====================
window.currentUserData = currentUserData;
window.closeModal = closeModal;
window.showNotification = showNotification;
window.allStories = allStories;
window.isAdmin = isAdmin;
window.canModerate = canModerate;
window.refreshUserSession = refreshUserSession;
window.openStoryDetail = openStoryDetail;
window.openEditStory = openEditStory;
window.saveEditStory = saveEditStory;
window.openProfile = openProfile;
window.saveProfile = saveProfile;
window.createNewGroup = createNewGroup;
window.openReader = openReader;
window.closeReaderModal = closeReaderModal;
window.changeChapter = changeChapter;
window.changeChapterTo = changeChapterTo;
window.scrollToTop = scrollToTop;

// ==================== INITIALIZATION ====================
console.log("🚀 App starting...");

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
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('profileBtn')?.addEventListener('click', () => window.openProfile());
  document.getElementById('createGroupBtn')?.addEventListener('click', () => document.getElementById('groupModal').style.display = 'flex');
  document.getElementById('confirmGroupBtn')?.addEventListener('click', () => window.createNewGroup());
}

// Initialize app
async function initApp() {
  console.log("📱 Initializing app...");
  await loadComponents();
  await loadAllGroups();
  await loadFollows();
  renderGenreFilter();
  initUploadPanel();
  loadStoriesRealtime();
  initScrollButtons();
  initUI();
  await updateUserDisplay();
  console.log("✅ App initialized");
  
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.currentTab = btn.dataset.tab;
      scheduleRender();
    });
  });
  
  document.getElementById('searchInput')?.addEventListener('input', () => scheduleRender());
  document.getElementById('sortFilter')?.addEventListener('change', () => scheduleRender());
}

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
  await handleGuestLogin();
  await initApp();
});

document.getElementById('checkEmailBtn')?.addEventListener('click', handleCheckEmail);
document.getElementById('verifyOtpBtn')?.addEventListener('click', handleVerifyOTP);
document.getElementById('passwordLoginBtn')?.addEventListener('click', handlePasswordLogin);
document.getElementById('completeRegisterBtn')?.addEventListener('click', handleCompleteRegistration);

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
      restoreSession(),
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
