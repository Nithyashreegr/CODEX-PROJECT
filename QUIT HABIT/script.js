/* ============================================
   QuitHabit — Auth (Firebase or PBKDF2 local), Firestore/local tracking, analytics
   ============================================ */
"use strict";

const qhState = { data: null };

/* ============================
   CUSTOM CURSOR
   ============================ */
function initCursor() {
  const cursor = document.querySelector(".cursor");
  const cursorRing = document.querySelector(".cursor-ring");
  if (!cursor || !cursorRing) return;
  let mx = -100,
    my = -100,
    rx = -100,
    ry = -100;
  document.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    cursor.style.left = mx + "px";
    cursor.style.top = my + "px";
  });
  (function animateRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    cursorRing.style.left = rx + "px";
    cursorRing.style.top = ry + "px";
    requestAnimationFrame(animateRing);
  })();
  document.querySelectorAll("a, button, .habit-card, .habit-pill, .status-btn, .quote-refresh, .auth-tab").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      cursor.classList.add("active");
      cursorRing.classList.add("active");
    });
    el.addEventListener("mouseleave", () => {
      cursor.classList.remove("active");
      cursorRing.classList.remove("active");
    });
  });
}

/* ============================
   SCROLL REVEAL
   ============================ */
function initReveal() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal, .reveal-left, .reveal-right").forEach((el) => io.observe(el));
  document.querySelectorAll(".stagger > *").forEach((el) => {
    el.classList.add("reveal");
    io.observe(el);
  });
}

/* ============================
   NAVBAR
   ============================ */
function initNavbar() {
  const ham = document.querySelector(".hamburger");
  const nav = document.querySelector(".nav-links");
  if (ham && nav) {
    ham.addEventListener("click", () => nav.classList.toggle("open"));
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));
  }
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (href === page || (page === "" && href === "index.html") || (href && href.includes(page))) a.classList.add("active");
  });
}

/* ============================
   DATES & HELPERS
   ============================ */
const todayKey = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d = new Date()) => new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const getPastDate = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function logsForHabit(data, hid) {
  return data.logs.filter((l) => l.habit === hid).sort((a, b) => a.date.localeCompare(b.date));
}

function bestStreakFromLogs(logsAsc) {
  let cur = 0,
    best = 0;
  for (const log of logsAsc) {
    if (log.status === "clean") {
      cur++;
      best = Math.max(best, cur);
    } else if (log.status === "relapse") cur = 0;
  }
  return best;
}

function currentStreakFromLogs(logsAsc) {
  let streak = 0;
  for (let i = logsAsc.length - 1; i >= 0; i--) {
    const log = logsAsc[i];
    if (log.status === "clean") streak++;
    else break;
  }
  return streak;
}

function recomputeDerivedStats(data) {
  const habits = ["scrolling", "sugar", "smoking"];
  for (const hid of habits) {
    const logs = logsForHabit(data, hid);
    const clean = logs.filter((l) => l.status === "clean").length;
    const total = logs.length;
    data.habits[hid].bestStreak = bestStreakFromLogs(logs);
    data.habits[hid].streak = currentStreakFromLogs(logs);
    data.habits[hid].progress = total === 0 ? 0 : Math.min(100, Math.round((clean / total) * 100));
  }
  data.achievements = computeAchievements(data);
  data.points = Math.min(9999, data.logs.filter((l) => l.status === "clean").length * 10);
}

function computeAchievements(data) {
  const a = new Set(data.achievements || []);
  const hs = data.habits;
  if (data.logs.some((l) => l.status === "clean")) a.add("first_day");
  if (Object.values(hs).some((h) => h.bestStreak >= 7)) a.add("week_warrior");
  if (hs.smoking && hs.smoking.streak >= 18) a.add("smoke_free");
  if (hs.sugar && hs.sugar.bestStreak >= 10) a.add("sugar_slayer");
  if (hs.scrolling && hs.scrolling.bestStreak >= 30) a.add("detox_master");
  const rel = data.logs.filter((l) => l.status === "relapse");
  if (rel.length && data.logs.some((l) => l.status === "clean")) a.add("comeback");
  return [...a];
}

/* ============================
   AUTH (async)
   ============================ */
async function initAuth() {
  if (!document.getElementById("loginForm") && !document.getElementById("signupForm")) return;
  await QHData.init();
  await QHData.authPromise;

  if (QHData.useCloud() && QHData.currentUser) {
    location.href = "dashboard.html";
    return;
  }
  if (!QHData.useCloud() && QHData.getSession()) {
    location.href = "dashboard.html";
    return;
  }

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab, .auth-form").forEach((x) => x.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab + "Form").classList.add("active");
    });
  });

  const se = (id, m) => {
    const e = document.getElementById(id + "Err"),
      i = document.getElementById(id);
    if (e) {
      e.textContent = m;
      e.classList.add("show");
    }
    if (i) i.classList.add("error");
  };
  const ce = (id) => {
    const e = document.getElementById(id + "Err"),
      i = document.getElementById(id);
    if (e) e.classList.remove("show");
    if (i) i.classList.remove("error");
  };

  const sf = document.getElementById("signupForm");
  if (sf) {
    sf.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => ce(i.id)));
    sf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("regName").value.trim(),
        email = document.getElementById("regEmail").value.trim(),
        pass = document.getElementById("regPass").value,
        conf = document.getElementById("regConf").value;
      let ok = true;
      ["regName", "regEmail", "regPass", "regConf"].forEach(ce);
      if (!name) {
        se("regName", "Name required.");
        ok = false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        se("regEmail", "Valid email required.");
        ok = false;
      }
      if (pass.length < 6) {
        se("regPass", "Min 6 characters.");
        ok = false;
      }
      if (pass !== conf) {
        se("regConf", "Passwords do not match.");
        ok = false;
      }
      if (!ok) return;
      try {
        const r = await QHData.signUp(name, email, pass);
        if (!r.ok && r.code === "email-in-use") {
          se("regEmail", "Email already registered.");
          return;
        }
        const t = document.getElementById("signupToast");
        if (t) {
          t.textContent = QHData.useCloud() ? "// Account created. Syncing with cloud..." : "// Account created (PBKDF2-secured). Redirecting...";
          t.classList.add("show");
        }
        setTimeout(() => (location.href = "dashboard.html"), 900);
      } catch (err) {
        se("regEmail", QHData.firebaseErrorMessage(err));
      }
    });
  }

  const lf = document.getElementById("loginForm");
  if (lf) {
    lf.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => ce(i.id)));
    lf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim(),
        pass = document.getElementById("loginPass").value;
      let ok = true;
      ["loginEmail", "loginPass"].forEach(ce);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        se("loginEmail", "Valid email required.");
        ok = false;
      }
      if (!pass) {
        se("loginPass", "Password required.");
        ok = false;
      }
      if (!ok) return;
      try {
        const r = await QHData.signIn(email, pass);
        if (!r.ok) {
          se("loginEmail", "Incorrect email or password.");
          return;
        }
        const t = document.getElementById("loginToast");
        if (t) {
          t.textContent = QHData.useCloud() ? "// Authenticated (Firebase). Loading..." : "// Session secured. Loading...";
          t.classList.add("show");
        }
        setTimeout(() => (location.href = "dashboard.html"), 700);
      } catch (err) {
        se("loginEmail", QHData.firebaseErrorMessage(err));
      }
    });
  }
}

/* ============================
   DASHBOARD
   ============================ */
async function initDashboard() {
  if (!document.querySelector(".dashboard-page")) return;
  await QHData.init();
  await QHData.authPromise;

  if (QHData.useCloud() && !QHData.currentUser) {
    location.href = "login.html";
    return;
  }
  if (!QHData.useCloud() && !QHData.getSession()) {
    location.href = "login.html";
    return;
  }

  const data = await QHData.loadUserData();
  if (!data) return;
  recomputeDerivedStats(data);
  await QHData.saveUserData(data);
  qhState.data = data;

  const s = QHData.getSession();
  const n = document.getElementById("welcomeName");
  if (n) n.textContent = (s.name || "User").split(" ")[0];
  const dd = document.getElementById("dashDate");
  if (dd) dd.textContent = "// " + fmtDate();
  const modeEl = document.getElementById("dataModeBadge");
  if (modeEl) modeEl.textContent = QHData.useCloud() ? "CLOUD" : "LOCAL+PBKDF2";

  renderHabitCards();
  renderDashboardProgressBars();
  renderStreak(data);
  renderLogList(data);
  renderQuote();
  initCheckin();
  updateBestStreakLabel(data);
}

function updateBestStreakLabel(data) {
  const best = Math.max(...Object.values(data.habits).map((h) => h.bestStreak));
  const el = document.getElementById("bestStreakLabel");
  if (el) el.textContent = "Best: " + best + " days 🏆";
}

function renderHabitCards() {
  const data = qhState.data;
  if (!data) return;
  const row = document.querySelector(".habits-row");
  if (!row || row.dataset.bound === "1") return;
  row.dataset.bound = "1";
  row.addEventListener("click", (e) => {
    const card = e.target.closest(".habit-card");
    if (!card) return;
    const h = data.habits[card.dataset.habit];
    if (!h) return;
    h.active = !h.active;
    card.classList.toggle("active", h.active);
    const chk = card.querySelector(".hc-check");
    if (chk) chk.textContent = h.active ? "[ ON ]" : "[ OFF ]";
    QHData.saveUserData(data);
  });

  document.querySelectorAll(".habit-card").forEach((card) => {
    const h = data.habits[card.dataset.habit];
    if (!h) return;
    card.classList.toggle("active", h.active);
    const st = card.querySelector(".hc-streak");
    if (st) st.textContent = "🔥 " + h.streak + " day streak";
    const chk = card.querySelector(".hc-check");
    if (chk) chk.textContent = h.active ? "[ ON ]" : "[ OFF ]";
  });
}

function renderDashboardProgressBars() {
  const data = qhState.data;
  if (!data) return;
  const items = document.querySelectorAll(".dash-main .progress-item, .dashboard-page .progress-item");
  items.forEach((item) => {
    const label = item.querySelector(".pi-label");
    const pctEl = item.querySelector(".pi-pct");
    const fill = item.querySelector(".progress-fill");
    if (!label || !fill) return;
    const t = label.textContent;
    let hid = "scrolling";
    if (t.indexOf("Sugar") >= 0) hid = "sugar";
    if (t.indexOf("Smoking") >= 0) hid = "smoking";
    const p = data.habits[hid].progress;
    if (pctEl) pctEl.textContent = p + "%";
    fill.dataset.pct = p;
  });
  document.querySelectorAll(".progress-fill").forEach((fill) => {
    const pct = fill.dataset.pct || 0;
    fill.style.width = "0%";
    setTimeout(() => {
      fill.style.width = pct + "%";
    }, 300);
  });
}

function renderStreak(data) {
  const active = Object.values(data.habits).filter((h) => h.active);
  const avg = active.length ? Math.round(active.reduce((s, h) => s + h.streak, 0) / active.length) : 0;
  const n = document.getElementById("streakNum");
  if (n && n.childNodes[0]) n.childNodes[0].textContent = avg;
  const ring = document.querySelector(".streak-ring");
  if (ring) {
    const p = Math.min(100, (avg / 30) * 100);
    ring.style.background = `conic-gradient(var(--neon) 0% ${p}%, var(--bg-raised) ${p}% 100%)`;
  }
}

function renderLogList(data) {
  const list = document.getElementById("logList");
  if (!list) return;
  list.innerHTML = [...data.logs]
    .slice(-5)
    .reverse()
    .map(
      (log) => `
    <div class="log-item">
      <div class="log-dot ${log.status === "clean" ? "ld-clean" : "ld-relapse"}"></div>
      <div class="log-info">
        <div class="log-habit">${capitalize(log.habit)}</div>
        <div class="log-time">${fmtDate(log.date)}${log.note ? " · " + escapeHtml(log.note) : ""}</div>
      </div>
      <span class="log-status ${log.status === "clean" ? "ls-clean" : "ls-relapse"}">${log.status === "clean" ? "[ OK ]" : "[ MISS ]"}</span>
    </div>`
    )
    .join("");
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function initCheckin() {
  let sh = null,
    ss = null;
  document.querySelectorAll(".habit-pill").forEach((p) => {
    p.addEventListener("click", () => {
      document.querySelectorAll(".habit-pill").forEach((x) => x.classList.remove("active"));
      p.classList.add("active");
      sh = p.dataset.habit;
    });
  });
  document.querySelectorAll(".status-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".status-btn").forEach((x) => x.classList.remove("clean", "relapse"));
      b.classList.add(b.dataset.status);
      ss = b.dataset.status;
    });
  });
  const sub = document.getElementById("checkinSubmit");
  if (sub)
    sub.addEventListener("click", async () => {
      const data = qhState.data;
      if (!data) return;
      if (!sh || !ss) {
        showToast("⚠ Select habit + status first.");
        return;
      }
      const note = (document.getElementById("checkinNote") || {}).value || "";
      data.logs.push({ date: todayKey(), habit: sh, status: ss, note });
      const h = data.habits[sh];
      if (ss === "clean") {
        h.streak++;
        if (h.streak > h.bestStreak) h.bestStreak = h.streak;
        h.progress = Math.min(100, h.progress + 2);
      } else {
        h.streak = 0;
      }
      recomputeDerivedStats(data);
      await QHData.saveUserData(data);
      renderLogList(data);
      renderStreak(data);
      renderHabitCardsRefresh();
      renderDashboardProgressBars();
      document.querySelectorAll(".habit-pill,.status-btn").forEach((x) => x.classList.remove("active", "clean", "relapse"));
      const ni = document.getElementById("checkinNote");
      if (ni) ni.value = "";
      sh = null;
      ss = null;
      updateBestStreakLabel(data);
      showToast("✓ Check-in saved. Analytics updated.");
    });
}

function renderHabitCardsRefresh() {
  const data = qhState.data;
  if (!data) return;
  document.querySelectorAll(".habit-card").forEach((card) => {
    const h = data.habits[card.dataset.habit];
    if (!h) return;
    card.classList.toggle("active", h.active);
    const st = card.querySelector(".hc-streak");
    if (st) st.textContent = "🔥 " + h.streak + " day streak";
    const chk = card.querySelector(".hc-check");
    if (chk) chk.textContent = h.active ? "[ ON ]" : "[ OFF ]";
  });
}

/* ============================
   QUOTES
   ============================ */
const QUOTES = [
  { text: "Every moment is a fresh beginning.", author: "T.S. Eliot" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
  { text: "We are what we repeatedly do. Excellence is not an act, but a habit.", author: "Aristotle" },
  { text: "It does not matter how slowly you go, as long as you do not stop.", author: "Confucius" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "A. Lincoln" },
  { text: "The chains of habit are too light to be felt until too heavy to be broken.", author: "W. Buffett" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Your habits will determine your future.", author: "Jack Canfield" },
  { text: "The secret of your future is hidden in your daily routine.", author: "Mike Murdock" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" }
];

function renderQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const qt = document.getElementById("quoteText");
  const qa = document.getElementById("quoteAuthor");
  if (qt) qt.textContent = `"${q.text}"`;
  if (qa) qa.textContent = `— ${q.author}`;
}

/* ============================
   CHARTS (Chart.js) + ANALYTICS
   ============================ */
const chartColors = {
  scrolling: "rgb(0, 255, 136)",
  sugar: "rgb(255, 77, 109)",
  smoking: "rgb(0, 229, 255)",
  grid: "rgba(255,255,255,0.06)",
  text: "rgb(160, 170, 180)"
};

function lastNDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function weeklyCleanCounts(data) {
  const dates = lastNDates(7);
  const habits = ["scrolling", "sugar", "smoking"];
  const labels = dates.map((ds) => {
    const d = new Date(ds + "T12:00:00");
    return d.toLocaleDateString("en-IN", { weekday: "short" });
  });
  const sets = habits.map((hid) => ({
    label: capitalize(hid),
    data: dates.map((ds) => data.logs.filter((l) => l.date === ds && l.habit === hid && l.status === "clean").length),
    backgroundColor: chartColors[hid].replace("rgb(", "rgba(").replace(")", ", 0.82)")
  }));
  return { labels, sets };
}

function weeklyRelapseCounts(data) {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const ds0 = start.toISOString().slice(0, 10);
    const ds1 = end.toISOString().slice(0, 10);
    const n = data.logs.filter((l) => l.status === "relapse" && l.date >= ds0 && l.date <= ds1).length;
    out.push({ label: "−" + i + "w", count: n });
  }
  return out.reverse();
}

function destroyCharts() {
  if (window.__qhCharts) {
    window.__qhCharts.forEach((c) => {
      try {
        c.destroy();
      } catch (e) {}
    });
  }
  window.__qhCharts = [];
}

function renderAnalyticsCharts(data) {
  if (typeof Chart === "undefined") return;
  destroyCharts();
  const w = weeklyCleanCounts(data);
  const canvas1 = document.getElementById("weeklyActivityChart");
  if (canvas1) {
    const c1 = new Chart(canvas1.getContext("2d"), {
      type: "bar",
      data: {
        labels: w.labels,
        datasets: w.sets.map((s) => ({
          label: s.label,
          data: s.data,
          backgroundColor: s.backgroundColor,
          borderWidth: 0
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: chartColors.text } },
          title: { display: true, text: "Clean check-ins per day (last 7 days)", color: chartColors.text }
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: chartColors.text },
            grid: { color: chartColors.grid }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { stepSize: 1, color: chartColors.text, precision: 0 },
            grid: { color: chartColors.grid }
          }
        }
      }
    });
    window.__qhCharts.push(c1);
  }

  const rel = weeklyRelapseCounts(data);
  const canvas2 = document.getElementById("relapseTrendChart");
  if (canvas2) {
    const c2 = new Chart(canvas2.getContext("2d"), {
      type: "line",
      data: {
        labels: rel.map((x) => x.label),
        datasets: [
          {
            label: "Relapses (rolling weeks)",
            data: rel.map((x) => x.count),
            borderColor: "rgb(255, 77, 109)",
            backgroundColor: "rgba(255, 77, 109, 0.15)",
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: chartColors.text } },
          title: { display: true, text: "Relapse trend (9 rolling windows)", color: chartColors.text }
        },
        scales: {
          x: { ticks: { color: chartColors.text }, grid: { color: chartColors.grid } },
          y: { beginAtZero: true, ticks: { stepSize: 1, color: chartColors.text }, grid: { color: chartColors.grid } }
        }
      }
    });
    window.__qhCharts.push(c2);
  }
}

function exportLogsCsv(data) {
  const rows = [["date", "habit", "status", "note"].join(",")].concat(
    data.logs.map((l) =>
      [l.date, l.habit, l.status, `"${(l.note || "").replace(/"/g, '""')}"`].join(",")
    )
  );
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "quithabit_logs_" + todayKey() + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============================
   PROGRESS PAGE
   ============================ */
async function initProgress() {
  if (!document.querySelector(".progress-page")) return;
  await QHData.init();
  await QHData.authPromise;

  if (QHData.useCloud() && !QHData.currentUser) {
    location.href = "login.html";
    return;
  }
  if (!QHData.useCloud() && !QHData.getSession()) {
    location.href = "login.html";
    return;
  }

  const data = await QHData.loadUserData();
  if (!data) return;
  recomputeDerivedStats(data);
  await QHData.saveUserData(data);
  qhState.data = data;

  const modeEl = document.getElementById("dataModeBadge");
  if (modeEl) modeEl.textContent = QHData.useCloud() ? "CLOUD" : "LOCAL";

  const animNum = (id, target) => {
    const el = document.getElementById(id);
    if (!el) return;
    let c = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const t = setInterval(() => {
      c = Math.min(c + step, target);
      el.textContent = c;
      if (c >= target) clearInterval(t);
    }, 25);
  };

  const total = Object.values(data.habits).reduce((s, h) => s + h.streak, 0);
  animNum("kpiDays", total);
  animNum("kpiClean", data.logs.filter((l) => l.status === "clean").length);
  animNum("kpiRelapses", data.logs.filter((l) => l.status === "relapse").length);
  animNum("kpiBest", Math.max(...Object.values(data.habits).map((h) => h.bestStreak)));

  const wc = document.getElementById("weekChart");
  if (wc) {
    wc.innerHTML =
      '<div class="chart-wrap" style="position:relative;height:280px;margin-bottom:8px"><canvas id="weeklyActivityChart" aria-label="Weekly activity"></canvas></div>' +
      '<div class="chart-wrap" style="position:relative;height:220px"><canvas id="relapseTrendChart" aria-label="Relapse trend"></canvas></div>';
  }
  renderAnalyticsCharts(data);

  const tb = document.getElementById("historyBody");
  if (tb)
    tb.innerHTML = [...data.logs]
      .reverse()
      .slice(0, 50)
      .map(
        (l) => `
    <tr>
      <td>${fmtDate(l.date)}</td>
      <td>${capitalize(l.habit)}</td>
      <td><span class="badge-status bs-${l.status}">${capitalize(l.status)}</span></td>
      <td>${escapeHtml(l.note || "—")}</td>
    </tr>`
      )
      .join("");

  const exportBtn = document.getElementById("exportHistoryBtn");
  if (exportBtn)
    exportBtn.addEventListener("click", () => {
      exportLogsCsv(data);
      showToast("✓ Exported CSV.");
    });

  const filter = document.getElementById("relapseFilter");
  const renderRelapseList = (habitFilter) => {
    const rl = document.getElementById("relapseList");
    if (!rl) return;
    let reps = data.logs.filter((l) => l.status === "relapse");
    if (habitFilter && habitFilter !== "all") reps = reps.filter((l) => l.habit === habitFilter);
    rl.innerHTML = reps.length
      ? [...reps]
          .reverse()
          .map(
            (r) => `
          <div class="relapse-item">
            <div class="ri-head">
              <span class="ri-habit">⚠ ${capitalize(r.habit)}</span>
              <span class="ri-date">${fmtDate(r.date)}</span>
            </div>
            <div class="ri-note">${escapeHtml(r.note || "No note.")}</div>
          </div>`
          )
          .join("")
      : '<p style="font-family:var(--font-mono);font-size:0.76rem;color:var(--neon)">// No relapses in this filter. ✓</p>';
  };
  renderRelapseList("all");
  if (filter) filter.addEventListener("change", () => renderRelapseList(filter.value));

  const ACHS = [
    { id: "first_day", icon: "🌱", name: "First Step", desc: "Logged first clean day" },
    { id: "week_warrior", icon: "⚔️", name: "Week Warrior", desc: "7-day clean streak" },
    { id: "smoke_free", icon: "🫁", name: "Smoke Free", desc: "18+ days without smoking" },
    { id: "sugar_slayer", icon: "🍬", name: "Sugar Slayer", desc: "10-day sugar-free streak" },
    { id: "detox_master", icon: "📵", name: "Detox Master", desc: "30-day scrolling detox" },
    { id: "comeback", icon: "💪", name: "Comeback Kid", desc: "Bounced back after relapse" }
  ];
  const ac = document.getElementById("achievementsList");
  if (ac)
    ac.innerHTML = ACHS.map(
      (a) => `
    <div class="achievement ${data.achievements.includes(a.id) ? "earned" : "locked"}">
      <div class="ach-icon">${a.icon}</div>
      <div>
        <div class="ach-name">${a.name} ${data.achievements.includes(a.id) ? "✓" : "⋯"}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>
    </div>`
    ).join("");

  renderProgressPageBars(data);
  renderQuote();
}

function renderProgressPageBars(data) {
  const items = document.querySelectorAll(".progress-page .progress-item");
  const map = [
    { hid: "scrolling", label: "📵 Quit Scrolling" },
    { hid: "sugar", label: "🍬 Quit Sugar" },
    { hid: "smoking", label: "🚭 Quit Smoking" }
  ];
  items.forEach((item, i) => {
    const m = map[i];
    if (!m) return;
    const p = data.habits[m.hid].progress;
    const pctEl = item.querySelector(".pi-pct");
    const fill = item.querySelector(".progress-fill");
    if (pctEl) pctEl.textContent = p + "%";
    if (fill) fill.dataset.pct = p;
  });
  document.querySelectorAll(".progress-page .progress-fill").forEach((fill) => {
    const pct = fill.dataset.pct || 0;
    fill.style.width = "0%";
    setTimeout(() => {
      fill.style.width = pct + "%";
    }, 300);
  });
}

/* ============================
   CONTACT
   ============================ */
function initContact() {
  const f = document.getElementById("contactForm");
  if (f)
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("✓ Message saved locally (demo).");
      f.reset();
    });
}

/* ============================
   LOGOUT
   ============================ */
function initLogout() {
  const b = document.getElementById("logoutBtn");
  if (b)
    b.addEventListener("click", async (e) => {
      e.preventDefault();
      await QHData.signOut();
      location.href = "index.html";
    });
}

/* ============================
   TOAST
   ============================ */
function showToast(msg) {
  let t = document.getElementById("globalToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "globalToast";
    Object.assign(t.style, {
      position: "fixed",
      bottom: "28px",
      right: "28px",
      zIndex: "9999",
      background: "var(--bg-raised)",
      border: "1px solid rgba(0,255,136,0.2)",
      color: "var(--neon)",
      padding: "12px 20px",
      borderRadius: "6px",
      fontFamily: "var(--font-mono)",
      fontSize: "0.76rem",
      letterSpacing: "0.04em",
      boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
      transform: "translateY(80px)",
      opacity: "0",
      transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)"
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => {
    t.style.transform = "translateY(0)";
    t.style.opacity = "1";
  });
  setTimeout(() => {
    t.style.transform = "translateY(80px)";
    t.style.opacity = "0";
  }, 3400);
}

/* ============================
   COUNTERS
   ============================ */
function initCounters() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target,
          target = parseInt(el.dataset.target, 10),
          suffix = el.dataset.suffix || "";
        let c = 0;
        const step = Math.max(1, Math.ceil(target / 60));
        const t = setInterval(() => {
          c = Math.min(c + step, target);
          el.textContent = c.toLocaleString() + suffix;
          if (c >= target) clearInterval(t);
        }, 20);
        io.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll(".stat-num[data-target]").forEach((el) => io.observe(el));
}

/* ============================
   INIT
   ============================ */
document.addEventListener("DOMContentLoaded", async () => {
  if (typeof QHData === "undefined") {
    console.error("QHData missing — load app-data.js");
    return;
  }

  initCursor();
  initNavbar();
  initReveal();
  await initAuth();
  await initDashboard();
  await initProgress();
  initContact();
  initLogout();
  const rq = document.getElementById("refreshQuote");
  if (rq) rq.addEventListener("click", renderQuote);
  initCounters();
});
