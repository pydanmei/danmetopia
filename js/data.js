import { db, ref, get, child, push, update, remove, onValue, GENRE_LIST } from './db.js';
import { currentUserData, refreshUserSession } from './auth.js';
import { isAdmin, canModerate, showNotification, escapeHtml } from './utils.js';

export let allStories = [];
export let allGroups = [];
export let userFollows = {};
export let renderTimeout = null;
export let selectedGenre = "";
export let storiesUnsubscribe = null;

// Load stories realtime
export function loadStoriesRealtime() {
  if (storiesUnsubscribe) storiesUnsubscribe();
  const storiesRef = ref(db, 'stories');
  storiesUnsubscribe = onValue(storiesRef, (snapshot) => {
    const data = snapshot.val();
    allStories = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    scheduleRender();
  });
}

// Load all groups
export async function loadAllGroups() {
  const groupsSnap = await get(ref(db, "groups"));
  allGroups = groupsSnap.val() ? Object.entries(groupsSnap.val()).map(([id, g]) => ({ id, ...g })) : [];
}

// Load follows
export async function loadFollows() {
  if (!currentUserData || currentUserData.role === "guest") return;
  try {
    const snapshot = await get(ref(db, `users/${currentUserData.uid}/follows`));
    userFollows = snapshot.val() || {};
  } catch (err) { userFollows = {}; }
}

// Follow/unfollow
export async function followStory(storyId) {
  if (!currentUserData || currentUserData.role === "guest") {
    showNotification("Đăng nhập để theo dõi", true);
    return false;
  }
  if (!userFollows[storyId]) {
    userFollows[storyId] = true;
    await set(ref(db, `users/${currentUserData.uid}/follows`), userFollows);
    showNotification("✅ Đã theo dõi truyện");
  }
  return true;
}

export async function unfollowStory(storyId) {
  if (userFollows[storyId]) {
    delete userFollows[storyId];
    await set(ref(db, `users/${currentUserData.uid}/follows`), userFollows);
    showNotification("Đã bỏ theo dõi");
  }
}

export function isFollowing(storyId) { return !!userFollows[storyId]; }

// Like story
export async function likeStory(storyId) { 
  const storyRef = ref(db, `stories/${storyId}/likes`); 
  const snapshot = await get(storyRef); 
  await set(storyRef, (snapshot.val() || 0) + 1);
}

// Approve/Reject story
export async function approveStory(storyId) { 
  if (!canModerate(currentUserData)) return;
  await update(ref(db, `stories/${storyId}`), { approved: true }); 
  showNotification("Đã duyệt truyện");
}
