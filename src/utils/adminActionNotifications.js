import { createTestNotificationApi } from "@/apis/notificationsApi";

export const notifyAdminAction = ({ title, body }) => {
  if (!title) return Promise.resolve(null);

  return createTestNotificationApi({
    title,
    body: body || "Admin action completed successfully.",
  })
    .then((result) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("admin-notification-created"));
      }
      return result;
    })
    .catch((error) => {
      if (typeof window !== "undefined") {
        console.warn("Admin notification could not be created.", error);
      }
      return null;
    });
};
