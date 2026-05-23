import { FirebaseService } from '../core/firebaseService.js';
import { state, setState } from '../core/state.js';
import { currentUserData, refreshUserSession } from './auth.js';
import { getUserGroups } from './utils.js';
import { isAdmin, canModerate, hasGroup, showNotification, showLoading, escapeHtml } from './utils.js';
import { getChapters, followStory, unfollowStory, isFollowing, likeStory, approveStory, rejectStory, deleteStory } from './data.js';
import { uploadImage } from './upload.js';

const { db, ref, get, update, push, set } = FirebaseService;

// Close modal
export function closeModal(modalId) { 
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none"; 
}

// Open story detail
export async function openStoryDetail(storyId) {
  refreshUserSession();
  const story = state.stories.find(s => s.id === storyId);
  if (!story) return;
  const chapters = await getChapters(storyId);
  
  const canEditStory = state.currentUser && (isAdmin(state.currentUser) || (state.currentUser.privileges?.groupId && story.groupId === state.currentUser.privileges?.groupId) || story.ownerUid === state.currentUser?.uid);
  const canEditChapter = state.currentUser && (isAdmin(state.currentUser) || (state.currentUser.privileges?.groupId && story.groupId === state.currentUser.privileges?.groupId) || story.ownerUid === state.currentUser?.uid);
  const canDeleteChapter = state.currentUser && isAdmin(state.currentUser);
  const isMod = canModerate(state.currentUser);
  
  document.getElementById("storyDetailContent").innerHTML = `
    <div class="story-detail-grid">
      <img class="story-detail-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/300x450?text=No+Cover'}" onerror="this.src='https://placehold.co/300x450?text=ERROR'">
      <div class="story-detail-info">
        <h2>${escapeHtml(story.title)}</h2>
        <p><span class="story-detail-label">📖 Tên khác:</span> ${escapeHtml(story.otherName) || "Chưa có"}</p>
        <p><span class="story-detail-label">✍️ Tác giả:</span> ${escapeHtml(story.author) || "Chưa rõ"}</p>
        <p><span class="story-detail-label">🏷️ Thể loại:</span> ${escapeHtml(story.genres) || "Chưa cập nhật"}</p>
        <p><span class="story-detail-label">📚 Nhóm dịch:</span> ${escapeHtml(story.groupName) || "Cá nhân"}</p>
        <p><span class="story-detail-label">📌 Tình trạng:</span> ${story.status === "Đã hoàn thành" ? "✅ " : story.status === "Tạm ngưng" ? "⏸ " : "📖 "}${escapeHtml(story.status) || "Đang tiến hành"}</p>
        <p><span class="story-detail-label">📖 Số chương:</span> ${chapters.length}</p>
        <p><span class="story-detail-label">🏷️ Tags:</span> ${escapeHtml(story.tags) || "Chưa có"}</p>
        <p><span class="story-detail-label">📝 Mô tả:</span><br>${escapeHtml(story.desc) || "Chưa có mô tả"}</p>
        <p><span class="story-detail-label">❤️ Lượt thích:</span> ${story.likes || 0}</p>
        <p><span class="story-detail-label">👁 Lượt xem:</span> ${story.views || 0}</p>
      </div>
    </div>
  `;
  
  let chaptersHtml = `<h3>📖 DANH SÁCH CHAPTER</h3><div class="chapter-list">`;
  chapters.forEach((chap) => {
    chaptersHtml += `
      <div class="chapter-item" onclick="API.openReader('${storyId}', ${chap.chapterNumber - 1})">
        <span>${escapeHtml(chap.title)}</span>
        <span style="font-size:12px; color:#888;">📅 ${new Date(chap.createdAt).toLocaleDateString()}</span>
        <div class="chapter-actions">
          ${canEditChapter ? `<button class="chapter-edit-btn" onclick="event.stopPropagation(); API.openEditChapter('${storyId}', '${chap.id}')">✏️ Sửa</button>` : ''}
          ${canDeleteChapter ? `<button class="chapter-delete-btn" onclick="event.stopPropagation(); API.deleteChapter('${storyId}', '${chap.id}')">🗑 Xóa</button>` : ''}
        </div>
      </div>
    `;
  });
  chaptersHtml += `</div>`;
  document.getElementById("storyChapters").innerHTML = chaptersHtml;
  
  let actionsHtml = `<button onclick="API.likeStoryAndRefresh('${storyId}')">❤️ Thích</button>`;
  if (state.currentUser && state.currentUser.role !== "guest") actionsHtml += `<button onclick="API.toggleFollow('${storyId}')">${isFollowing(storyId) ? '⭐ Đã theo dõi' : '➕ Theo dõi'}</button>`;
  if (canEditStory) actionsHtml += `<button onclick="API.openEditStory('${storyId}')">✏️ Chỉnh sửa truyện</button><button onclick="API.openAddChapter('${storyId}')">📖 Thêm chapter mới</button>`;
  if (isMod && story.approved === false) actionsHtml += `<button onclick="API.approveStoryAction('${storyId}')">✅ Duyệt truyện</button><button onclick="API.rejectStoryAction('${storyId}')">❌ Từ chối</button>`;
  if (isAdmin(state.currentUser)) actionsHtml += `<button onclick="API.deleteStoryAction('${storyId}')" style="background:#ff4444;">🗑 Xóa truyện</button>`;
  document.getElementById("storyActions").innerHTML = actionsHtml;
  document.getElementById("storyModal").style.display = "flex";
}

// Helper functions
window.likeStoryAndRefresh = async (storyId) => { await likeStory(storyId); openStoryDetail(storyId); };
window.approveStoryAction = async (storyId) => { await approveStory(storyId); closeModal("storyModal"); };
window.rejectStoryAction = async (storyId) => { await rejectStory(storyId); closeModal("storyModal"); };
window.deleteStoryAction = async (storyId) => { if (confirm("Xóa truyện?")) { await deleteStory(storyId); closeModal("storyModal"); } };
window.toggleFollow = async (storyId) => { if (isFollowing(storyId)) await unfollowStory(storyId); else await followStory(storyId); openStoryDetail(storyId); };

// Open edit story
export async function openEditStory(storyId) {
  const story = state.stories.find(s => s.id === storyId);
  const userGroups = await getUserGroups(state.currentUser?.uid);
  let groupOptions = '<option value="">-- Không có nhóm --</option>';
  for (const group of userGroups) {
    groupOptions += `<option value="${group.id}" ${story.groupId === group.id ? 'selected' : ''}>${escapeHtml(group.groupName)}</option>`;
  }
  let mainGenre = story.genres || "";
  let subGenre = "";
  if (mainGenre.includes(",")) {
    const parts = mainGenre.split(",");
    mainGenre = parts[0].trim();
    subGenre = parts.slice(1).join(",").trim();
  }
  document.getElementById("editStoryContent").innerHTML = `
    <input id="editTitle" value="${escapeHtml(story.title)}" placeholder="Tên truyện *">
    <input id="editOtherName" value="${escapeHtml(story.otherName || '')}" placeholder="Tên khác">
    <input id="editAuthor" value="${escapeHtml(story.author || '')}" placeholder="Tác giả">
    
    <label style="color:#FF69B4; margin-top:10px; display:block;">📖 Thể loại (có thể chọn hoặc tự nhập)</label>
    <input id="editGenre" list="genreDropdown" value="${escapeHtml(mainGenre)}" placeholder="Chọn hoặc nhập thể loại chính">
    <input id="editGenre2" value="${escapeHtml(subGenre)}" placeholder="Thể loại phụ (không bắt buộc)" list="genreDropdown">
    
    <label style="color:#FF69B4; margin-top:10px; display:block;">🏷️ Tags</label>
    <input id="editTags" value="${escapeHtml(story.tags || '')}" placeholder="Tags cách nhau bằng dấu phẩy">
    
    <select id="editStatus">
      <option value="Đang tiến hành" ${story.status === "Đang tiến hành" ? "selected" : ""}>📖 Đang tiến hành</option>
      <option value="Đã hoàn thành" ${story.status === "Đã hoàn thành" ? "selected" : ""}>✅ Đã hoàn thành</option>
      <option value="Tạm ngưng" ${story.status === "Tạm ngưng" ? "selected" : ""}>⏸ Tạm ngưng</option>
    </select>
    <select id="editGroupId">${groupOptions}</select>
    <input type="file" id="editCoverFile" accept="image/*">
    <input id="editCover" value="${escapeHtml(story.cover || '')}" placeholder="Hoặc link ảnh bìa">
    <div id="editCoverPreview"></div>
    <textarea id="editDesc" placeholder="Mô tả truyện">${escapeHtml(story.desc || '')}</textarea>
    <button onclick="API.saveEditStory('${storyId}')">💾 Lưu</button>
  `;
  if (story.cover) {
    document.getElementById("editCoverPreview").innerHTML = `<img class="cover-preview" src="${escapeHtml(story.cover)}">`;
  }
  document.getElementById("editCoverFile")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => document.getElementById("editCoverPreview").innerHTML = `<img class="cover-preview" src="${ev.target.result}">`;
      reader.readAsDataURL(file);
    }
  });
  document.getElementById("editStoryModal").style.display = "flex";
}

// Save edit story
export async function saveEditStory(storyId) {
  refreshUserSession();
  const newGroupId = document.getElementById("editGroupId").value;
  const coverFile = document.getElementById("editCoverFile").files[0];
  let coverUrl = document.getElementById("editCover").value;
  const desc = document.getElementById("editDesc").value;
  if (coverFile) {
    coverUrl = await uploadImage(coverFile);
  }
  let groupName = "";
  if (newGroupId) {
    const groupSnap = await get(ref(db, `groups/${newGroupId}`));
    if (groupSnap.exists()) groupName = groupSnap.val().groupName;
  }
  const mainGenre = document.getElementById("editGenre").value;
  const subGenre = document.getElementById("editGenre2").value;
  let genres = mainGenre;
  if (subGenre && subGenre !== mainGenre && subGenre.trim() !== "") {
    genres = `${mainGenre}, ${subGenre}`;
  }
  await update(ref(db, `stories/${storyId}`), {
    title: document.getElementById("editTitle").value,
    otherName: document.getElementById("editOtherName").value,
    author: document.getElementById("editAuthor").value,
    genres: genres,
    tags: document.getElementById("editTags").value,
    status: document.getElementById("editStatus").value,
    groupId: newGroupId || null,
    groupName: groupName,
    cover: coverUrl,
    desc: desc
  });
  closeModal("editStoryModal");
  showNotification("Đã cập nhật truyện");
  openStoryDetail(storyId);
}

// Open profile
export function openProfile() {
  document.getElementById("profileContent").innerHTML = `
    <div class="profile-field"><label>📧 Email</label><input value="${escapeHtml(state.currentUser?.email || '')}" disabled></div>
    <div class="profile-field"><label>🏷️ Nickname</label><input id="profileNickname" value="${escapeHtml(state.currentUser?.nickname || '')}"></div>
    <button onclick="API.saveProfile()">💾 Lưu</button>
  `;
  document.getElementById("profileModal").style.display = "flex";
}

// Save profile
export async function saveProfile() {
  const newNickname = document.getElementById("profileNickname").value;
  if (!newNickname) { showNotification("Nickname không được trống", true); return; }
  try {
    await update(ref(db, `users/${state.currentUser.uid}`), { nickname: newNickname });
    state.currentUser.nickname = newNickname;
    document.getElementById("userDisplay").innerHTML = `👤 ${escapeHtml(state.currentUser.displayName)}`;
    showNotification("Đã cập nhật");
    closeModal("profileModal");
  } catch (err) { showNotification(err.message, true); }
}

// Create new group
export async function createNewGroup() {
  const groupName = document.getElementById("groupNameInput").value;
  if (!groupName) { alert("Nhập tên nhóm"); return; }
  showLoading(true);
  try {
    const groupsRef = ref(db, 'groups');
    const newGroupRef = push(groupsRef);
    await set(newGroupRef, { 
      groupName, 
      description: document.getElementById("groupDescInput").value || "", 
      ownerId: state.currentUser.uid, 
      members: [state.currentUser.uid], 
      createdAt: Date.now() 
    });
    await update(ref(db, `users/${state.currentUser.uid}/privileges`), { groupId: newGroupRef.key });
    closeModal("groupModal");
    showNotification("✅ Tạo nhóm thành công!");
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) { alert("Lỗi: " + err.message); }
  showLoading(false);
}

// Initialize UI
export function initUI() {
  // Make functions global via API
  window.closeModal = closeModal;
}
