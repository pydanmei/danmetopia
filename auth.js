// auth.js - Hệ thống OTP + Realtime Database + Role mới
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  child,
  push,
  update,
  remove,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);

// ==================== OTP FUNCTIONS ====================
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOTP(email) {
  const otp = generateOTP();
  const expires = Date.now() + 5 * 60 * 1000; // 5 phút
  
  await set(ref(db, `otp_requests/${email.replace(/\./g, "_")}`), {
    code: otp,
    expires: expires
  });
  
  console.log(`[OTP] Mã cho ${email}: ${otp}`);
  return otp;
}

export async function verifyOTP(email, inputCode) {
  const snap = await get(ref(db, `otp_requests/${email.replace(/\./g, "_")}`));
  const data = snap.val();
  
  if (!data) return { success: false, message: "Mã OTP không tồn tại" };
  if (Date.now() > data.expires) return { success: false, message: "Mã OTP đã hết hạn" };
  if (data.code !== inputCode) return { success: false, message: "Sai mã OTP" };
  
  // Xóa OTP sau khi dùng thành công
  await remove(ref(db, `otp_requests/${email.replace(/\./g, "_")}`));
  return { success: true, message: "OK" };
}

// ==================== USER FUNCTIONS ====================
export async function getUserData(uid) {
  try {
    const snapshot = await get(child(ref(db), `users/${uid}`));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (err) {
    console.error("getUserData error:", err);
    return null;
  }
}

export async function getUserGroup(uid) {
  const userData = await getUserData(uid);
  if (userData?.groupId) {
    const snapshot = await get(child(ref(db), `groups/${userData.groupId}`));
    return snapshot.exists() ? { id: userData.groupId, ...snapshot.val() } : null;
  }
  return null;
}

export async function getUserRole(uid, email) {
  const userData = await getUserData(uid);
  if (userData?.role) return userData.role;
  return "user";
}

export async function getDisplayName(uid, email) {
  const userData = await getUserData(uid);
  const nickname = userData?.nickname || email?.split("@")[0] || "Ẩn danh";
  const group = await getUserGroup(uid);
  if (group) return `${nickname} (${group.groupName})`;
  return nickname;
}

// Đăng nhập bằng OTP (tạo hoặc sign in user)
export async function loginWithOTP(email, otp) {
  const verifyResult = await verifyOTP(email, otp);
  if (!verifyResult.success) throw new Error(verifyResult.message);
  
  const dummyPassword = "otp-temp-" + Date.now();
  let userCred;
  
  try {
    userCred = await signInWithEmailAndPassword(auth, email, dummyPassword);
  } catch (e) {
    if (e.code === "auth/user-not-found" || e.code === "auth/wrong-password") {
      userCred = await createUserWithEmailAndPassword(auth, email, dummyPassword);
      await set(ref(db, `users/${userCred.user.uid}`), {
        email: email,
        nickname: null,
        role: "user",
        follows: {},
        history: [],
        genrePref: {},
        strike: 0,
        bannedUntil: 0,
        createdAt: Date.now()
      });
    } else {
      throw e;
    }
  }
  
  const userData = await getUserData(userCred.user.uid);
  const role = await getUserRole(userCred.user.uid, email);
  const displayName = await getDisplayName(userCred.user.uid, email);
  
  localStorage.setItem("userSession", JSON.stringify({
    uid: userCred.user.uid,
    email: email,
    role: role,
    nickname: userData?.nickname,
    groupId: userData?.groupId || null,
    displayName: displayName
  }));
  
  return userCred.user;
}

// Guest mode
export function saveGuestMode() {
  localStorage.setItem("guestMode", "true");
  localStorage.setItem("userSession", JSON.stringify({
    role: "guest",
    displayName: "Ẩn danh"
  }));
}

export function isGuestMode() {
  return localStorage.getItem("guestMode") === "true";
}

// Tạo nickname cho user mới
export async function setNickname(uid, nickname) {
  // Kiểm tra nickname đã tồn tại
  const usersRef = ref(db, 'users');
  const snapshot = await get(usersRef);
  let nicknameExists = false;
  
  if (snapshot.exists()) {
    const users = snapshot.val();
    for (const key in users) {
      if (users[key]?.nickname === nickname) {
        nicknameExists = true;
        break;
      }
    }
  }
  
  if (nicknameExists) throw new Error("Nickname đã tồn tại");
  
  await update(ref(db, `users/${uid}`), { nickname: nickname });
}

// Tạo nhóm dịch
export async function createGroup(userId, groupName, description) {
  const groupsRef = ref(db, 'groups');
  const newGroupRef = push(groupsRef);
  
  await set(newGroupRef, {
    groupName: groupName,
    description: description || "",
    ownerId: userId,
    members: [userId],
    createdAt: Date.now()
  });
  
  await update(ref(db, `users/${userId}`), {
    groupId: newGroupRef.key
  });
  
  return newGroupRef.key;
}

// Lấy danh sách nhóm
export async function getAllGroups() {
  const snapshot = await get(ref(db, 'groups'));
  const data = snapshot.val() || {};
  return Object.entries(data).map(([id, value]) => ({ id, ...value }));
}

// Upload ảnh lên storage
export async function uploadImage(file) {
  const imageRef = storageRef(storage, "images/" + Date.now() + "_" + file.name);
  await uploadBytes(imageRef, file);
  return await getDownloadURL(imageRef);
}

// Logout
export async function logout() {
  await signOut(auth);
  localStorage.removeItem("userSession");
  localStorage.removeItem("guestMode");
  window.location.href = "index.html";
}

// Theo dõi auth state
export function onAuthChange(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userData = await getUserData(user.uid);
      const role = await getUserRole(user.uid, user.email);
      const displayName = await getDisplayName(user.uid, user.email);
      
      localStorage.setItem("userSession", JSON.stringify({
        uid: user.uid,
        email: user.email,
        role: role,
        nickname: userData?.nickname,
        groupId: userData?.groupId || null,
        displayName: displayName
      }));
      callback(user);
    } else {
      localStorage.removeItem("userSession");
      callback(null);
    }
  });
}

// Helper: kiểm tra user có quyền moderate không
export function canModerate(userData) {
  return userData?.role === "admin" || userData?.role === "moderator";
}

// Helper: kiểm tra user có quyền upload không
export function canUpload(userData) {
  return userData?.role && userData.role !== "guest";
}
