# QuitHabit — Dark Edition

A browser-based habit tracking app focused on quitting **scrolling**, **sugar**, and **smoking**. It uses a dark, terminal-inspired UI, streaks, check-ins, progress analytics, and relapse logging.

## Tech stack

| Layer | Details |
|--------|---------|
| **Frontend** | HTML, CSS, vanilla JavaScript (no React/Vue build step) |
| **Charts** | [Chart.js](https://www.chartjs.org/) (loaded from CDN on the Progress page) |
| **Optional cloud** | [Firebase](https://firebase.google.com/) Authentication + Firestore (see below) |
| **Local-only mode** | Web Crypto **PBKDF2** password hashing + `localStorage` (no server required) |

There is **no custom backend** in this repository. With Firebase, Google hosts auth and database; without it, everything runs **only in your browser**.

## Features

- User registration and login (local or Firebase)
- Dashboard: habit toggles, progress bars, daily check-ins, streak ring, recent activity
- Progress: KPIs, **stacked bar chart** (7-day clean check-ins per habit), **relapse trend line chart**, history table (50 entries), **CSV export**, filtered relapse list
- Achievements derived from your data
- Responsive layout and dark theme

## Quick start (no Firebase required)

1. Clone or copy this folder.
2. Open **`index.html`** in a modern browser (Chrome, Edge, Firefox), **or** open the folder in VS Code and use **Run and Debug** → **Open QuitHabit (index.html)** (see `.vscode/launch.json`).
3. Go to **Launch App** / **login.html**, create an account, then use **Dashboard** and **Progress**.

Data stays on **this device and browser** until you enable Firebase.

## Optional: Firebase (cloud login & sync)

To store accounts and data in the cloud (same login on multiple devices):

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Add a **Web** app and copy the config object.
3. Paste values into **`firebase-config.js`** (replace all `REPLACE_WITH_…` placeholders).
4. Enable **Authentication** → **Sign-in method** → **Email/Password**.
5. Create **Firestore** and deploy rules. This repo includes **`firestore.rules`** so each user can only read/write `users/{theirUserId}`.

If config is still placeholder, the app **automatically uses local mode**.

## Project structure

```
QUIT HABIT/
├── index.html          # Landing page
├── login.html          # Register / login
├── dashboard.html      # Habits & check-ins
├── progress.html       # Analytics & charts
├── about.html          # About
├── style.css           # Styles
├── script.js           # UI, charts, routing logic
├── app-data.js         # Auth + storage (local PBKDF2 or Firebase)
├── firebase-config.js  # Firebase keys (optional)
├── firestore.rules     # Example Firestore security rules
├── .vscode/
│   └── launch.json     # Debug: open index.html in browser
└── README.md
```

## Scripts load order (pages with Firebase)

On `login.html`, `dashboard.html`, and `progress.html`:

1. Firebase compat SDKs (app, auth, firestore)
2. `firebase-config.js`
3. `app-data.js`
4. `script.js`  
`progress.html` also loads Chart.js before `script.js`.

`index.html` and `about.html` load only `app-data.js` and `script.js` (no Firebase SDK).

## Privacy

- **Local mode:** Data and hashed credentials live in **browser storage** on your machine. Clearing site data removes it.
- **Firebase mode:** Data is stored under your Firebase project; follow Google’s terms and your Firestore rules.

## License

Use and modify for your own projects as needed (e.g. college or personal). Add a `LICENSE` file if you need a formal license.

---

**QuitHabit** — Break free, track honestly, improve over time.
