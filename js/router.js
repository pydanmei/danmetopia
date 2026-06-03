import { state } from "./state.js";

export function goToStory(slug) {
  if (!slug) {
    console.error("goToStory: slug is empty");
    return;
  }
  const story = state.stories.find(s => s.slug === slug);
  if (story) {
    window.location.href = `story.html?id=${story.id}`;
  } else {
    window.location.href = `story.html?slug=${slug}`;
  }
}

export function goToChapter(slug, chapterNum) {
  const story = state.stories.find(s => s.slug === slug);
  if (story) {
    window.location.href = `reader.html?id=${story.id}&chapter=${chapterNum - 1}`;
  } else {
    window.location.href = `index.html`;
  }
}

export function goToHome() {
  window.location.href = "index.html";
}

export function goToAdmin() {
  window.location.href = "admin.html";
}

export function goToGroups() {
  window.location.href = "groups.html";
}

export function goToStoryDetail(storyId) {
  window.location.href = `story.html?id=${storyId}`;
}

export function openReader(storyId, chapterIndex) {
  window.location.href = `reader.html?id=${storyId}&chapter=${chapterIndex || 0}`;
}
