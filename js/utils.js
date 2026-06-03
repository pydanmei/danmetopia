import { db, ref, get } from "./firebase-config.js";

export function showNotification(msg, isError = false) {
  const notif = document.createElement("div");
  notif.className = "notification";
  notif.style.background = isError ? "#ff4444" : "#FF69B4";
  notif.style.color = "black";
  notif.innerText = msg;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

export function showLoading(show) {
  let spinner = document.getElementById("globalSpinner");
  if (show) {
    if (!spinner) {
      spinner = document.createElement("div");
      spinner.id = "globalSpinner";
      spinner.className = "spinner-overlay";
      spinner.innerHTML = '<div class="loading-spinner"></div>';
      document.body.appendChild(spinner);
    }
    spinner.style.display = "flex";
  } else {
    if (spinner) spinner.style.display = "none";
  }
}

export function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, m => m === "&" ? "&amp;" : m === "<" ? "&lt;" : "&gt;");
}

export function generateRandomGuestName() {
  return `Hủ nằm vùng ${Math.floor(Math.random() * 10000)}`;
}

export function isAdmin(userData) { return userData?.role === "admin"; }
export function isModerator(userData) { return userData?.role === "user" && userData?.privileges?.moderator === true; }
export function canModerate(userData) { return isAdmin(userData) || isModerator(userData); }
export function canUpload(userData) { return userData && (userData.role === "admin" || userData.role === "user"); }
export function hasGroup(userData) { return userData?.privileges?.groupId !== null; }

export async function isNicknameExists(nickname) {
  const usersSnap = await get(ref(db, "users"));
  const users = usersSnap.val() || {};
  for (const uid in users) if (users[uid].nickname === nickname) return true;
  return false;
}

export function generateSlug(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export const GENRE_LIST = [
  "3D", "Action", "Bara/Muscle", "Biography", "Cakeverse", "Comedy",
  "Crime", "Documentary", "Dom/Sub verse", "Drama", "Family", "Fantasy",
  "Furry", "HET/Hentai", "Historical", "Horror", "Music", "Mystery",
  "Omegaverse", "Psychological", "Romance", "School Life", "Sci-fi",
  "Shounen Ai", "Slice of Life", "Sports", "Supernatural", "Thriller",
  "Tragedy", "War", "Wuxia", "Yaoi", "Yuri"
];

const GENRE_SET = new Set(GENRE_LIST);

export function parseGenresAndTags(input) {
  if (!input || input.trim() === "") return { genres: "", tags: "" };
  let keywords = [];
  if (input.includes(",")) {
    keywords = input.split(",").map(k => k.trim()).filter(k => k);
  } else {
    keywords = input.split(" ").map(k => k.trim()).filter(k => k);
  }
  const genres = [];
  const tags = [];
  for (const kw of keywords) {
    if (GENRE_SET.has(kw)) {
      genres.push(kw);
    } else {
      tags.push(kw);
    }
  }
  return { genres: genres.join(", "), tags: tags.join(", ") };
}
