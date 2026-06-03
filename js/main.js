import { auth, db } from "./firebase-config.js";
import { state } from "./state.js";
import { 
  showNotification, showLoading, isAdmin, canModerate, canUpload, 
  isNicknameExists, generateSlug, parseGenresAndTags, GENRE_LIST, escapeHtml 
} from "./utils.js";
import {
  handleWarningContinue, handleGuestLogin, handleCheckEmail, handleVerifyOTP,
  handlePasswordLogin, handleCompleteRegistration, restoreSession, logout,
  refreshUserSession, setUserSession, isMainPasswordValid
} from "./auth.js";
import {
  loadStoriesRealtime, loadAllGroups, loadFollows, followStory, unfollowStory,
  isFollowing, likeStory, approveStory, rejectStory, deleteStory,
  addBookmark, removeBookmark, isBookmarked, loadBookmarks, saveBookmarks,
  loadHistory, saveHistory, getChapters, uploadImage, uploadMultipleImages
} from "./data.js";
import { renderGenreFilter, renderCurrentTab, renderUploadPanel, loadUrlParams } from "./ui.js";
import { goToStory, goToChapter, goToHome, goToAdmin, goToGroups, goToStoryDetail, openReader } from "./router.js";

// Khởi tạo EmailJS
emailjs.init("fPq8fpw1OqzOtj-lk");

// Hàm scroll buttons
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

function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = "none"; }

// Load components
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
    document.getElementById('profileBtn')?.addEventListener('click', () => window.location.href = 'index.html');
    document.getElementById('createGroupBtn')?.addEventListener('click', () => document.getElementById('groupModal').style.display = 'flex');
    document.getElementById('confirmGroupBtn')?.addEventListener('click', () => window.createNewGroup());
    document.getElementById('adminLink')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'admin.html'; });
    document.getElementById('groupsLink')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'groups.html'; });
  } catch (err) { console.error("Error loading components:", err); }
}

// Update user display
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

// Init app
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
  loadStoriesRealtime(() => {
    loadUrlParams();
  });
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentTab = btn.dataset.tab;
      renderCurrentTab();
    });
  });
  document.getElementById("searchInput")?.addEventListener("input", (e) => { state.searchKeyword = e.target.value.toLowerCase(); renderCurrentTab(); });
  document.getElementById("sortFilter")?.addEventListener("change", (e) => { state.sortBy = e.target.value; renderCurrentTab(); });
}

// Startup
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
window.goToStory = goToStory;
window.goToChapter = goToChapter;
window.goToHome = goToHome;
window.goToAdmin = goToAdmin;
window.goToGroups = goToGroups;
window.goToStoryDetail = goToStoryDetail;
window.openReader = openReader;
window.closeModal = closeModal;
window.showNotification = showNotification;
