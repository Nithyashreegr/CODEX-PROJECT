/**
 * QuitHabit — data layer: Firebase (Auth + Firestore) or secure local (PBKDF2 + localStorage).
 */
(function () {
  "use strict";

  var PBKDF2_ITER = 120000;
  var USERS_KEY = "qh_users_v2";
  var LEGACY_USERS = "qh_users";
  var SESSION_KEY = "qh_session";
  var DATA_PREFIX = "qh_data_";

  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function hexToBuf(hex) {
    var a = new Uint8Array(hex.length / 2);
    for (var i = 0; i < a.length; i++) {
      a[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return a.buffer;
  }

  function getStore() {
    return {
      get: function (k) {
        try {
          return JSON.parse(localStorage.getItem(k));
        } catch (e) {
          return null;
        }
      },
      set: function (k, v) {
        localStorage.setItem(k, JSON.stringify(v));
      },
      del: function (k) {
        localStorage.removeItem(k);
      }
    };
  }

  var store = getStore();

  async function hashPassword(password) {
    var enc = new TextEncoder();
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
      keyMaterial,
      256
    );
    return { salt: bufToHex(salt.buffer), hash: bufToHex(bits), iterations: PBKDF2_ITER };
  }

  async function verifyPassword(password, saltHex, hashHex, iterations) {
    var enc = new TextEncoder();
    var salt = new Uint8Array(hexToBuf(saltHex));
    var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt, iterations: iterations || PBKDF2_ITER, hash: "SHA-256" },
      keyMaterial,
      256
    );
    return bufToHex(bits) === hashHex;
  }

  function defaultUserDoc(email, displayName) {
    var today = new Date().toISOString().slice(0, 10);
    function past(n) {
      var d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    }
    return {
      email: email,
      habits: {
        scrolling: { active: true, streak: 0, bestStreak: 0, progress: 0 },
        sugar: { active: false, streak: 0, bestStreak: 0, progress: 0 },
        smoking: { active: true, streak: 0, bestStreak: 0, progress: 0 }
      },
      logs: [
        { date: today, habit: "scrolling", status: "clean", note: "Welcome — first log." },
        { date: past(1), habit: "smoking", status: "clean", note: "" },
        { date: past(2), habit: "sugar", status: "partial", note: "" }
      ],
      achievements: [],
      points: 0,
      updatedAt: Date.now()
    };
  }

  var QHData = {
    mode: "local",
    authPromise: null,
    _authResolve: null,
    currentUser: null,

    init: function () {
      var self = this;
      if (self.authPromise) return self.authPromise;
      self.authPromise = new Promise(function (resolve) {
        self._authResolve = resolve;
      });

      if (window.__firebaseConfigured && typeof firebase !== "undefined" && firebase.auth) {
        self.mode = "firebase";
        firebase.auth().onAuthStateChanged(
          function (user) {
            self.currentUser = user;
            if (self._authResolve) {
              self._authResolve();
              self._authResolve = null;
            }
          },
          function () {
            if (self._authResolve) {
              self._authResolve();
              self._authResolve = null;
            }
          }
        );
      } else {
        self.mode = "local";
        setTimeout(function () {
          if (self._authResolve) {
            self._authResolve();
            self._authResolve = null;
          }
        }, 0);
      }
      return self.authPromise;
    },

    useCloud: function () {
      return this.mode === "firebase";
    },

    getSession: function () {
      if (this.mode === "firebase" && this.currentUser) {
        var n = this.currentUser.displayName || this.currentUser.email.split("@")[0];
        return { uid: this.currentUser.uid, name: n, email: this.currentUser.email };
      }
      return store.get(SESSION_KEY);
    },

    isLoggedIn: function () {
      if (this.mode === "firebase") return !!this.currentUser;
      return !!store.get(SESSION_KEY);
    },

    signUp: async function (name, email, password) {
      email = email.trim().toLowerCase();
      if (this.mode === "firebase") {
        var cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        var db = firebase.firestore();
        await db
          .collection("users")
          .doc(cred.user.uid)
          .set(
            {
              profile: { name: name, email: email, createdAt: firebase.firestore.FieldValue.serverTimestamp() },
              app: defaultUserDoc(email, name)
            },
            { merge: true }
          );
        return { ok: true };
      }

      var users = store.get(USERS_KEY) || [];
      if (users.some(function (u) { return u.email === email; })) {
        return { ok: false, code: "email-in-use" };
      }
      var legacy = store.get(LEGACY_USERS) || [];
      if (legacy.some(function (u) { return u.email === email; })) {
        return { ok: false, code: "email-in-use" };
      }

      var h = await hashPassword(password);
      users.push({
        email: email,
        name: name.trim(),
        salt: h.salt,
        hash: h.hash,
        iterations: h.iterations
      });
      store.set(USERS_KEY, users);
      store.set(SESSION_KEY, { name: name.trim(), email: email });
      var data = defaultUserDoc(email, name);
      store.set(DATA_PREFIX + email, data);
      return { ok: true };
    },

    signIn: async function (email, password) {
      email = email.trim().toLowerCase();
      if (this.mode === "firebase") {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        return { ok: true };
      }

      var users = store.get(USERS_KEY) || [];
      var u = users.find(function (x) { return x.email === email; });
      if (u && u.hash) {
        var ok = await verifyPassword(password, u.salt, u.hash, u.iterations);
        if (!ok) return { ok: false, code: "wrong-password" };
        store.set(SESSION_KEY, { name: u.name, email: u.email });
        return { ok: true };
      }

      var legacy = store.get(LEGACY_USERS) || [];
      var leg = legacy.find(function (x) { return x.email === email && x.pass === password; });
      if (leg) {
        store.set(SESSION_KEY, { name: leg.name, email: leg.email });
        var h = await hashPassword(password);
        var arr = store.get(USERS_KEY) || [];
        arr.push({
          email: leg.email,
          name: leg.name,
          salt: h.salt,
          hash: h.hash,
          iterations: h.iterations
        });
        store.set(USERS_KEY, arr);
        return { ok: true };
      }

      return { ok: false, code: "not-found" };
    },

    signOut: async function () {
      if (this.mode === "firebase") {
        await firebase.auth().signOut();
      } else {
        store.del(SESSION_KEY);
      }
    },

    loadUserData: async function () {
      if (this.mode === "firebase") {
        var user = this.currentUser;
        if (!user) return null;
        var db = firebase.firestore();
        var snap = await db.collection("users").doc(user.uid).get();
        var d = snap.exists ? snap.data() : null;
        if (!d || !d.app) {
          var fresh = defaultUserDoc(user.email, user.displayName || "User");
          await db.collection("users").doc(user.uid).set(
            {
              profile: {
                name: user.displayName || user.email.split("@")[0],
                email: user.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              },
              app: fresh
            },
            { merge: true }
          );
          return fresh;
        }
        return d.app;
      }

      var s = store.get(SESSION_KEY);
      if (!s) return null;
      var data = store.get(DATA_PREFIX + s.email);
      if (!data) {
        data = defaultUserDoc(s.email, s.name);
        store.set(DATA_PREFIX + s.email, data);
      }
      return data;
    },

    saveUserData: async function (data) {
      data.updatedAt = Date.now();
      if (this.mode === "firebase") {
        var user = this.currentUser;
        if (!user) return;
        await firebase.firestore().collection("users").doc(user.uid).set({ app: data }, { merge: true });
        return;
      }
      var s = store.get(SESSION_KEY);
      if (s) store.set(DATA_PREFIX + s.email, data);
    },

    firebaseErrorMessage: function (err) {
      if (!err || !err.code) return "Something went wrong.";
      var map = {
        "auth/email-already-in-use": "That email is already registered.",
        "auth/invalid-email": "Invalid email address.",
        "auth/weak-password": "Password should be at least 6 characters.",
        "auth/user-not-found": "No account with that email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/too-many-requests": "Too many attempts. Try again later."
      };
      return map[err.code] || err.message || "Authentication failed.";
    }
  };

  window.QHData = QHData;
})();
