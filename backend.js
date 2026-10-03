// Cloud storage for Property Desk.
// Real app: your own Google Firebase project (Firestore database + email sign-in).
// Demo build (npm run dev): an in-browser fake store, so the screens can be tried without a cloud project.
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

/* ---------- config saved on this phone ---------- */
const CFG_KEY = 'pd_firebase_config';
export function loadConfig() { try { const v = localStorage.getItem(CFG_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
export function saveConfig(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
export function clearConfig() { try { localStorage.removeItem(CFG_KEY); } catch (e) {} }

// Accepts the snippet exactly as Firebase shows it ("const firebaseConfig = { apiKey: "...", ... }") or plain JSON.
export function parseConfig(text) {
  const out = {};
  const re = /["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g;
  let m; while ((m = re.exec(String(text || '')))) out[m[1]] = m[2].trim();
  if (!out.apiKey || !out.projectId || !out.appId) return null;
  if (!out.authDomain) out.authDomain = out.projectId + '.firebaseapp.com';
  return out;
}

/* ---------- friendly error text ---------- */
export function authMessage(e) {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Email or password is wrong. Check both and try again.';
  if (c.includes('invalid-email')) return 'That email address is not valid.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes, then try again.';
  if (c.includes('network-request-failed')) return 'No internet connection. Connect and try again.';
  if (c.includes('user-disabled')) return 'This account has been disabled in Firebase.';
  if (c.includes('operation-not-allowed')) return 'Email/Password sign-in is not turned on. In Firebase, open Authentication → Sign-in method and enable Email/Password.';
  if (c.includes('configuration-not-found')) return 'Authentication is not set up in this Firebase project. Open Authentication in Firebase and click Get started.';
  if (/api-key|invalid-api-key/.test(c)) return 'The Firebase settings are not valid. Disconnect and paste the config again.';
  return 'Sign-in failed (' + (c || 'unknown error') + ').';
}
export function dataMessage(e) {
  const c = (e && e.code) || '';
  if (c === 'permission-denied') return 'The cloud database refused access. Check the Firestore security rules (see the setup guide).';
  if (c === 'not-found' || c === 'failed-precondition') return 'The Firestore database has not been created yet. In Firebase, open Firestore Database and click Create database.';
  if (c === 'unavailable') return 'Working offline. Changes will sync when you are back online.';
  return 'Cloud error (' + (c || 'unknown') + ').';
}

/* ---------- Firebase backend ---------- */
let fb = null;
export function connect(cfg) {
  if (__DEMO__) return demoBackend();
  const app = initializeApp(cfg, 'pd-' + Date.now());
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  const fs = initializeFirestore(app, { localCache: persistentLocalCache() });
  fb = {
    projectId: cfg.projectId,
    onAuth: cb => onAuthStateChanged(auth, u => cb(u ? { email: u.email, uid: u.uid } : null)),
    signIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
    resetPassword: email => sendPasswordResetEmail(auth, email),
    signOut: () => signOut(auth),
    listen: (coll, next, err) => onSnapshot(collection(fs, coll), s => next(s.docs.map(d => ({ id: d.id, ...d.data() })), s.metadata.fromCache), err),
    listenDoc: (path, next, err) => onSnapshot(doc(fs, path), s => next(s.exists() ? s.data() : null), err),
    newId: coll => doc(collection(fs, coll)).id,
    set: (path, body) => writeWait(setDoc(doc(fs, path), body)),
    update: (path, body) => writeWait(updateDoc(doc(fs, path), body)),
    del: path => writeWait(deleteDoc(doc(fs, path))),
    destroy: () => deleteApp(app).catch(() => {})
  };
  return fb;
}
// Firestore applies a write on the phone at once and confirms with the server later.
// Wait briefly for the server; if offline, report "queued" instead of hanging.
function writeWait(p) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve('queued'); } }, 2500);
    p.then(() => { if (!done) { done = true; clearTimeout(t); resolve('saved'); } },
      e => { if (!done) { done = true; clearTimeout(t); reject(e); } else window.dispatchEvent(new CustomEvent('pd-late-error', { detail: e })); });
  });
}

/* ---------- demo backend (browser testing only) ---------- */
function demoBackend() {
  const KEY = 'pd_demo_store';
  let store = {}; try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const subs = [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const emit = () => subs.forEach(s => s());
  const collDocs = c => Object.entries(store).filter(([p]) => p.split('/').length === 2 && p.startsWith(c + '/')).map(([p, v]) => ({ id: p.split('/')[1], ...JSON.parse(JSON.stringify(v)) }));
  let user = null; let authCb = null;
  return {
    projectId: 'demo-project',
    onAuth: cb => { authCb = cb; setTimeout(() => cb(user), 50); return () => {}; },
    signIn: async (email, pw) => { if (pw.length < 4) throw { code: 'auth/invalid-credential' }; user = { email, uid: 'demo' }; authCb && authCb(user); },
    resetPassword: async () => {},
    signOut: async () => { user = null; authCb && authCb(null); },
    listen: (c, next) => { const f = () => next(collDocs(c), false); subs.push(f); setTimeout(f, 30); return () => {}; },
    listenDoc: (path, next) => { const f = () => next(store[path] ? JSON.parse(JSON.stringify(store[path])) : null); subs.push(f); setTimeout(f, 30); return () => {}; },
    newId: () => Math.random().toString(36).slice(2, 12),
    set: async (path, body) => { store[path] = JSON.parse(JSON.stringify(body)); persist(); emit(); return 'saved'; },
    update: async (path, body) => { if (!store[path]) throw { code: 'not-found' }; Object.assign(store[path], JSON.parse(JSON.stringify(body))); persist(); emit(); return 'saved'; },
    del: async path => { delete store[path]; persist(); emit(); return 'saved'; },
    destroy: () => {}
  };
}
