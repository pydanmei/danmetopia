// db.js - bổ sung thêm
import { db } from "./auth.js";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ================= STORIES =================
export async function getStories() {
  const snap = await getDocs(collection(db, "stories"));
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// Lấy truyện đã duyệt (cho guest/user xem)
export async function getApprovedStories() {
  const q = query(collection(db, "stories"), where("approved", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// Lấy truyện của nhóm (cho group member)
export async function getStoriesByGroup(groupId) {
  const q = query(collection(db, "stories"), where("groupId", "==", groupId));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// Lấy truyện chờ duyệt (cho admin)
export async function getPendingStories() {
  const q = query(collection(db, "stories"), where("approved", "==", false));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

export async function createStory(data) {
  return await addDoc(collection(db, "stories"), {
    ...data,
    likes: 0,
    views: 0,
    approved: false,
    createdAt: serverTimestamp()
  });
}

export async function updateStory(id, data) {
  return await updateDoc(doc(db, "stories", id), data);
}

export async function deleteStory(id) {
  return await deleteDoc(doc(db, "stories", id));
}

export async function likeStory(id) {
  return await updateDoc(doc(db, "stories", id), {
    likes: increment(1)
  });
}

export async function viewStory(id) {
  return await updateDoc(doc(db, "stories", id), {
    views: increment(1)
  });
}

// ================= CHAPTERS =================
export async function addChapter(data) {
  return await addDoc(collection(db, "chapters"), {
    ...data,
    createdAt: serverTimestamp()
  });
}

export async function getChapters(storyId) {
  const q = query(collection(db, "chapters"), where("storyId", "==", storyId));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

export async function deleteChapter(id) {
  return await deleteDoc(doc(db, "chapters", id));
}

// ================= COMMENTS =================
export async function addComment(data) {
  return await addDoc(collection(db, "comments"), {
    ...data,
    createdAt: serverTimestamp()
  });
}

export async function getComments(storyId) {
  const q = query(collection(db, "comments"), where("storyId", "==", storyId));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

export async function deleteComment(id) {
  return await deleteDoc(doc(db, "comments", id));
}
