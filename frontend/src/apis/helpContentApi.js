import apiConfig from "./apiConfig";

const unwrapRows = (data, keys) => {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
};

const requestWithFallbacks = async (candidates, params = {}) => {
  let lastError = null;

  for (const endpoint of candidates) {
    try {
      const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
      return response?.data || {};
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) throw error;
    }
  }

  throw lastError || new Error("Help content API route not found");
};

export const fetchGlossaryEntriesApi = async (params = {}) => {
  const data = await requestWithFallbacks(["/glossary", "/help/glossary"], params);
  return unwrapRows(data, ["glossary", "entries", "glossary_entries"]);
};

export const createGlossaryEntryApi = (payload) => apiConfig.post("/glossary", payload);
export const updateGlossaryEntryApi = (id, payload) => apiConfig.patch(`/glossary/${id}`, payload);
export const deleteGlossaryEntryApi = (id) => apiConfig.delete(`/glossary/${id}`);

export const fetchFaqEntriesApi = async (params = {}) => {
  const data = await requestWithFallbacks(["/faqs", "/help/faqs"], params);
  return unwrapRows(data, ["faqs", "faq_entries", "entries"]);
};

export const createFaqEntryApi = (payload) => apiConfig.post("/faqs", payload);
export const updateFaqEntryApi = (id, payload) => apiConfig.patch(`/faqs/${id}`, payload);
export const deleteFaqEntryApi = (id) => apiConfig.delete(`/faqs/${id}`);

export const fetchUserGuideEntriesApi = async (params = {}) => {
  const data = await requestWithFallbacks(["/user-guide", "/help/user-guide"], params);
  return unwrapRows(data, ["userGuide", "user_guide", "guides", "entries"]);
};

export const fetchUserGuideEntryApi = async (slug) => {
  const safeSlug = encodeURIComponent(slug);
  return requestWithFallbacks([`/user-guide/${safeSlug}`, `/help/user-guide/${safeSlug}`]);
};

export const createUserGuideEntryApi = (payload) => apiConfig.post("/user-guide", payload);
export const updateUserGuideEntryApi = (id, payload) => apiConfig.patch(`/user-guide/${id}`, payload);
export const deleteUserGuideEntryApi = (id) => apiConfig.delete(`/user-guide/${id}`);

export const fetchActivityLogEntriesApi = async (params = {}) => {
  const data = await requestWithFallbacks(
    ["/activity-log", "/activity-logs", "/help/activity-log", "/audit/activity-log"],
    params
  );
  return unwrapRows(data, ["activity", "activity_logs", "logs", "history"]);
};
