import apiConfig from "@/apis/apiConfig";

const getBuilderPath = (path) => `/api/dashboard/builder/${String(path || "").replace(/^\/+/, "")}`;
const getDashBuilderPath = (path) => `/api/dashboard/dashbuilder/${String(path || "").replace(/^\/+/, "")}`;

const withBuilderFallback = async (request) => {
  try {
    return await request("builder");
  } catch (error) {
    if (error?.response?.status !== 404) throw error;
    return request("dashbuilder");
  }
};

const getBuilderRoute = (path, params = {}, requestOptions = {}) =>
  withBuilderFallback((variant) =>
    apiConfig.get(
      variant === "builder" ? getBuilderPath(path) : getDashBuilderPath(path),
      params,
      requestOptions
    )
  );

const postBuilderRoute = (path, data = {}, requestOptions = {}) =>
  withBuilderFallback((variant) =>
    apiConfig.post(
      variant === "builder" ? getBuilderPath(path) : getDashBuilderPath(path),
      data,
      requestOptions
    )
  );

const patchBuilderRoute = (path, data = {}, requestOptions = {}) =>
  withBuilderFallback((variant) =>
    apiConfig.patch(
      variant === "builder" ? getBuilderPath(path) : getDashBuilderPath(path),
      data,
      requestOptions
    )
  );

const deleteBuilderRoute = (path, params = {}, requestOptions = {}) =>
  withBuilderFallback((variant) =>
    apiConfig.delete(
      variant === "builder" ? getBuilderPath(path) : getDashBuilderPath(path),
      params,
      requestOptions
    )
  );

export const fetchBuilderOptions = (params = {}, requestOptions = {}) =>
  getBuilderRoute("options", params, { skipGlobalErrorModal: true, ...requestOptions });

export const fetchBuilderOptionsV2 = (params = {}, requestOptions = {}) =>
  getBuilderRoute("options/v2", params, { skipGlobalErrorModal: true, ...requestOptions });

export const fetchBuilderOptionsCascade = (params = {}, requestOptions = {}) =>
  getBuilderRoute("options/cascade", params, { skipGlobalErrorModal: true, ...requestOptions });

export const fetchBuilderOptionsAll = (params = {}, requestOptions = {}) =>
  getBuilderRoute("options/all", params, { skipGlobalErrorModal: true, ...requestOptions });

export const fetchBuilderOptionsMatch = (params = {}, requestOptions = {}) =>
  getBuilderRoute("options/match", params, { skipGlobalErrorModal: true, ...requestOptions });

export const fetchBuilderData = (params = {}, requestOptions = {}) =>
  getBuilderRoute("data", params, requestOptions);

export const fetchUserWidgets = (userId, requestOptions = {}) =>
  getBuilderRoute(`widgets/${encodeURIComponent(String(userId))}`, {}, requestOptions);

export const saveUserWidgets = (userId, widgets, requestOptions = {}) =>
  postBuilderRoute(`widgets/${encodeURIComponent(String(userId))}`, { widgets }, requestOptions);

export const reorderUserWidgets = (userId, widgetIds, requestOptions = {}) =>
  patchBuilderRoute(
    `widgets/${encodeURIComponent(String(userId))}/reorder`,
    { widget_ids: Array.isArray(widgetIds) ? widgetIds : [] },
    requestOptions
  );

export const toggleUserWidget = (userId, widgetId, requestOptions = {}) =>
  patchBuilderRoute(
    `widgets/${encodeURIComponent(String(userId))}/${encodeURIComponent(String(widgetId))}/toggle`,
    {},
    requestOptions
  );

export const deleteUserWidget = (userId, widgetId, requestOptions = {}) =>
  deleteBuilderRoute(
    `widgets/${encodeURIComponent(String(userId))}/${encodeURIComponent(String(widgetId))}`,
    {},
    requestOptions
  );

export const fetchMyWidgets = (requestOptions = {}) =>
  apiConfig.get("/api/dashboard/my-widgets", {}, requestOptions);

export const saveMyWidgets = (widgets, requestOptions = {}) =>
  apiConfig.post("/api/dashboard/my-widgets", { widgets }, requestOptions);

export const fetchMyDashboard = (params = {}, requestOptions = {}) =>
  apiConfig.get("/api/dashboard/my-dashboard", params, requestOptions);

export const fetchMyPage = (pageKey = "default", requestOptions = {}) =>
  apiConfig.get(`/api/dashboard/pages/my/${encodeURIComponent(String(pageKey || "default"))}`, {}, requestOptions);

export const fetchMyPageData = (pageKey = "default", params = {}, requestOptions = {}) =>
  apiConfig.get(
    `/api/dashboard/pages/my/${encodeURIComponent(String(pageKey || "default"))}/data`,
    params,
    requestOptions
  );

export const listMyPages = (requestOptions = {}) =>
  apiConfig.get("/api/dashboard/pages/my", {}, requestOptions);

export const saveMyPage = (pageKey = "default", payload = {}, requestOptions = {}) =>
  apiConfig.post(`/api/dashboard/pages/my/${encodeURIComponent(String(pageKey || "default"))}`, payload, requestOptions);

export const deleteMyPage = (pageKey = "default", requestOptions = {}) =>
  apiConfig.delete(`/api/dashboard/pages/my/${encodeURIComponent(String(pageKey || "default"))}`, {}, requestOptions);

export const assignPageToUser = (userId, pageKey = "default", payload = {}, requestOptions = {}) =>
  apiConfig.post(
    `/api/dashboard/pages/assign/${encodeURIComponent(String(userId))}/${encodeURIComponent(String(pageKey || "default"))}`,
    payload,
    requestOptions
  );
