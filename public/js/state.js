export const S = {
  store: null,
  data: null,
  auth: null,
  view: "history",
  filterGroup: "",
  rz: null,
  openGroup: null,
  importPreview: null,
  admins: undefined, // undefined = belum dimuat, null = tidak boleh dibaca
  busy: false,
};
export const isAdmin = () => !!S.auth && (S.auth.role === "admin" || S.auth.role === "superadmin");
export const isSuper = () => !!S.auth && S.auth.role === "superadmin";
