/**
 * Firebase — replace placeholders with your project keys (Firebase Console → Project settings).
 * Authentication: Email/Password (enable in Console → Authentication → Sign-in method).
 * Firestore: create database in test mode or add rules (see comment at bottom).
 */
(function () {
  window.__firebaseConfigured = false;
  window.__firebaseInitError = null;

  if (typeof firebase === "undefined") return;

  var firebaseConfig = {
    apiKey: "REPLACE_WITH_YOUR_API_KEY",
    authDomain: "REPLACE_WITH_your-app.firebaseapp.com",
    projectId: "REPLACE_WITH_your_project_id",
    storageBucket: "REPLACE_WITH_your-app.appspot.com",
    messagingSenderId: "REPLACE_WITH_SENDER_ID",
    appId: "REPLACE_WITH_APP_ID"
  };

  var placeholder =
    !firebaseConfig.apiKey ||
    firebaseConfig.apiKey.indexOf("REPLACE") !== -1 ||
    firebaseConfig.projectId.indexOf("REPLACE") !== -1;

  if (placeholder) {
    console.info(
      "[QuitHabit] Firebase config not set — using secure local authentication (IndexedDB + SHA-256). " +
        "Add firebase-config.js keys to enable cloud sync."
    );
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    window.__firebaseConfigured = true;
  } catch (e) {
    window.__firebaseInitError = e;
    console.error("[QuitHabit] Firebase init failed:", e);
  }
})();
