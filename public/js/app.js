import { S, isAdmin, isSuper } from "./state.js";
import { esc } from "./util.js";
import { viewHistory, viewMatrix } from "./views-public.js";
import { viewRandomize, viewData, viewUsers } from "./views-admin.js";
import { initActions, initRz, onClick, onSubmit, onInput, onChange, toast } from "./actions.js";

const root = document.getElementById("app");

const VIEWS = [
  { id: "history", label: "Riwayat", ok: () => true },
  { id: "matrix", label: "Matriks", ok: () => true },
  { id: "randomize", label: "Acak peran", ok: isAdmin },
  { id: "data", label: "Kelola data", ok: isAdmin },
  { id: "users", label: "Pengguna", ok: isSuper },
];

function currentView() {
  const v = VIEWS.find((x) => x.id === S.view);
  return v && v.ok() ? v.id : "history";
}

function render() {
  if (!S.data) return;
  const view = currentView();
  S.view = view;
  if (view === "randomize" && !S.rz) initRz(null);
  const cfg = S.data.config;
  document.title = "Rotake" + (cfg.title ? " · " + cfg.title : "");
  const local = S.store.mode === "local";

  const who = S.auth
    ? `<span>${esc(S.auth.name)}</span><span class="badge role">${S.auth.role === "superadmin" ? "Super Admin" : S.auth.role === "admin" ? "Admin" : "Tanpa akses"}</span>
       <button class="btn sm" data-act="logout">Keluar</button>`
    : local
      ? `<span class="badge">Tamu (hanya melihat)</span><button class="btn sm" data-act="login" data-role="admin">Demo: masuk Admin</button><button class="btn sm" data-act="login" data-role="superadmin">Demo: masuk Super Admin</button>`
      : `<span class="badge">Tamu (hanya melihat)</span><button class="btn sm primary" data-act="login">Masuk dengan Google</button>`;

  const body = { history: viewHistory, matrix: viewMatrix, randomize: viewRandomize, data: viewData, users: viewUsers }[view](S);
  const y = window.scrollY;
  root.innerHTML = `<div class="wrap">
    <header class="top">
      <div class="brand"><img src="logo.svg" alt="" width="40" height="40"><div><h1>Rotake</h1><p>${esc([cfg.title, cfg.subtitle].filter(Boolean).join(" · ") || "Rotasi peran kelompok")}</p></div></div>
      <div class="who">${local ? '<span class="badge demo" title="Data tersimpan di browser ini saja">Mode demo lokal</span>' : ""}${who}</div>
    </header>
    ${S.auth && !S.auth.role ? `<div class="alert warn">Akun <b>${esc(S.auth.email)}</b> belum memiliki akses admin. Minta super admin menambahkan email ini. Sementara itu Anda hanya dapat melihat.</div>` : ""}
    <nav class="tabs" aria-label="Menu">${VIEWS.filter((v) => v.ok()).map((v) => `<button data-act="goto" data-view="${v.id}" ${v.id === view ? 'aria-current="page"' : ""}>${v.label}</button>`).join("")}</nav>
    <main>${body}</main>
    <footer class="foot">© 2026 A Afif Mauludi · Rotake</footer>
  </div>`;
  window.scrollTo({ top: y });
}

function syncHash(initial) {
  const v = location.hash.replace(/^#\/?/, "");
  // hashchange yang dipicu klik tab sudah dirender oleh aksi `goto`; jangan render ulang (menghilangkan input file dll.)
  if (initial !== true && (v === S.view || !VIEWS.some((x) => x.id === v))) return;
  if (VIEWS.some((x) => x.id === v)) { S.view = v; if (v !== "history") S.filterGroup = ""; }
  render();
}

let unsubAdmins = null;
function watchAdmins() {
  if (isSuper() && !unsubAdmins) {
    unsubAdmins = S.store.onAdmins((list) => { S.admins = list; render(); });
  } else if (!isSuper() && unsubAdmins) { unsubAdmins(); unsubAdmins = null; S.admins = undefined; }
}

async function boot() {
  initActions(render);
  let store;
  try {
    const { firebaseConfig } = await import("./firebase-config.js");
    store = firebaseConfig
      ? await (await import("./store-firebase.js")).createFirebaseStore(firebaseConfig)
      : (await import("./store-local.js")).createLocalStore();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="wrap"><div class="alert err" style="margin-top:24px"><b>Gagal memulai.</b> ${esc(e.message)}<br>Periksa konfigurasi Firebase di <code>js/firebase-config.js</code> dan koneksi internet.</div></div>`;
    return;
  }
  S.store = store;
  store.onAuth((a) => {
    const had = S.auth?.role;
    S.auth = a;
    if (had !== a?.role) S.rz = S.rz && isAdmin() ? S.rz : null;
    watchAdmins(); render();
  });
  store.onData((d) => { S.data = d; render(); });

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("toggle", (e) => {
    const gid = e.target.dataset?.gid;
    if (gid && e.target.open) S.openGroup = gid;
  }, true);
  window.addEventListener("hashchange", () => syncHash());
  syncHash(true);
}
boot();
