import { FirebaseService } from '../core/firebaseService.js';
import { IMGBB_API_KEY } from '../core/constants.js';
import { state } from '../core/state.js';
import { refreshUserSession } from './auth.js';
import { isAdmin, canUpload, showNotification, showLoading, escapeHtml } from './utils.js';

const { db, ref, get, push, set, update } = FirebaseService;

let selectedCoverFile = null;
let selectedChapterFiles = [];

// Upload single image to ImgBB
export async function uploadImage(file) {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) {
    showNotification(`Ảnh ${file.name} quá lớn (tối đa 10MB)`, true);
    return null;
  }
  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("key", IMGBB_API_KEY);
    const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
    const result = await response.json();
    if (result.success) {
      return result.data.url;
    } else {
      throw new Error(result.error?.message || "Upload thất bại");
    }
  } catch (err) {
    console.error("Upload error:", err);
    showNotification("Lỗi upload: " + err.message, true);
    return null;
  }
}

// Upload multiple images
export async function uploadMultipleImages(files) {
  if (!files || files.length === 0) return [];
  const urls = [];
  for (const file of files) {
    const url = await uploadImage(file);
    if (url) urls.push(url);
  }
  return urls;
}

// Create story
export async function createStory(data, coverFile, chapterImages) {
  let coverUrl = data.cover;
  if (coverFile) {
    coverUrl = await uploadImage(coverFile);
  }
  if (!data.title) {
    showNotification("Thiếu tên truyện", true);
    throw new Error("Thiếu title");
  }
  const storiesRef = ref(db, 'stories');
  const newStoryRef = push(storiesRef);
  const isAdminUser = isAdmin(state.currentUser);
  const storyData = {
    title: data.title,
    otherName: data.otherName || "",
    author: data.author || "",
    genres: data.genres || "",
    tags: data.tags || "",
    status: data.status || "Đang tiến hành",
    desc: data.desc || "",
    cover: coverUrl || "",
    ownerUid: data.ownerUid || state.currentUser?.uid || "",
    ownerNickname: data.ownerNickname || state.currentUser?.nickname || "Người dùng",
    groupId: data.groupId || null,
    groupName: data.groupName || "",
    likes: 0,
    views: 0,
    approved: isAdminUser ? true : false,
    createdAt: data.createdAt || Date.now(),
    chapters: []
  };
  await set(newStoryRef, storyData);
  if (chapterImages && chapterImages.length > 0) {
    const chapterData = {
      title: "Chapter 1",
      pages: chapterImages,
      chapterNumber: 1,
      createdAt: Date.now()
    };
    const chaptersRef = ref(db, `chapters/${newStoryRef.key}`);
    const newChapterRef = push(chaptersRef);
    await set(newChapterRef, chapterData);
    await update(ref(db, `stories/${newStoryRef.key}/chapters`), { [newChapterRef.key]: true });
  }
  const notifyMsg = isAdminUser ? "✅ Đã đăng truyện thành công (Admin - tự động duyệt)" : "📤 Đã gửi truyện, chờ admin duyệt";
  showNotification(notifyMsg, false);
  return newStoryRef.key;
}

// Initialize upload panel
export function initUploadPanel() {
  const panel = document.getElementById("uploadPanel");
  if (!panel) return;
  if (!canUpload(state.currentUser) || state.currentUser?.role === "guest") { panel.innerHTML = ""; return; }
  
  const GENRE_LIST = [
    "3D", "Action", "Bara/Muscle", "Biography", "Cakeverse", "Comedy",
    "Crime", "Documentary", "Dom/Sub verse", "Drama", "Family", "Fantasy",
    "Furry", "HET/Hentai", "Historical", "Horror", "Music", "Mystery",
    "Omegaverse", "Psychological", "Romance", "School Life", "Sci-fi",
    "Shounen Ai", "Slice of Life", "Sports", "Supernatural", "Thriller",
    "Tragedy", "War", "Wuxia", "Yaoi", "Yuri"
  ];
  
  panel.innerHTML = `
    <div class="upload-panel">
      <h3>📤 ĐĂNG TRUYỆN MỚI</h3>
      <input id="uploadTitle" placeholder="Tên truyện *">
      <input id="uploadOtherName" placeholder="Tên khác">
      <input id="uploadAuthor" placeholder="Tác giả">
      
      <label style="color:#FF69B4; margin-top:10px; display:block;">📖 Thể loại (có thể chọn hoặc tự nhập)</label>
      <input id="uploadGenre" list="genreDropdown" placeholder="Chọn hoặc nhập thể loại chính">
      <input id="uploadGenre2" placeholder="Thể loại phụ (không bắt buộc)" list="genreDropdown">
      
      <label style="color:#FF69B4; margin-top:10px; display:block;">🏷️ Tags</label>
      <input id="uploadTags" placeholder="Ví dụ: School, Omegaverse, One Shot">
      
      <select id="uploadStatus">
        <option value="Đang tiến hành">📖 Đang tiến hành</option>
        <option value="Đã hoàn thành">✅ Đã hoàn thành</option>
        <option value="Tạm ngưng">⏸ Tạm ngưng</option>
      </select>
      
      <select id="uploadGroupId">
        <option value="">-- Chọn nhóm dịch (không bắt buộc) --</option>
      </select>
      
      <input type="file" id="uploadCoverFile" accept="image/*">
      <div id="uploadCoverPreview"></div>
      <input id="uploadCoverUrl" placeholder="Hoặc link ảnh bìa">
      
      <h4>📷 Ảnh chapter đầu tiên (không bắt buộc)</h4>
      <input type="file" id="uploadChapterImages" accept="image/*" multiple>
      <div id="uploadChapterPreview" class="images-preview"></div>
      
      <textarea id="uploadDesc" placeholder="Mô tả truyện"></textarea>
      <button class="btn-pink" id="submitUploadBtn">📤 ĐĂNG TRUYỆN</button>
    </div>
  `;
  
  // Load user groups
  (async () => {
    const userGroups = await getUserGroups(state.currentUser?.uid);
    const groupSelect = document.getElementById("uploadGroupId");
    if (groupSelect) {
      for (const group of userGroups) {
        groupSelect.innerHTML += `<option value="${group.id}">${escapeHtml(group.groupName)}</option>`;
      }
    }
  })();
  
  // Cover preview
  document.getElementById("uploadCoverFile")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    selectedCoverFile = file;
    const previewDiv = document.getElementById("uploadCoverPreview");
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => previewDiv.innerHTML = `<img class="cover-preview" src="${ev.target.result}">`;
      reader.readAsDataURL(file);
    } else {
      previewDiv.innerHTML = "";
    }
  });
  
  // Chapter images preview
  document.getElementById("uploadChapterImages")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    selectedChapterFiles = files;
    const previewDiv = document.getElementById("uploadChapterPreview");
    previewDiv.innerHTML = "";
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imgDiv = document.createElement("div");
        imgDiv.style.position = "relative";
        imgDiv.style.display = "inline-block";
        imgDiv.innerHTML = `<img class="img-preview-item" src="${ev.target.result}"><button onclick="this.parentElement.remove()">✕</button>`;
        previewDiv.appendChild(imgDiv);
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Submit button
  document.getElementById("submitUploadBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("uploadTitle").value;
    if (!title) { showNotification("Nhập tên truyện", true); return; }
    showLoading(true);
    try {
      const groupId = document.getElementById("uploadGroupId").value;
      let groupName = "";
      if (groupId) {
        const groupSnap = await get(ref(db, `groups/${groupId}`));
        if (groupSnap.exists()) groupName = groupSnap.val().groupName;
      }
      const mainGenre = document.getElementById("uploadGenre").value;
      const subGenre = document.getElementById("uploadGenre2").value;
      let genres = mainGenre;
      if (subGenre && subGenre !== mainGenre && subGenre.trim() !== "") {
        genres = `${mainGenre}, ${subGenre}`;
      }
      let chapterImageUrls = [];
      if (selectedChapterFiles.length > 0) {
        chapterImageUrls = await uploadMultipleImages(selectedChapterFiles);
      }
      await createStory({
        title: title,
        otherName: document.getElementById("uploadOtherName").value,
        author: document.getElementById("uploadAuthor").value,
        genres: genres,
        tags: document.getElementById("uploadTags").value,
        status: document.getElementById("uploadStatus").value,
        desc: document.getElementById("uploadDesc").value,
        cover: document.getElementById("uploadCoverUrl").value,
        ownerUid: state.currentUser.uid,
        ownerNickname: state.currentUser.nickname || state.currentUser.email,
        groupId: groupId || null,
        groupName: groupName,
        createdAt: Date.now()
      }, selectedCoverFile, chapterImageUrls);
      
      // Clear form
      document.getElementById("uploadTitle").value = "";
      document.getElementById("uploadOtherName").value = "";
      document.getElementById("uploadAuthor").value = "";
      document.getElementById("uploadGenre").value = "";
      document.getElementById("uploadGenre2").value = "";
      document.getElementById("uploadTags").value = "";
      document.getElementById("uploadCoverUrl").value = "";
      document.getElementById("uploadDesc").value = "";
      document.getElementById("uploadCoverFile").value = "";
      document.getElementById("uploadChapterImages").value = "";
      document.getElementById("uploadCoverPreview").innerHTML = "";
      document.getElementById("uploadChapterPreview").innerHTML = "";
      selectedCoverFile = null;
      selectedChapterFiles = [];
    } catch (err) {
      console.error("Upload error:", err);
      showNotification("Lỗi: " + err.message, true);
    } finally {
      showLoading(false);
    }
  });
}
