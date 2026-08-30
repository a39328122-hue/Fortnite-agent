import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const DEFAULT_AVATAR = "./assets/default-user-avatar.jpeg";
const MAX_USERNAME_CHARS = 9;
const MAX_AVATAR_DATA_URL = 180000;
const cfg = window.FORTNITE_FIREBASE_CONFIG || {};

function configLooksReady(config) {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((key) => {
    const value = String(config?.[key] || "").trim();
    return value && !value.includes("PASTE_");
  });
}

function safePublicUser(user) {
  if (!user) return null;
  return {
    uid: String(user.uid || ""),
    displayName: String(user.displayName || ""),
    email: String(user.email || ""),
    photoURL: String(user.photoURL || "")
  };
}

function randomUsername() {
  return `user${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeUsername(input) {
  let value = String(input ?? "").normalize("NFKC");
  value = value.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "");
  value = value.replace(/^@+/, "").replace(/\s+/g, " ").trim();
  const chars = Array.from(value);
  if (!chars.length) throw new Error("Username can't be empty.");
  if (chars.length > MAX_USERNAME_CHARS) throw new Error("Username must be 9 characters or less.");
  return chars.join("");
}

function sanitizeStoredProfile(data) {
  const rawName = String(data?.username || "");
  let username;
  try { username = normalizeUsername(rawName); }
  catch { username = randomUsername(); }

  const rawAvatar = typeof data?.avatar === "string" ? data.avatar : "";
  const avatar = rawAvatar.startsWith("data:image/jpeg;base64,") && rawAvatar.length <= MAX_AVATAR_DATA_URL
    ? rawAvatar
    : "";

  return {
    username,
    avatar,
    setupComplete: data?.setupComplete === true
  };
}

let auth = null;
let db = null;
let currentUser = null;
let currentProfile = null;
let configured = false;
let lastError = null;

function publish() {
  const detail = {
    configured,
    user: safePublicUser(currentUser),
    profile: currentProfile ? { ...currentProfile } : null,
    error: lastError ? String(lastError.message || lastError) : null,
    defaultAvatar: DEFAULT_AVATAR
  };

  window.dispatchEvent(new CustomEvent("fortnite-auth-changed", { detail }));
  return detail;
}

async function ensureProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return sanitizeStoredProfile(snap.data());

  const profile = {
    username: randomUsername(),
    avatar: "",
    setupComplete: false
  };

  await setDoc(ref, {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return profile;
}

async function signInGoogle(forceAccountChooser = false) {
  if (!configured || !auth) throw new Error("Google login isn't configured yet.");

  await setPersistence(auth, browserLocalPersistence);

  const provider = new GoogleAuthProvider();
  if (forceAccountChooser) provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  return safePublicUser(result.user);
}

async function saveUsername(rawUsername) {
  if (!currentUser || !db) throw new Error("Log in first.");
  const username = normalizeUsername(rawUsername);

  await updateDoc(doc(db, "users", currentUser.uid), {
    username,
    updatedAt: serverTimestamp()
  });

  currentProfile = { ...currentProfile, username };
  publish();
  return username;
}

async function saveAvatar(dataUrl) {
  if (!currentUser || !db) throw new Error("Log in first.");
  const avatar = String(dataUrl || "");

  if (!avatar.startsWith("data:image/jpeg;base64,")) {
    throw new Error("Only processed JPEG avatars are accepted.");
  }
  if (avatar.length > MAX_AVATAR_DATA_URL) {
    throw new Error("That image is too large after processing.");
  }

  await updateDoc(doc(db, "users", currentUser.uid), {
    avatar,
    updatedAt: serverTimestamp()
  });

  currentProfile = { ...currentProfile, avatar };
  publish();
  return avatar;
}

async function finishSetup({ username, avatar = "" } = {}) {
  if (!currentUser || !db) throw new Error("Log in first.");

  const nextUsername = normalizeUsername(username ?? currentProfile?.username ?? randomUsername());
  const nextAvatar = avatar ? String(avatar) : String(currentProfile?.avatar || "");

  if (nextAvatar && (!nextAvatar.startsWith("data:image/jpeg;base64,") || nextAvatar.length > MAX_AVATAR_DATA_URL)) {
    throw new Error("The avatar is invalid or too large.");
  }

  await updateDoc(doc(db, "users", currentUser.uid), {
    username: nextUsername,
    avatar: nextAvatar,
    setupComplete: true,
    updatedAt: serverTimestamp()
  });

  currentProfile = {
    username: nextUsername,
    avatar: nextAvatar,
    setupComplete: true
  };
  publish();
  return { ...currentProfile };
}

async function skipSetup() {
  if (!currentUser || !db) throw new Error("Log in first.");

  await updateDoc(doc(db, "users", currentUser.uid), {
    setupComplete: true,
    updatedAt: serverTimestamp()
  });

  currentProfile = { ...currentProfile, setupComplete: true };
  publish();
}

async function signOutUser() {
  if (!auth) return;
  await signOut(auth);
}

function getState() {
  return {
    configured,
    user: safePublicUser(currentUser),
    profile: currentProfile ? { ...currentProfile } : null,
    error: lastError ? String(lastError.message || lastError) : null,
    defaultAvatar: DEFAULT_AVATAR
  };
}

async function boot() {
  if (!configLooksReady(cfg)) {
    configured = false;
    lastError = new Error("Firebase config is still using placeholders.");
    window.FortniteAuth = {
      configured: false,
      defaultAvatar: DEFAULT_AVATAR,
      maxUsernameChars: MAX_USERNAME_CHARS,
      normalizeUsername,
      getState,
      signInDefault: () => Promise.reject(lastError),
      signInAnother: () => Promise.reject(lastError),
      saveUsername: () => Promise.reject(lastError),
      saveAvatar: () => Promise.reject(lastError),
      finishSetup: () => Promise.reject(lastError),
      skipSetup: () => Promise.reject(lastError),
      signOut: async () => {}
    };
    window.__resolveFortniteAuthReady?.(window.FortniteAuth);
    publish();
    return;
  }

  try {
    const app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
    configured = true;

    window.FortniteAuth = {
      configured: true,
      defaultAvatar: DEFAULT_AVATAR,
      maxUsernameChars: MAX_USERNAME_CHARS,
      normalizeUsername,
      getState,
      signInDefault: () => signInGoogle(false),
      signInAnother: () => signInGoogle(true),
      saveUsername,
      saveAvatar,
      finishSetup,
      skipSetup,
      signOut: signOutUser
    };

    await setPersistence(auth, browserLocalPersistence);

    let initialStateResolved = false;

    onAuthStateChanged(auth, async (user) => {
      currentUser = user || null;
      currentProfile = null;
      lastError = null;

      if (currentUser) {
        try {
          currentProfile = await ensureProfile(currentUser);
        } catch (error) {
          lastError = error;
          currentProfile = {
            username: randomUsername(),
            avatar: "",
            setupComplete: false
          };
        }
      }

      publish();
      if (!initialStateResolved) {
        initialStateResolved = true;
        window.__resolveFortniteAuthReady?.(window.FortniteAuth);
      }
    });
  } catch (error) {
    configured = false;
    lastError = error;
    window.FortniteAuth = {
      configured: false,
      defaultAvatar: DEFAULT_AVATAR,
      maxUsernameChars: MAX_USERNAME_CHARS,
      normalizeUsername,
      getState,
      signInDefault: () => Promise.reject(error),
      signInAnother: () => Promise.reject(error),
      saveUsername: () => Promise.reject(error),
      saveAvatar: () => Promise.reject(error),
      finishSetup: () => Promise.reject(error),
      skipSetup: () => Promise.reject(error),
      signOut: async () => {}
    };
    window.__resolveFortniteAuthReady?.(window.FortniteAuth);
    publish();
  }
}

boot();
