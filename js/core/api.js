import * as auth from '../modules/auth.js';
import * as data from '../modules/data.js';
import * as ui from '../modules/ui.js';
import * as reader from '../modules/reader.js';
import * as upload from '../modules/upload.js';

// Expose only what's needed
export const API = {
  // Auth
  handleGuestLogin: auth.handleGuestLogin,
  handleCheckEmail: auth.handleCheckEmail,
  handleVerifyOTP: auth.handleVerifyOTP,
  handlePasswordLogin: auth.handlePasswordLogin,
  handleCompleteRegistration: auth.handleCompleteRegistration,
  logout: auth.logout,
  restoreSession: auth.restoreSession,
  
  // Data
  loadStoriesRealtime: data.loadStoriesRealtime,
  loadAllGroups: data.loadAllGroups,
  loadFollows: data.loadFollows,
  followStory: data.followStory,
  unfollowStory: data.unfollowStory,
  likeStory: data.likeStory,
  approveStory: data.approveStory,
  rejectStory: data.rejectStory,
  deleteStory: data.deleteStory,
  getChapters: data.getChapters,
  
  // UI
  openStoryDetail: ui.openStoryDetail,
  openEditStory: ui.openEditStory,
  saveEditStory: ui.saveEditStory,
  openProfile: ui.openProfile,
  saveProfile: ui.saveProfile,
  createNewGroup: ui.createNewGroup,
  closeModal: ui.closeModal,
  showNotification: ui.showNotification,
  renderGenreFilter: data.renderGenreFilter,
  renderCurrentTab: data.renderCurrentTab,
  
  // Reader
  openReader: reader.openReader,
  closeReaderModal: reader.closeReaderModal,
  changeChapter: reader.changeChapter,
  changeChapterTo: reader.changeChapterTo,
  scrollToTop: reader.scrollToTop,
  
  // Upload
  initUploadPanel: upload.initUploadPanel,
  
  // Utils
  showLoading: ui.showLoading,
  escapeHtml: ui.escapeHtml
};
