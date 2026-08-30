
window.FORTNITE_FIREBASE_CONFIG = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};


window.FORTNITE_AUTH_READY = new Promise((resolve) => {
  window.__resolveFortniteAuthReady = resolve;
});
