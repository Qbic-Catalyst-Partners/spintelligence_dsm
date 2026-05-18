import apiConfig from "@/apis/apiConfig";

export const fetchBuilderOptions = (params = {}) =>
  apiConfig.get("/api/dashboard/builder/options", params, { skipGlobalErrorModal: true });

export const fetchBuilderOptionsMatch = (params = {}) =>
  apiConfig.get("/api/dashboard/builder/options/match", params, { skipGlobalErrorModal: true });

export const fetchUserWidgets = (userId) =>
  apiConfig.get(`/api/dashboard/builder/widgets/${userId}`);

export const saveUserWidgets = (userId, widgets) =>
  apiConfig.post(`/api/dashboard/builder/widgets/${userId}`, { widgets });

export const fetchMyWidgets = () =>
  apiConfig.get("/api/dashboard/my-widgets");

export const saveMyWidgets = (widgets) =>
  apiConfig.post("/api/dashboard/my-widgets", { widgets });

export const fetchBuilderData = (params = {}) =>
  apiConfig.get("/api/dashboard/builder/data", params);
