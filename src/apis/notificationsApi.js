import apiConfig from "./apiConfig";

const notificationBaseCandidates = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_NOTIFICATIONS_API_BASE,
      "/notifications",
      "/operator-tickets/notifications",
      "/ticket-notifications",
      "/api/notifications",
    ]
      .map((value) => String(value || "").trim().replace(/\/+$/, ""))
      .filter(Boolean)
  )
);

const requestNotificationsApi = async (path = "", payload = {}, method = "get") => {
  let lastError = null;

  for (const base of notificationBaseCandidates) {
    try {
      const url = `${base}${path}`;
      let response;

      if (method === "post") {
        response = await apiConfig.post(url, payload, {
          skipGlobalErrorModal: true,
          skipGlobalSuccessModal: true,
        });
      } else if (method === "patch") {
        response = await apiConfig.patch(url, payload, {
          skipGlobalErrorModal: true,
          skipGlobalSuccessModal: true,
        });
      } else {
        response = await apiConfig.get(url, payload, {
          skipGlobalErrorModal: true,
          skipGlobalSuccessModal: true,
        });
      }

      return response?.data || {};
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Notifications API route not found");
};

export const fetchNotificationsApi = (params = {}) =>
  requestNotificationsApi("", params);

export const markNotificationReadApi = ({ source, id }) =>
  requestNotificationsApi(`/${encodeURIComponent(source)}/${encodeURIComponent(id)}/read`, {}, "patch");

export const markAllNotificationsReadApi = (payload = {}) =>
  requestNotificationsApi("/read-all", payload, "patch");

export const createTestNotificationApi = (payload = {}) =>
  requestNotificationsApi("/test", payload, "post");
