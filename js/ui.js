import { db, ref, get, update, push, set } from './db.js';
import { currentUserData, refreshUserSession } from './auth.js';
import { isAdmin, isModerator, canModerate, hasGroup, getUserGroups, escapeHtml, showNotification, showLoading } from './utils.js';
import { allStories, getChapters, getChapter, followStory, unfollowStory, isFollowing, likeStory, approveStory, rejectStory, deleteStory, userFollows } from './data.js';
import { uploadImage } from './upload.js';

// Get user group options
export async function getUserGroupOptions() {
  if (!currentUserData || currentUserData.role === "guest") return [];
  const userGroups = await getUserGroups(currentUserData.uid);
  return userGroups;
}

// Close modal
export function closeModal(modalId) { 
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none"; 
}

// Open story detail
window.openStoryDetail = async (storyId) => {
  refreshUserSession();
  const story = allStories.find(s => s.id === storyId);
  if (!story) return;
  const chapters = await getChapters(storyId);
  
  const canEditStory = currentUserData && (isAdmin(currentUserData) || (currentUserData.privileges?.groupId && story.groupId === currentUserData.privileges?.groupId) || story.ownerUid === currentUserData?.uid);
  const canEditChapter = currentUserData && (isAdmin(currentUserData) || (currentUserData.privileges?.groupId && story.groupId === currentUserData.privileges?.groupId) || story.ownerUid === currentUserData?.uid);
  const canDeleteChapter = currentUserData && isAdmin(currentUserData);
  const isMod = canModerate(currentUserData);
  
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
      <div class="chapter-item" onclick="window.openReader('${storyId}', ${chap.chapterNumber - 1})">
        <span>${escapeHtml(chap.title)}</span>
        <span style="font-size:12px; color:#888;">📅 ${new Date(chap.createdAt).toLocaleDateString()}</span>
        <div class="chapter-actions">
          ${canEditChapter ? `<button class="chapter-edit-btn" onclick="event.stopPropagation(); window.openEditChapter('${storyId}', '${chap.id}')">✏️ Sửa</button>` : ''}
          ${canDeleteChapter ? `<button class="chapter-delete-btn" onclick="event.stopPropagation(); window.deleteChapter('${storyId}', '${chap.id}')">🗑 Xóa</button>` : ''}
        </div>
      </div>
    `;
  });
  chaptersHtml += `</div>`;
  document.getElementById("storyChapters").innerHTML = chaptersHtml;
  
  let actionsHtml = `<button onclick="window.likeStoryAndRefresh('${storyId}')">❤️ Thích</button>`;
  if (currentUserData && currentUserData.role !== "guest") actionsHtml += `<button onclick="window.toggleFollow('${storyId}')">${isFollowing(storyId) ? '⭐ Đã theo dõi' : '➕ Theo dõi'}</button>`;
  if (canEditStory) actionsHtml += `<button onclick="window.openEditStory('${storyId}')">✏️ Chỉnh sửa truyện</button><button onclick="window.openAddChapter('${storyId}')">📖 Thêm chapter mới</button>`;
  if (isMod && story.approved === false) actionsHtml += `<button onclick="window.approveStoryAction('${storyId}')">✅ Duyệt truyện</button><button onclick="window.rejectStoryAction('${storyId}')">❌ Từ chối</button>`;
  if (isAdmin(currentUserData)) actionsHtml += `<button onclick="window.deleteStoryAction('${storyId}')" style="background:#ff4444;">🗑 Xóa truyện</button>`;
  document.getElementById("storyActions").innerHTML = actionsHtml;
  document.getElementById("storyModal").style.display = "flex";
};

// Helper functions for story actions
window.likeStoryAndRefresh = async (storyId) => { await likeStory(storyId); window.openStoryDetail(storyId); };
window.approveStoryAction = async (storyId) => { await approveStory(storyId); closeModal("storyModal"); };
window.rejectStoryAction = async (storyId) => { await rejectStory(storyId); closeModal("storyModal"); };
window.deleteStoryAction = async (storyId) => { if (confirm("Xóa truyện?")) { await deleteStory(storyId); closeModal("storyModal"); } };
window.toggleFollow = async (storyId) => { if (isFollowing(storyId)) await unfollowStory(storyId); else await followStory(storyId); window.openStoryDetail(storyId); };

// Open edit story
window.openEditStory = async (storyId) => {
  const story = allStories.find(s => s.id === storyId);
  const userGroups = await getUserGroupOptions();
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
    <button onclick="window.saveEditStory('${storyId}')">💾 Lưu</button>
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
};

// Save edit story
window.saveEditStory = async (storyId) => {
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
  window.openStoryDetail(storyId);
};

// Open profile
window.openProfile = () => {
  document.getElementById("profileContent").innerHTML = `
    <div class="profile-field"><label>📧 Email</label><input value="${escapeHtml(currentUserData?.email || '')}" disabled></div>
    <div class="profile-field"><label>🏷️ Nickname</label><input id="profileNickname" value="${escapeHtml(currentUserData?.nickname || '')}"></div>
    <button onclick="window.saveProfile()">💾 Lưu</button>
  `;
  document.getElementById("profileModal").style.display = "flex";
};

// Save profile
window.saveProfile = async () => {
  const newNickname = document.getElementById("profileNickname").value;
  if (!newNickname) { showNotification("Nickname không được trống", true); return; }
  try {
    await update(ref(db, `users/${currentUserData.uid}`), { nickname: newNickname });
    currentUserData.nickname = newNickname;
    document.getElementById("userDisplay").innerHTML = `👤 ${escapeHtml(currentUserData.displayName)}`;
    showNotification("Đã cập nhật");
    closeModal("profileModal");
  } catch (err) { showNotification(err.message, true); }
};

// Create new group
window.createNewGroup = async () => {
  const groupName = document.getElementById("groupNameInput").value;
  if (!groupName) { alert("Nhập tên nhóm"); return; }
  showLoading(true);
  try {
    const groupsRef = ref(db, 'groups');
    const newGroupRef = push(groupsRef);
    await set(newGroupRef, { 
      groupName, 
      description: document.getElementById("groupDescInput").value || "", 
      ownerId: currentUserData.uid, 
      members: [currentUserData.uid], 
      createdAt: Date.now() 
    });
    await update(ref(db, `users/${currentUserData.uid}/privileges`), { groupId: newGroupRef.key });
    closeModal("groupModal");
    showNotification("✅ Tạo nhóm thành công!");
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) { alert("Lỗi: " + err.message); }
  showLoading(false);
};

// Update user display
export async function updateUserDisplay() {
  const userDisplay = document.getElementById("userDisplay");
  const groupsLink = document.getElementById("groupsLink");
  const profileBtn = document.getElementById("profileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const createGroupBtn = document.getElementById("createGroupBtn");
  const adminLink = document.getElementById("adminLink");
  if (!userDisplay) return;
  if (!currentUserData || currentUserData.role === "guest") {
    userDisplay.innerHTML = `👤 ${escapeHtml(currentUserData?.displayName || "Guest")}`;
    if (groupsLink) groupsLink.style.display = "inline-block";
    if (profileBtn) profileBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (createGroupBtn) createGroupBtn.style.display = "none";
    if (adminLink) adminLink.style.display = "none";
  } else {
    userDisplay.innerHTML = `👤 ${escapeHtml(currentUserData.displayName)}`;
    if (groupsLink) groupsLink.style.display = "inline-block";
    if (profileBtn) profileBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (createGroupBtn) createGroupBtn.style.display = !hasGroup(currentUserData) ? "inline-block" : "none";
    if (adminLink) adminLink.style.display = canModerate(currentUserData) ? "inline-block" : "none";
  }
}

// Initialize UI
export function initUI() {
  // Make functions global
  window.closeModal = closeModal;
  window.openStoryDetail = window.openStoryDetail;
  window.openEditStory = window.openEditStory;
  window.saveEditStory = window.saveEditStory;
  window.openProfile = window.openProfile;
  window.saveProfile = window.saveProfile;
  window.createNewGroup = window.createNewGroup;
}
