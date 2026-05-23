// IMPORT ĐẦY ĐỦ
import { initFirebase, db, ref, onValue, get, set, push } from './db.js';
import { currentUserData, refreshUserSession } from './auth.js';
import { escapeHtml, loadImageWithSkeleton, imageCache, showNotification } from './utils.js';
import { allStories } from './data.js';

// Đảm bảo Firebase đã init
initFirebase();

console.log("✅ reader.js loaded");

let currentReaderStoryId = null;
let currentChapters = [];
let currentChapterIndex = 0;
let chaptersUnsubscribe = null;
let commentUnsubscribe = null;

// Close reader modal
export function closeReaderModal() {
  console.log("Closing reader modal");
  const readerModal = document.getElementById("readerModal");
  if (readerModal) readerModal.style.display = "none";
  if (chaptersUnsubscribe) chaptersUnsubscribe();
  if (commentUnsubscribe) commentUnsubscribe();
  document.body.style.overflow = "";
  currentReaderStoryId = null;
}

// Open reader
window.openReader = async (storyId, chapterIndex) => {
  console.log("📖 openReader - storyId:", storyId, "chapterIndex:", chapterIndex);
  
  try {
    refreshUserSession();
    
    if (chaptersUnsubscribe) chaptersUnsubscribe();
    if (commentUnsubscribe) commentUnsubscribe();
    
    currentReaderStoryId = storyId;
    currentChapterIndex = chapterIndex || 0;
    
    // Update view count
    const story = allStories.find(s => s.id === storyId);
    if (story) {
      try {
        const viewRef = ref(db, `stories/${storyId}/views`);
        const snapshot = await get(viewRef);
        await set(viewRef, (snapshot.val() || 0) + 1);
      } catch (err) {
        console.error("Update view error:", err);
      }
    }
    
    // Load chapters
    const chaptersRef = ref(db, `chapters/${storyId}`);
    chaptersUnsubscribe = onValue(chaptersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        currentChapters = Object.entries(data).map(([id, value]) => ({ id, ...value }));
        currentChapters.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
        renderChapter();
      } else {
        currentChapters = [];
        renderChapter();
      }
    });
    
    // Show modal
    const readerModal = document.getElementById("readerModal");
    if (readerModal) {
      document.body.style.overflow = "hidden";
      readerModal.style.display = "flex";
      setTimeout(() => {
        const readerContent = document.getElementById("readerContent");
        if (readerContent) readerContent.scrollTop = 0;
      }, 50);
    } else {
      console.error("readerModal not found!");
      showNotification("Lỗi: Không tìm thấy reader", true);
    }
  } catch (err) {
    console.error("Error opening reader:", err);
    showNotification("Lỗi mở truyện: " + err.message, true);
  }
};

// Render chapter
function renderChapter() {
  console.log("Rendering chapter", currentChapterIndex);
  
  if (!currentChapters || currentChapters.length === 0) {
    document.getElementById("readerContent").innerHTML = '<div class="reader-page"><p>Đang tải chapter...</p></div>';
    return;
  }
  
  if (!currentChapters[currentChapterIndex]) {
    document.getElementById("readerContent").innerHTML = '<div class="reader-page"><p>Không tìm thấy chapter</p></div>';
    return;
  }
  
  const chap = currentChapters[currentChapterIndex];
  const readerDiv = document.getElementById("readerContent");
  if (!readerDiv) return;
  
  const hasPrev = currentChapterIndex > 0;
  const hasNext = currentChapterIndex < currentChapters.length - 1;
  
  readerDiv.innerHTML = `
    <div class="reader-page">
      <div class="chapter-nav">
        ${hasPrev ? `<button onclick="window.changeChapter(-1)" id="prevChapterBtn">⬅️ Chapter trước</button>` : '<button disabled>⬅️ Chapter trước</button>'}
        <h3>${escapeHtml(chap.title)}</h3>
        ${hasNext ? `<button onclick="window.changeChapter(1)" id="nextChapterBtn">Chapter sau ➡️</button>` : '<button disabled>Chapter sau ➡️</button>'}
      </div>
      
      <div id="chapterImagesContainer">
        ${chap.pages?.map((page, idx) => `
          <img class="reader-image" src="${escapeHtml(page)}" loading="lazy" onerror="this.src='https://placehold.co/800x1200?text=Error'">
        `).join("") || "<p>Không có ảnh</p>"}
      </div>
      
      <div class="chapter-nav" style="margin-top:30px; margin-bottom:30px;">
        ${hasPrev ? `<button onclick="window.changeChapter(-1)">⬅️ Chapter trước</button>` : '<button disabled>⬅️ Chapter trước</button>'}
        <button onclick="window.scrollToTop()" style="background:#FFCCCC;">⬆️ Lên đầu trang</button>
        ${hasNext ? `<button onclick="window.changeChapter(1)">Chapter sau ➡️</button>` : '<button disabled>Chapter sau ➡️</button>'}
      </div>
      
      <div class="chapter-list-section">
        <h4>📑 MỤC LỤC CHAPTER</h4>
        <div class="chapter-list">
          ${currentChapters.map((c, i) => `
            <div class="chapter-item" onclick="window.changeChapterTo(${i})">
              <span>${escapeHtml(c.title)}</span>
              <span style="font-size:12px; color:#888;">📅 ${new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
          `).join("")}
        </div>
      </div>
      
      <div class="comment-section">
        <h4>💬 BÌNH LUẬN</h4>
        <div class="comment-input-area">
          <textarea id="commentText" rows="2" placeholder="Viết bình luận..."></textarea>
          <button id="postCommentBtn">GỬI</button>
        </div>
        <div id="commentList" class="comment-list"></div>
      </div>
    </div>
  `;
  
  loadCommentsRealtime(currentReaderStoryId);
  preloadNextChapter();
  
  const postBtn = document.getElementById("postCommentBtn");
  if (postBtn) {
    const newPostBtn = postBtn.cloneNode(true);
    postBtn.parentNode.replaceChild(newPostBtn, postBtn);
    newPostBtn.addEventListener("click", () => postComment(currentReaderStoryId));
  }
}

// Preload next chapter
function preloadNextChapter() {
  if (!currentChapters || !currentReaderStoryId) return;
  
  const nextIndex = currentChapterIndex + 1;
  if (nextIndex < currentChapters.length) {
    const nextChapter = currentChapters[nextIndex];
    if (nextChapter?.pages) {
      nextChapter.pages.forEach(pageUrl => {
        if (!imageCache.has(pageUrl)) {
          const img = new Image();
          img.src = pageUrl;
          imageCache.set(pageUrl, pageUrl);
        }
      });
    }
  }
}

// Change chapter
window.changeChapter = (delta) => {
  const newIdx = currentChapterIndex + delta;
  if (newIdx >= 0 && newIdx < currentChapters.length) {
    currentChapterIndex = newIdx;
    renderChapter();
    setTimeout(() => {
      const readerContent = document.getElementById("readerContent");
      if (readerContent) readerContent.scrollTop = 0;
    }, 50);
  }
};

// Change to specific chapter
window.changeChapterTo = (index) => {
  currentChapterIndex = index;
  renderChapter();
  setTimeout(() => {
    const readerContent = document.getElementById("readerContent");
    if (readerContent) readerContent.scrollTop = 0;
  }, 50);
};

// Scroll to top
window.scrollToTop = () => {
  const readerContent = document.getElementById("readerContent");
  if (readerContent) {
    readerContent.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

// Load comments realtime
function loadCommentsRealtime(storyId) {
  if (commentUnsubscribe) commentUnsubscribe();
  
  const commentsRef = ref(db, `comments/${storyId}`);
  commentUnsubscribe = onValue(commentsRef, (snapshot) => {
    const data = snapshot.val();
    const comments = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    const commentList = document.getElementById("commentList");
    if (commentList) {
      commentList.innerHTML = comments.map(c => `
        <div class="comment-item">
          <div class="comment-name">
            <span>💬 ${escapeHtml(c.userName)}</span>
            <span class="comment-time">${new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <div class="comment-text">${escapeHtml(c.text)}</div>
        </div>
      `).join("");
      
      if (comments.length === 0) {
        commentList.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Chưa có bình luận nào. Hãy là người đầu tiên!</div>';
      }
    }
  });
}

// Post comment
async function postComment(storyId) {
  if (!currentUserData) { 
    showNotification("Đăng nhập để bình luận", true); 
    return; 
  }
  
  refreshUserSession();
  const text = document.getElementById("commentText")?.value.trim();
  if (!text) return;
  
  const commentsRef = ref(db, `comments/${storyId}`);
  const newCommentRef = push(commentsRef);
  await set(newCommentRef, {
    text: text,
    userId: currentUserData.uid || currentUserData.displayName,
    userName: currentUserData.displayName,
    createdAt: Date.now()
  });
  
  document.getElementById("commentText").value = "";
  showNotification("✅ Đã gửi bình luận");
}

// Make functions global
window.closeReaderModal = closeReaderModal;
