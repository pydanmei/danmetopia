import { FirebaseService } from '../core/firebaseService.js';
import { GENRE_LIST } from '../core/constants.js';
import { state, setState } from '../core/state.js';
import { refreshUserSession } from './auth.js';
import { isAdmin, canModerate, showNotification, escapeHtml } from './utils.js';

const { db, ref, get, set, update, remove, onValue } = FirebaseService;

let storiesUnsubscribe = null;

// Load stories realtime
export function loadStoriesRealtime() {
  if (storiesUnsubscribe) storiesUnsubscribe();
  const storiesRef = ref(db, 'stories');
  storiesUnsubscribe = onValue(storiesRef, (snapshot) => {
    const data = snapshot.val();
    const stories = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    setState('stories', stories);
    scheduleRender();
  });
}

// Load all groups
export async function loadAllGroups() {
  const groupsSnap = await get(ref(db, "groups"));
  const groups = groupsSnap.val() ? Object.entries(groupsSnap.val()).map(([id, g]) => ({ id, ...g })) : [];
  setState('groups', groups);
}

// Load follows
export async function loadFollows() {
  if (!state.currentUser || state.currentUser.role === "guest") return;
  try {
    const snapshot = await get(ref(db, `users/${state.currentUser.uid}/follows`));
    const follows = snapshot.val() || {};
    setState('follows', follows);
  } catch (err) { 
    setState('follows', {});
  }
}

// Follow/unfollow
export async function followStory(storyId) {
  if (!state.currentUser || state.currentUser.role === "guest") {
    showNotification("Đăng nhập để theo dõi", true);
    return false;
  }
  if (!state.follows[storyId]) {
    const newFollows = { ...state.follows, [storyId]: true };
    await set(ref(db, `users/${state.currentUser.uid}/follows`), newFollows);
    setState('follows', newFollows);
    showNotification("✅ Đã theo dõi truyện");
  }
  return true;
}

export async function unfollowStory(storyId) {
  if (state.follows[storyId]) {
    const newFollows = { ...state.follows };
    delete newFollows[storyId];
    await set(ref(db, `users/${state.currentUser.uid}/follows`), newFollows);
    setState('follows', newFollows);
    showNotification("Đã bỏ theo dõi");
  }
}

export function isFollowing(storyId) { return !!state.follows[storyId]; }

// Like story
export async function likeStory(storyId) { 
  const storyRef = ref(db, `stories/${storyId}/likes`); 
  const snapshot = await get(storyRef); 
  await set(storyRef, (snapshot.val() || 0) + 1);
}

// Approve/Reject story
export async function approveStory(storyId) { 
  if (!canModerate(state.currentUser)) return;
  await update(ref(db, `stories/${storyId}`), { approved: true }); 
  showNotification("Đã duyệt truyện");
}

export async function rejectStory(storyId) { 
  if (!canModerate(state.currentUser)) return;
  await update(ref(db, `stories/${storyId}`), { approved: false }); 
  showNotification("Đã từ chối truyện");
}

// Delete story
export async function deleteStory(storyId) { 
  if (!isAdmin(state.currentUser)) {
    showNotification("Bạn không có quyền xóa truyện", true);
    return;
  }
  await remove(ref(db, `stories/${storyId}`)); 
}

// Get chapters
export async function getChapters(storyId) {
  const snapshot = await get(ref(db, `chapters/${storyId}`));
  const data = snapshot.val() || {};
  const chapters = Object.entries(data).map(([id, value]) => ({ id, ...value }));
  chapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  return chapters;
}

// Render functions
export function renderGenreFilter() {
  const container = document.getElementById("genreFilterContainer");
  if (!container) return;
  let html = '';
  for (const genre of GENRE_LIST) {
    html += `<div class="genre-tooltip filter-genre-item" data-genre="${genre.name}">${genre.icon} ${genre.name}<span class="tooltip-text">${genre.desc}</span></div>`;
  }
  container.innerHTML = html;
  document.querySelectorAll('.filter-genre-item').forEach(el => {
    el.addEventListener('click', () => {
      const genre = el.dataset.genre;
      if (state.selectedGenre === genre) {
        setState('selectedGenre', "");
        el.classList.remove("active");
      } else {
        document.querySelectorAll('.filter-genre-item').forEach(g => g.classList.remove("active"));
        setState('selectedGenre', genre);
        el.classList.add("active");
      }
      scheduleRender();
    });
  });
}

let renderTimeout = null;
export function scheduleRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => renderCurrentTab(), 150);
}

export function renderCurrentTab() {
  if (!document.getElementById("mangaGrid")) return;
  let filtered = [];
  
  if (isAdmin(state.currentUser)) {
    filtered = [...state.stories];
  } else {
    filtered = state.stories.filter(s => s.approved === true);
  }
  
  if (state.selectedGenre) {
    filtered = filtered.filter(s => s.genres && s.genres.includes(state.selectedGenre));
  }
  const searchTerm = document.getElementById("searchInput")?.value.toLowerCase() || "";
  if (searchTerm) filtered = filtered.filter(s => s.title?.toLowerCase().includes(searchTerm));
  const sortBy = document.getElementById("sortFilter")?.value;
  if (sortBy === "likes") filtered.sort((a,b) => (b.likes||0) - (a.likes||0));
  else if (sortBy === "views") filtered.sort((a,b) => (b.views||0) - (a.views||0));
  else filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  renderMangaGrid(filtered);
}

export function renderMangaGrid(stories) {
  const grid = document.getElementById("mangaGrid");
  if (!grid) return;
  if (!stories.length) { grid.innerHTML = "<div style='text-align:center; padding:50px;'>📭 Không có truyện nào</div>"; return; }
  grid.innerHTML = stories.map(story => `
    <div class="manga-card" onclick="API.openStoryDetail('${story.id}')">
      <img class="manga-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/300x450?text=No+Cover'}" onerror="this.src='https://placehold.co/300x450?text=ERROR'">
      <div class="manga-info">
        <div class="manga-title">${escapeHtml(story.title)}</div>
        <div class="manga-meta">📚 ${escapeHtml(story.groupName) || "Cá nhân"}</div>
        <div class="manga-meta">❤️ ${story.likes || 0} | 👁 ${story.views || 0}</div>
        ${story.approved === false ? '<div class="manga-meta" style="color:#FFCC00;">⏳ Chờ duyệt</div>' : ''}
        <div class="manga-meta">${story.status === "Đã hoàn thành" ? "✅ Hoàn thành" : story.status === "Tạm ngưng" ? "⏸ Tạm ngưng" : "📖 Đang ra"}</div>
      </div>
    </div>
  `).join("");
}
