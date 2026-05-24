import { state, setState } from '../core/state.js';
import { FirebaseService } from '../core/firebaseService.js';

const { db, ref, get, child } = FirebaseService;

// Show notification
export function showNotification(msg, isError = false) {
  console.log("🔔 Notification:", msg, isError ? "ERROR" : "INFO");
  const notif = document.createElement("div");
  notif.className = "notification";
  notif.style.background = isError ? "#ff4444" : "#FF69B4";
  notif.style.color = "black";
  notif.innerText = msg;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// Show/hide loading spinner
export function showLoading(show) {
  setState('isLoading', show);
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

// Escape HTML
export function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, m => m === "&" ? "&amp;" : m === "<" ? "&lt;" : "&gt;");
}

// Generate random guest name
export function generateRandomGuestName() {
  return `Hủ nằm vùng ${Math.floor(Math.random() * 10000)}`;
}

// Check if user is admin
export function isAdmin(userData) { 
  return userData?.role === "admin"; 
}

// Check if user is moderator
export function isModerator(userData) { 
  return userData?.role === "user" && userData?.privileges?.moderator === true; 
}

// Check if user has group
export function hasGroup(userData) { 
  return userData?.privileges?.groupId !== null; 
}

// Check if user can moderate
export function canModerate(userData) { 
  return isAdmin(userData) || isModerator(userData); 
}

// Check if user can upload
export function canUpload(userData) { 
  return userData && (userData.role === "admin" || userData.role === "user"); 
}

// Initialize scroll buttons
export function initScrollButtons() {
  const scrollBtn = document.getElementById("scrollTopBtn");
  const floatingBtn = document.getElementById("floatingTopBtn");
  
  if (scrollBtn && floatingBtn) {
    const handleScroll = () => {
      const show = window.scrollY > 200;
      scrollBtn.style.display = show ? "flex" : "none";
      floatingBtn.style.display = show ? "flex" : "none";
    };
    
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    
    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    
    scrollBtn.addEventListener("click", scrollToTop);
    floatingBtn.addEventListener("click", scrollToTop);
  }
}

// Image cache
export const imageCache = new Map();

// Load image with lazy loading
export function loadImage(imgElement, src) {
  if (!imgElement) return;
  
  if (imageCache.has(src)) {
    imgElement.src = imageCache.get(src);
    return;
  }
  
  const tempImg = new Image();
  tempImg.onload = () => {
    imgElement.src = src;
    imageCache.set(src, src);
  };
  tempImg.onerror = () => {
    imgElement.src = "https://placehold.co/800x1200?text=Error";
  };
  tempImg.src = src;
}

// ==================== USER GROUP FUNCTIONS (THÊM MỚI) ====================

// Get user groups by UID
export async function getUserGroups(uid) {
  if (!uid) return [];
  
  const userGroups = [];
  try {
    const groupsSnap = await get(ref(db, "groups"));
    const groups = groupsSnap.val() || {};
    
    for (const gid in groups) {
      if (groups[gid].members && groups[gid].members.includes(uid)) {
        userGroups.push({ id: gid, ...groups[gid] });
      }
    }
    return userGroups;
  } catch (err) {
    console.error("Error getting user groups:", err);
    return [];
  }
}

// Get user group options for dropdown
export async function getUserGroupOptions() {
  if (!state.currentUser || state.currentUser.role === "guest") return [];
  const userGroups = await getUserGroups(state.currentUser.uid);
  return userGroups;
}

// Get user data by UID
export async function getUserData(uid) {
  try {
    const snap = await get(child(ref(db), `users/${uid}`));
    return snap.exists() ? snap.val() : null;
  } catch (err) {
    console.error("Error getting user data:", err);
    return null;
  }
}

// Get user group
export async function getUserGroup(uid) {
  const userData = await getUserData(uid);
  if (userData?.privileges?.groupId) {
    try {
      const snap = await get(child(ref(db), `groups/${userData.privileges.groupId}`));
      return snap.exists() ? { id: userData.privileges.groupId, ...snap.val() } : null;
    } catch (err) {
      console.error("Error getting user group:", err);
      return null;
    }
  }
  return null;
}

// Get display name
export async function getDisplayName(uid, email, userData) {
  if (!userData) userData = await getUserData(uid);
  if (!userData) return generateRandomGuestName();
  const nickname = userData?.nickname || email?.split("@")[0] || "Người dùng";
  if (userData?.role === "admin") return `${nickname} (Admin)`;
  if (userData?.role === "user" && userData?.privileges?.moderator) return `${nickname} (Quản lý)`;
  if (userData?.role === "user" && userData?.privileges?.groupId) {
    const group = await getUserGroup(uid);
    return `${nickname} (${group?.groupName || "Nhóm dịch"})`;
  }
  return nickname;
}
