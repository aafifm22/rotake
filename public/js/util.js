export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const uid = (p = "id") =>
  p + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export const slug = (s) =>
  String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  if (isNaN(d)) return s;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

export const fmtDateShort = (s) => {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  if (isNaN(d)) return s;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

export const sortSessions = (sessions) => [...sessions].sort((a, b) => a.number - b.number);
export const sortGroups = (groups) => [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export const DEFAULT_COLORS = ["#2563eb", "#d97706", "#059669", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#db2777"];
