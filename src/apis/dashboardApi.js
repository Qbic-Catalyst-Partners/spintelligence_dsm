const getBrowserToken = () =>
  typeof window !== "undefined"
    ? window.sessionStorage.getItem("token") || window.localStorage.getItem("token") || ""
    : "";

const buildQuery = (params = {}) => {
  const qp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v || "").trim() !== "") qp.set(k, String(v));
  });
  const qs = qp.toString();
  return qs ? `?${qs}` : "";
};

export const fetchOptionsCascade = async ({ department = "", sub_department = "", notebook = "" } = {}) => {
  const token = getBrowserToken();
  const qs = buildQuery({ department, sub_department, notebook });
  const res = await fetch(`/api/dashboard/builder/options/cascade${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const data = await (async () => {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    return res.json().catch(() => null);
  })();

  if (!res.ok) throw new Error(data?.message || "Failed to fetch dashboard options");

  return data;
};

export const fetchOptionsMatch = async ({ department = "", input_screen = "", sub_department = "" } = {}) => {
  const token = getBrowserToken();
  const qs = buildQuery({ department, input_screen, sub_department });
  const res = await fetch(`/api/dashboard/builder/options/match${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const data = await (async () => {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    return res.json().catch(() => null);
  })();

  if (!res.ok) throw new Error(data?.message || "Failed to fetch dashboard match options");
  return data;
};

export default {
  fetchOptionsCascade,
};
