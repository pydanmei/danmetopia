import { db, ref, set, get, push, update, remove, onValue, IMGBB_API_KEY } from "./firebase-config.js";
import { showNotification, showLoading, generateSlug, parseGenresAndTags } from "./utils.js";
import { state } from "./state.js";
import { isAdmin } from "./utils.js";

// ==================== STORIES CRUD ====================
export async function loadStoriesRealtime(callback) {
  const storiesRef = ref(db, 'stories');
  onValue(storiesRef, async (snapshot) => {
    const data = snapshot.val();
    state.stories = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    for (const story of state.stories) {
      if (!story.slug && story.title) {
        const newSlug = generateSlug(story.title);
        await update(ref(db, `stories/${story.id}`), { slug: newSlug });
        story.slug = newSlug;
      }
    }
    if (callback) callback();
  });
}

export async function uploadImage(file) {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) { showNotification(`Ảnh ${file.name} quá lớn (tối đa 10MB)`, true); return null; }
  const formData = new FormData();
  formData.append("image", file);
  formData.append("key", IMGBB_API_KEY);
  try {
    const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
    const result = await response.json();
    return result.success ? result.data.url : null;
  } catch (err) { showNotification("Lỗi upload: " + err.message, true); return null; }
}

export async function uploadMultipleImages(files) {
  if (!files || files.length === 0) return [];
  const urls = [];
  for (const file of files) {
    const url = await uploadImage(file);
    if (url) urls.push(url);
  }
  return urls;
}

export async function createStory(data, coverFile, chapterImages) {
  let coverUrl = data.cover;
  if (coverFile) coverUrl = await uploadImage(coverFile);
  if (!data.title) throw new Error("Thiếu title");
  const newStoryRef = push(ref(db, 'stories'));
  const isAdminUser = isAdmin(state.currentUser);
  const slug = generateSlug(data.title);
  await set(newStoryRef, {
    title: data.title, slug: slug, otherName: data.otherName || "", author: data.author || "",
    genres: data.genres || "", tags: data.tags || "", status: data.status || "Đang tiến hành",
    desc: data.desc || "", cover: coverUrl || "", ownerUid: state.currentUser?.uid || "",
    ownerNickname: state.currentUser?.nickname || "Người dùng", groupId: data.groupId || null,
    groupName: data.groupName || "", likes: 0, views: 0, approved: isAdminUser, createdAt: Date.now(), chapters: {}
  });
  if (chapterImages && chapterImages.length > 0) {
    await addChapter(newStoryRef.key, "Chapter 1", chapterImages, 1);
  }
  showNotification(isAdminUser ? "✅ Đã đăng truyện (Admin)" : "📤 Đã gửi truyện, chờ duyệt");
}

export async function updateStoryData(storyId, data) { await update(ref(db, `stories/${storyId}`), data); }
export async function deleteStory(storyId) { await remove(ref(db, `stories/${storyId}`)); }
export async function likeStory(storyId) { const refStory = ref(db, `stories/${storyId}/likes`); const snapshot = await get(refStory); await set(refStory, (snapshot.val() || 0) + 1); }
export async function approveStory(storyId) { await update(ref(db, `stories/${storyId}`), { approved: true }); showNotification("Đã duyệt truyện"); }
export async function rejectStory(storyId) { await update(ref(db, `stories/${storyId}`), { approved: false }); showNotification("Đã từ chối truyện"); }

// ==================== CHAPTERS ====================
export async function getChapters(storyId) {
  const snapshot = await get(ref(db, `chapters/${storyId}`));
  const data = snapshot.val() || {};
  const chapters = Object.entries(data).map(([id, value]) => ({ id, ...value }));
  chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  return chapters;
}

export async function getChapter(storyId, chapterId) {
  const snap = await get(ref(db, `chapters/${storyId}/${chapterId}`));
  return snap.exists() ? { id: chapterId, ...snap.val() } : null;
}

export async function addChapter(storyId, title, pages, chapterNumber) {
  if (!title) throw new Error("Thiếu title");
  const existingChapters = await getChapters(storyId);
  const newChapterNumber = chapterNumber || existingChapters.length + 1;
  const newChapterRef = push(ref(db, `chapters/${storyId}`));
  await set(newChapterRef, { title, pages, chapterNumber: newChapterNumber, createdAt: Date.now() });
  const storyRef = ref(db, `stories/${storyId}/chapters`);
  const snap = await get(storyRef);
  const currentChapters = snap.val() || {};
  currentChapters[newChapterRef.key] = true;
  await set(storyRef, currentChapters);
}

export async function updateChapter(storyId, chapterId, data) {
  await update(ref(db, `chapters/${storyId}/${chapterId}`), data);
  showNotification("✅ Đã cập nhật chapter");
}

export async function deleteChapter(storyId, chapterId) {
  await remove(ref(db, `chapters/${storyId}/${chapterId}`));
  const storyRef = ref(db, `stories/${storyId}/chapters`);
  const snap = await get(storyRef);
  const chapters = snap.val() || {};
  delete chapters[chapterId];
  await set(storyRef, chapters);
  showNotification("✅ Đã xóa chapter!");
}

// ==================== GROUPS ====================
export async function loadAllGroups() {
  try {
    const groupsSnap = await get(ref(db, "groups"));
    state.allGroups = groupsSnap.exists() ? Object.entries(groupsSnap.val()).map(([id, g]) => ({ id, ...g })) : [];
    return state.allGroups;
  } catch (err) { state.allGroups = []; return []; }
}

export async function getUserGroups(uid) {
  if (!uid) return [];
  if (state.allGroups.length === 0) await loadAllGroups();
  return state.allGroups.filter(group => group.members?.includes(uid));
}

export async function getUserGroupOptions() {
  if (!state.currentUser || state.currentUser.role === "guest") return [];
  return await getUserGroups(state.currentUser.uid);
}

// ==================== FOLLOWS ====================
export async function loadFollows() {
  if (!state.currentUser || state.currentUser.role === "guest") return;
  const snapshot = await get(ref(db, `users/${state.currentUser.uid}/follows`));
  state.userFollows = snapshot.val() || {};
}

export async function followStory(storyId) {
  if (!state.currentUser || state.currentUser.role === "guest") { showNotification("Đăng nhập để theo dõi", true); return false; }
  if (!state.userFollows[storyId]) {
    state.userFollows[storyId] = true;
    await set(ref(db, `users/${state.currentUser.uid}/follows`), state.userFollows);
    showNotification("✅ Đã theo dõi truyện");
  }
}

export async function unfollowStory(storyId) {
  if (state.userFollows[storyId]) {
    delete state.userFollows[storyId];
    await set(ref(db, `users/${state.currentUser.uid}/follows`), state.userFollows);
    showNotification("Đã bỏ theo dõi");
  }
}

export function isFollowing(storyId) { return !!state.userFollows[storyId]; }

// ==================== BOOKMARK & HISTORY ====================
export function loadBookmarks() {
  const saved = localStorage.getItem("danmetopia_bookmarks");
  state.bookmarks = saved ? JSON.parse(saved) : [];
}
export function saveBookmarks() { localStorage.setItem("danmetopia_bookmarks", JSON.stringify(state.bookmarks)); }
export function addBookmark(storyId) { if (!state.bookmarks.includes(storyId)) { state.bookmarks.push(storyId); saveBookmarks(); showNotification("📑 Đã thêm vào bookmark"); } }
export function removeBookmark(storyId) { state.bookmarks = state.bookmarks.filter(id => id !== storyId); saveBookmarks(); showNotification("Đã xóa khỏi bookmark"); }
export function isBookmarked(storyId) { return state.bookmarks.includes(storyId); }

export function loadHistory() {
  const saved = localStorage.getItem("danmetopia_history");
  state.readingHistory = saved ? JSON.parse(saved) : [];
}
export function saveHistory() { localStorage.setItem("danmetopia_history", JSON.stringify(state.readingHistory)); }
