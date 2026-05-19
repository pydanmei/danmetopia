// auth.js - Role system đúng theo yêu cầu
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDQk9DlMNKwn_508fDMI_3IB_dgpgHujA",
  authDomain: "danmetopia.firebaseapp.com",
  projectId: "danmetopia",
  storageBucket: "danmetopia.appspot.com",
  messagingSenderId: "178240377870",
  appId: "1:178240377870:web:d094b222ebabadccc5585f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Admin emails cố định
const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com"];

// Helper: lấy user data từ Firestore
export async function getUserData(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) return snap.data();
  return null;
}

// Helper: lấy group của user
export async function getUserGroup(uid) {
  const userData = await getUserData(uid);
  if (userData && userData.groupId) {
    const groupSnap = await getDoc(doc(db, "groups", userData.groupId));
    if (groupSnap.exists()) return { id: groupSnap.id, ...groupSnap.data() };
  }
  return null;
}

// Helper: kiểm tra user có quyền group không
export async function hasGroupRole(uid) {
  const group = await getUserGroup(uid);
  return group !== null;
}

// Helper: lấy display name cho user
export async function getDisplayName(uid, email) {
  const userData = await getUserData(uid);
  const nickname = userData?.nickname || email?.split("@")[0] || "Ẩn danh";
  const group = await getUserGroup(uid);
  if (group) return `${nickname} (${group.groupName})`;
  return nickname;
}

// Helper: lấy role của user (dùng cho phân quyền)
export async function getUserRole(uid, email) {
  if (ADMIN_EMAILS.includes(email)) return "admin";
  const hasGroup = await hasGroupRole(uid);
  if (hasGroup) return "group";
  return "user";
}

// Tạo user mới
export async function createUser(email, password, nickname) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    email: email,
    nickname: nickname || email.split("@")[0],
    createdAt: new Date().toISOString(),
    groupId: null,
    bookmarks: [],
    history: []
  });
  return cred.user;
}

// Đăng nhập
export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const userData = await getUserData(cred.user.uid);
  const role = await getUserRole(cred.user.uid, email);
  const displayName = await getDisplayName(cred.user.uid, email);
  
  localStorage.setItem("user", JSON.stringify({
    uid: cred.user.uid,
    email: email,
    role: role,
    nickname: userData?.nickname || email.split("@")[0],
    groupId: userData?.groupId || null,
    displayName: displayName
  }));
  return cred.user;
}

// Guest mode
export function saveGuest() {
  localStorage.setItem("user", JSON.stringify({
    role: "guest",
    displayName: "Ẩn danh"
  }));
}

// Tạo nhóm dịch (user tạo group)
export async function createGroup(userId, groupName, description) {
  // Tạo group mới
  const groupRef = await addDoc(collection(db, "groups"), {
    groupName: groupName,
    description: description || "",
    ownerId: userId,
    members: [userId],
    createdAt: new Date().toISOString(),
    approved: false // cần admin duyệt? có thể bỏ
  });
  
  // Cập nhật user có groupId
  await updateDoc(doc(db, "users", userId), {
    groupId: groupRef.id
  });
  
  return groupRef.id;
}

// Tham gia nhóm (user join group)
export async function joinGroup(userId, groupId) {
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (groupSnap.exists()) {
    const members = groupSnap.data().members || [];
    if (!members.includes(userId)) {
      await updateDoc(groupRef, {
        members: [...members, userId]
      });
    }
  }
  await updateDoc(doc(db, "users", userId), {
    groupId: groupId
  });
}

// Lấy danh sách nhóm (để user chọn tham gia)
export async function getAllGroups() {
  const snap = await getDocs(collection(db, "groups"));
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Upload ảnh lên storage
export async function uploadImage(file) {
  const imageRef = ref(storage, "images/" + Date.now() + "_" + file.name);
  await uploadBytes(imageRef, file);
  return await getDownloadURL(imageRef);
}

// Logout
export function logout() {
  signOut(auth);
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

// Theo dõi auth state
export function onAuthChange(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const role = await getUserRole(user.uid, user.email);
      const displayName = await getDisplayName(user.uid, user.email);
      const userData = await getUserData(user.uid);
      localStorage.setItem("user", JSON.stringify({
        uid: user.uid,
        email: user.email,
        role: role,
        nickname: userData?.nickname || user.email.split("@")[0],
        groupId: userData?.groupId || null,
        displayName: displayName
      }));
      callback(user);
    } else {
      callback(null);
    }
  });
}
