import { state } from "./state.js";
import { GENRE_LIST, escapeHtml, canUpload } from "./utils.js";
import { loadAllGroups, getUserGroupOptions, uploadMultipleImages, createStory, parseGenresAndTags } from "./data.js";
import { goToStory } from "./router.js";
import { showNotification, showLoading } from "./utils.js";
import { db, ref, get } from "./firebase-config.js";

export function renderGenreFilter() {
  const container = document.getElementById("genreFilterContainer");
  if (!container) return;
  let html = '<select id="genreSelect" class="genre-select"><option value="">-- Tất cả thể loại --</option>';
  for (const genre of GENRE_LIST) {
    html += `<option value="${genre}" ${state.selectedGenre === genre ? 'selected' : ''}>${genre}</option>`;
  }
  html += '</select>';
  container.innerHTML = html;
  document.getElementById("genreSelect")?.addEventListener("change", (e) => {
    state.selectedGenre = e.target.value;
    renderCurrentTab();
  });
}

export function renderCurrentTab() {
  const grid = document.getElementById("mangaGrid");
  if (!grid) return;
  let filtered = state.stories.filter(s => s.approved === true);
  if (state.selectedGenre) filtered = filtered.filter(s => s.genres && s.genres.includes(state.selectedGenre));
  if (state.searchKeyword) filtered = filtered.filter(s => s.title?.toLowerCase().includes(state.searchKeyword) || s.otherName?.toLowerCase().includes(state.searchKeyword) || s.tags?.toLowerCase().includes(state.searchKeyword));
  if (state.sortBy === "likes") filtered.sort((a,b) => (b.likes||0) - (a.likes||0));
  else if (state.sortBy === "views") filtered.sort((a,b) => (b.views||0) - (a.views||0));
  else filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  if (filtered.length === 0) { grid.innerHTML = "<div style='text-align:center; padding:50px;'>📭 Không có truyện nào</div>"; return; }
  grid.innerHTML = filtered.map(story => `
    <div class="manga-card" onclick="goToStory('${story.slug}')">
      <img class="manga-cover" src="${escapeHtml(story.cover) || 'https://placehold.co/300x450?text=No+Cover'}" onerror="this.src='https://placehold.co/300x450?text=ERROR'">
      <div class="manga-info">
        <div class="manga-title">${escapeHtml(story.title)}</div>
        <div class="manga-meta">📚 ${escapeHtml(story.groupName) || "Cá nhân"}</div>
        <div class="manga-meta">❤️ ${story.likes || 0} | 👁 ${story.views || 0}</div>
        <div class="manga-meta">🏷️ ${escapeHtml(story.genres) || "Chưa có thể loại"}</div>
        ${story.approved === false ? '<div class="manga-meta" style="color:#FFCC00;">⏳ Chờ duyệt</div>' : ''}
      </div>
    </div>
  `).join("");
}

export function renderUploadPanel() {
  const panel = document.getElementById("uploadPanel");
  if (!panel) return;
  if (!canUpload(state.currentUser)) { panel.innerHTML = ""; return; }
  panel.innerHTML = `
    <div class="upload-panel">
      <h3>📤 ĐĂNG TRUYỆN MỚI</h3>
      <input id="uploadTitle" placeholder="Tên truyện *">
      <input id="uploadOtherName" placeholder="Tên khác">
      <input id="uploadAuthor" placeholder="Tác giả">
      <input id="uploadGenreTags" placeholder="Thể loại và Tags (cách nhau bằng dấu phẩy)">
      <div style="font-size:12px; color:#888; margin-bottom:12px;">💡 Hệ thống sẽ tự động phân biệt thể loại và tags</div>
      <select id="uploadStatus">
        <option value="Đang tiến hành">📖 Đang tiến hành</option>
        <option value="Đã hoàn thành">✅ Đã hoàn thành</option>
        <option value="Tạm ngưng">⏸ Tạm ngưng</option>
      </select>
      <select id="uploadGroupId"><option value="">-- Chọn nhóm dịch --</option></select>
      <input type="file" id="uploadCoverFile" accept="image/*">
      <div id="uploadCoverPreview"></div>
      <h4>📷 Ảnh chapter đầu tiên</h4>
      <input type="file" id="uploadChapterImages" accept="image/*" multiple>
      <div id="uploadChapterPreview" class="images-preview"></div>
      <textarea id="uploadDesc" placeholder="Mô tả truyện"></textarea>
      <button class="btn-pink" id="submitUploadBtn">📤 ĐĂNG TRUYỆN</button>
    </div>
  `;
  (async () => {
    const userGroups = await getUserGroupOptions();
    const groupSelect = document.getElementById("uploadGroupId");
    if (groupSelect) {
      for (const group of userGroups) { groupSelect.innerHTML += `<option value="${group.id}">${escapeHtml(group.groupName)}</option>`; }
    }
  })();
  let selectedCoverFile = null;
  let selectedChapterFiles = [];
  document.getElementById("uploadCoverFile")?.addEventListener("change", (e) => {
    selectedCoverFile = e.target.files[0];
    if (selectedCoverFile) { const reader = new FileReader(); reader.onload = (ev) => { document.getElementById("uploadCoverPreview").innerHTML = `<img class="cover-preview" src="${ev.target.result}">`; }; reader.readAsDataURL(selectedCoverFile); }
  });
  document.getElementById("uploadChapterImages")?.addEventListener("change", (e) => {
    selectedChapterFiles = Array.from(e.target.files);
    const previewDiv = document.getElementById("uploadChapterPreview");
    previewDiv.innerHTML = "";
    for (const file of selectedChapterFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => { previewDiv.innerHTML += `<div class="img-preview-item"><img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;"></div>`; };
      reader.readAsDataURL(file);
    }
  });
  document.getElementById("submitUploadBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("uploadTitle").value;
    if (!title) { showNotification("Nhập tên truyện", true); return; }
    showLoading(true);
    try {
      const groupId = document.getElementById("uploadGroupId").value;
      let groupName = "";
      if (groupId) { const groupSnap = await get(ref(db, `groups/${groupId}`)); if (groupSnap.exists()) groupName = groupSnap.val().groupName; }
      const genreTagsInput = document.getElementById("uploadGenreTags").value;
      const { genres, tags } = parseGenresAndTags(genreTagsInput);
      let chapterImageUrls = [];
      if (selectedChapterFiles.length > 0) chapterImageUrls = await uploadMultipleImages(selectedChapterFiles);
      await createStory({
        title, otherName: document.getElementById("uploadOtherName").value, author: document.getElementById("uploadAuthor").value,
        genres: genres, tags: tags, status: document.getElementById("uploadStatus").value,
        desc: document.getElementById("uploadDesc").value, cover: "", groupId: groupId || null, groupName: groupName
      }, selectedCoverFile, chapterImageUrls);
      document.getElementById("uploadTitle").value = "";
      document.getElementById("uploadOtherName").value = "";
      document.getElementById("uploadAuthor").value = "";
      document.getElementById("uploadGenreTags").value = "";
      document.getElementById("uploadDesc").value = "";
      document.getElementById("uploadCoverFile").value = "";
      document.getElementById("uploadChapterImages").value = "";
      document.getElementById("uploadCoverPreview").innerHTML = "";
      document.getElementById("uploadChapterPreview").innerHTML = "";
      selectedCoverFile = null;
      selectedChapterFiles = [];
    } catch (err) { showNotification("Lỗi: " + err.message, true); }
    finally { showLoading(false); }
  });
}

export function loadUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const search = urlParams.get('search');
  const genre = urlParams.get('genre');
  if (search) {
    state.searchKeyword = search.toLowerCase();
    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = search;
  }
  if (genre) {
    state.selectedGenre = genre;
    const genreSelect = document.getElementById("genreSelect");
    if (genreSelect) genreSelect.value = genre;
  }
  renderCurrentTab();
}
