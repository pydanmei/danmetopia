// auth.js - Hệ thống phân quyền chuẩn
// Role: admin | user | guest
// Privilege: moderator (boolean), groupId (string | null)

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

// ==================== DANH SÁCH ADMIN CỐ ĐỊNH (KHÔNG THỂ XÓA) ====================
export const ADMIN_EMAILS = [
  "pydanmeii@gmail.com",
  "pepyl4298@gmail.com",
  "maihuong4298@gmail.com"
];

// ==================== MẬT KHẨU CHÍNH ====================
export const MAIN_PASSWORD = "danmei";

// ==================== GUEST NAME COUNTER ====================
const GUEST_COUNTER_KEY = "guest_counter";

function getNextGuestNumber() {
  let counter = localStorage.getItem(GUEST_COUNTER_KEY);
  if (!counter) {
    counter = 1;
  } else {
    counter = parseInt(counter) + 1;
  }
  localStorage.setItem(GUEST_COUNTER_KEY, counter.toString());
  return counter;
}

export function generateRandomGuestName() {
  const number = getNextGuestNumber();
  return `Hủ nằm vùng ${number}`;
}

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
  
  await remove(ref(db, `otp_requests/${email.replace(/\./g, "_")}`));
  return { success: true, message: "OK" };
}

// ==================== USER DATA ====================
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
  if (userData?.privileges?.groupId) {
    const snapshot = await get(child(ref(db), `groups/${userData.privileges.groupId}`));
    return snapshot.exists() ? { id: userData.privileges.groupId, ...snapshot.val() } : null;
  }
  return null;
}

// ==================== KIỂM TRA ADMIN (KHÔNG THỂ XÓA) ====================
export function isAdminUser(email) {
  return ADMIN_EMAILS.includes(email);
}

export function isAdminByData(userData) {
  return userData?.role === "admin";
}

// ==================== CẤP BẬC NGƯỜI DÙNG ====================
export function getUserLevel(user) {
  if (!user) return -1;
  
  // Admin (role = "admin")
  if (user.role === "admin") return 4;
  
  // User có đặc quyền moderator
  if (user.role === "user" && user.privileges?.moderator === true) return 3;
  
  // User có đặc quyền nhóm dịch (kể cả admin cũng có thể có group)
  if ((user.role === "user" || user.role === "admin") && user.privileges?.groupId) return 2;
  
  // User thường
  if (user.role === "user") return 1;
  
  // Guest
  return 0;
}

export function getUserLevelText(user) {
  const level = getUserLevel(user);
  switch(level) {
    case 4: return "Quản trị viên";
    case 3: return "Người kiểm duyệt";
    case 2: return "Thành viên nhóm dịch";
    case 1: return "Thành viên";
    case 0: return "Khách";
    default: return "Không xác định";
  }
}

// ==================== TÊN HIỂN THỊ ====================
export async function getDisplayName(uid, email, userData) {
  if (!userData) {
    const data = await getUserData(uid);
    userData = data;
  }
  
  // Guest
  if (userData?.role === "guest" || !userData) {
    return generateRandomGuestName();
  }
  
  const nickname = userData?.nickname || email?.split("@")[0] || "Người dùng";
  
  // Admin
  if (userData?.role === "admin") {
    // Admin có thể có nhóm dịch
    if (userData?.privileges?.groupId) {
      const group = await getUserGroup(uid);
      const groupName = group?.groupName || "Nhóm dịch";
      return `${nickname} (Admin - ${groupName})`;
    }
    return `${nickname} (Admin)`;
  }
  
  // Moderator user
  if (userData?.role === "user" && userData?.privileges?.moderator === true) {
    if (userData?.privileges?.groupId) {
      const group = await getUserGroup(uid);
      const groupName = group?.groupName || "Nhóm dịch";
      return `${nickname} (Quản lý - ${groupName})`;
    }
    return `${nickname} (Quản lý)`;
  }
  
  // Group user
  if (userData?.role === "user" && userData?.privileges?.groupId) {
    const group = await getUserGroup(uid);
    const groupName = group?.groupName || "Nhóm dịch";
    return `${nickname} (${groupName})`;
  }
  
  // Normal user
  if (userData?.role === "user") {
    return nickname;
  }
  
  return generateRandomGuestName();
}

// ==================== KIỂM TRA QUYỀN ====================
export function isAdmin(userData) {
  return userData?.role === "admin";
}

export function isModerator(userData) {
  return userData?.role === "user" && userData?.privileges?.moderator === true;
}

export function hasGroup(userData) {
  return !!userData?.privileges?.groupId;
}

export function isGuest(userData) {
  return userData?.role === "guest" || !userData;
}

// ==================== QUYỀN HẠN CHI TIẾT ====================
export function canModerate(userData) {
  return isAdmin(userData) || isModerator(userData);
}

export function canDeleteStory(userData, storyOwnerUid) {
  // Admin có thể xóa mọi truyện
  if (isAdmin(userData)) return true;
  return false;
}

export function canDeleteUser(userData, targetUid, targetEmail) {
  // Admin KHÔNG thể bị xóa
  if (isAdminUser(targetEmail)) return false;
  // Chỉ admin mới có thể xóa user
  return isAdmin(userData);
}

export function canChangeRole(userData) {
  return isAdmin(userData);
}

export function canEditStory(userData, story) {
  // Admin có thể sửa mọi truyện
  if (isAdmin(userData)) return true;
  // Group user có thể sửa truyện của nhóm mình
  if (hasGroup(userData) && story?.groupId === userData?.privileges?.groupId) return true;
  return false;
}

export function canUpload(userData) {
  // Admin và user đều có thể upload
  return userData && (userData.role === "admin" || userData.role === "user");
}

export function canComment(userData) {
  return true; // Tất cả đều có thể comment (kể cả guest)
}

// ==================== TẠO USER MỚI ====================
export async function createNewUser(uid, email, nickname) {
  const isAdminEmail = isAdminUser(email);
  
  await set(ref(db, `users/${uid}`), {
    email: email,
    nickname: nickname || email.split("@")[0],
    role: isAdminEmail ? "admin" : "user",
    privileges: {
      moderator: false,
      groupId: null
    },
    follows: {},
    history: [],
    genrePref: {},
    strike: 0,
    bannedUntil: 0,
    createdAt: Date.now()
  });
  
  return { uid, email, role: isAdminEmail ? "admin" : "user" };
}

// ==================== CẬP NHẬT THÔNG TIN USER ====================
export async function updateNickname(uid, newNickname) {
  // Kiểm tra nickname trùng
  const usersRef = ref(db, 'users');
  const snapshot = await get(usersRef);
  if (snapshot.exists()) {
    const users = snapshot.val();
    for (const key in users) {
      if (users[key]?.nickname === newNickname && key !== uid) {
        throw new Error("Nickname đã tồn tại");
      }
    }
  }
  
  await update(ref(db, `users/${uid}`), { nickname: newNickname });
}

export async function setModerator(uid, isModerator) {
  await update(ref(db, `users/${uid}/privileges`), { moderator: isModerator });
}

export async function setGroupId(uid, groupId) {
  await update(ref(db, `users/${uid}/privileges`), { groupId: groupId });
}

export async function joinGroup(uid, groupId) {
  const groupRef = ref(db, `groups/${groupId}`);
  const groupSnap = await get(groupRef);
  
  if (!groupSnap.exists()) throw new Error("Nhóm không tồn tại");
  
  const members = groupSnap.val().members || [];
  if (!members.includes(uid)) {
    members.push(uid);
    await update(groupRef, { members: members });
  }
  
  await setGroupId(uid, groupId);
}

// ==================== TẠO NHÓM DỊCH ====================
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
  
  await setGroupId(userId, newGroupRef.key);
  
  return newGroupRef.key;
}

export async function getAllGroups() {
  const snapshot = await get(ref(db, 'groups'));
  const data = snapshot.val() || {};
  return Object.entries(data).map(([id, value]) => ({ id, ...value }));
}

export async function deleteGroup(groupId) {
  // Xóa group
  await remove(ref(db, `groups/${groupId}`));
  
  // Cập nhật tất cả user có groupId này (NHƯNG KHÔNG ẢNH HƯỞNG ĐẾN ADMIN)
  const usersRef = ref(db, 'users');
  const usersSnap = await get(usersRef);
  if (usersSnap.exists()) {
    const users = usersSnap.val();
    for (const uid in users) {
      if (users[uid]?.privileges?.groupId === groupId) {
        // Admin vẫn giữ được groupId nếu muốn, nhưng group đã xóa thì set null
        await update(ref(db, `users/${uid}/privileges`), { groupId: null });
      }
    }
  }
}

// ==================== XÓA USER (CÓ KIỂM TRA ADMIN) ====================
export async function deleteUser(uid, email) {
  // KHÔNG cho phép xóa admin
  if (isAdminUser(email)) {
    throw new Error("Không thể xóa tài khoản Admin");
  }
  
  // Xóa dữ liệu user
  await remove(ref(db, `users/${uid}`));
  
  // Xóa auth user (cần admin tự làm trên Firebase Console hoặc dùng Admin SDK)
  // Trong frontend chỉ xóa được dữ liệu Firestore/RTDB
  return true;
}

// ==================== LOGIN ====================
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
      await createNewUser(userCred.user.uid, email, null);
    } else {
      throw e;
    }
  }
  
  const userData = await getUserData(userCred.user.uid);
  const displayName = await getDisplayName(userCred.user.uid, email, userData);
  
  const sessionData = {
    uid: userCred.user.uid,
    email: email,
    role: userData?.role || "user",
    privileges: userData?.privileges || { moderator: false, groupId: null },
    nickname: userData?.nickname,
    displayName: displayName
  };
  
  localStorage.setItem("userSession", JSON.stringify(sessionData));
  return userCred.user;
}

export function saveGuestMode() {
  const guestName = generateRandomGuestName();
  const guestData = {
    role: "guest",
    privileges: { moderator: false, groupId: null },
    nickname: guestName,
    displayName: guestName
  };
  localStorage.setItem("guestMode", "true");
  localStorage.setItem("userSession", JSON.stringify(guestData));
  return guestName;
}

export function isGuestMode() {
  return localStorage.getItem("guestMode") === "true";
}

export function getCurrentSession() {
  const session = localStorage.getItem("userSession");
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

export async function logout() {
  await signOut(auth);
  localStorage.removeItem("userSession");
  localStorage.removeItem("guestMode");
  // Không reset guest counter khi logout
  window.location.href = "index.html";
}

// ==================== UPLOAD ẢNH ====================
export async function uploadImage(file) {
  const imageRef = storageRef(storage, "images/" + Date.now() + "_" + file.name);
  await uploadBytes(imageRef, file);
  return await getDownloadURL(imageRef);
}

// ==================== THEO DÕI AUTH STATE ====================
export function onAuthChange(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userData = await getUserData(user.uid);
      const displayName = await getDisplayName(user.uid, user.email, userData);
      
      const sessionData = {
        uid: user.uid,
        email: user.email,
        role: userData?.role || "user",
        privileges: userData?.privileges || { moderator: false, groupId: null },
        nickname: userData?.nickname,
        displayName: displayName
      };
      
      localStorage.setItem("userSession", JSON.stringify(sessionData));
      localStorage.removeItem("guestMode");
      callback(sessionData);
    } else if (!localStorage.getItem("guestMode")) {
      localStorage.removeItem("userSession");
      callback(null);
    }
  });
}
