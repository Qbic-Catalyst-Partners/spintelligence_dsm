import apiConfig from "./apiConfig";

const ACTIVITY_LOG_ENDPOINTS = ["/activity-logs", "/activity-log", "/audit/activity-log"];

const requestWithFallbacks = async (path = "", params = {}) => {
  let lastError = null;

  for (const endpoint of ACTIVITY_LOG_ENDPOINTS) {
    try {
      const response = await apiConfig.get(`${endpoint}${path}`, params, {
        skipGlobalErrorModal: true,
      });
      return response?.data || {};
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Activity log API route not found");
};

const unwrapLogs = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.logs)) return data.logs;
  if (Array.isArray(data?.activity_timeline)) return data.activity_timeline;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.activity_logs)) return data.activity_logs;
  return [];
};

const getFirstArray = (source, keys = []) => {
  for (const key of keys) {
    if (Array.isArray(source?.[key])) return source[key];
  }
  return [];
};

export const fetchActivityLogsApi = async (params = {}) => {
  const data = await requestWithFallbacks("", params);
  return {
    logs: unwrapLogs(data),
    pagination: {
      page: Number(data?.pagination?.page) || Number(params.page) || 1,
      limit: Number(data?.pagination?.limit) || Number(params.limit) || 20,
      total: Number(data?.pagination?.total) || 0,
    },
  };
};

export const fetchActivityLogFiltersApi = async () => {
  const data = await requestWithFallbacks("/filters");
  const filters = data?.filters && typeof data.filters === "object" ? data.filters : {};

  return {
    modules: getFirstArray(data, ["modules", "departments"]),
    notebook_types: getFirstArray(data, ["notebook_types", "notebookTypes", "notebooks"]),
    notebooks: getFirstArray(data, ["notebooks", "notebook_types", "notebookTypes"]),
    sub_departments: [
      ...getFirstArray(data, ["sub_departments", "subDepartments", "sub_department_names", "subDepartmentNames"]),
      ...getFirstArray(filters, ["sub_departments", "subDepartments", "sub_department_names", "subDepartmentNames"]),
    ],
    actions: [
      ...getFirstArray(data, ["actions", "activity_types", "activityTypes"]),
      ...getFirstArray(filters, ["actions", "activity_types", "activityTypes"]),
    ],
    users: [
      ...getFirstArray(data, ["users", "user_list", "userList", "operators", "employees"]),
      ...getFirstArray(filters, ["users", "user_list", "userList", "operators", "employees"]),
    ],
  };
};

export const createActivityLogApi = (payload) =>
  apiConfig.post("/activity-log", payload, {
    skipGlobalSuccessModal: true,
  });
