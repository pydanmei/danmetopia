import { initFirebase, db, ref, get, child, push, update, remove, onValue, GENRE_LIST } from './db.js';
import { currentUserData, refreshUserSession } from './auth.js';
import { isAdmin, canModerate, showNotification, escapeHtml } from './utils.js';

// Initialize Firebase
initFirebase();

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
    allStories = data ? Object.entries(data).map(([id, value])
