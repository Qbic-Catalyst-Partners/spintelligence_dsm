const SUCCESS_EVENT_NAME = "global-api-success";
const SUCCESS_NOTIFICATION_ROUTE_UNAVAILABLE_KEY = "success_notification_route_unavailable";
let successNotificationRouteUnavailable = false;

const getNotificationBaseUrlCandidates = () => {
    const apiBaseUrl = String(process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
    const notificationBaseUrl = String(process.env.NEXT_PUBLIC_NOTIFICATIONS_API_BASE || "").trim().replace(/\/+$/, "");
    const pathCandidates = [
        "/notifications",
        "/operator-tickets/notifications",
        "/ticket-notifications",
        "/api/notifications",
    ];

    if (notificationBaseUrl) {
        const configuredUrl = notificationBaseUrl.startsWith("http")
            ? notificationBaseUrl
            : `${apiBaseUrl}${notificationBaseUrl.startsWith("/") ? notificationBaseUrl : `/${notificationBaseUrl}`}`;
        return [configuredUrl];
    }

    return pathCandidates.map((path) => `${apiBaseUrl}${path}`);
};

const createSuccessNotification = ({ message, status } = {}) => {
    if (typeof window === "undefined") return;
    if (
        successNotificationRouteUnavailable ||
        window.sessionStorage.getItem(SUCCESS_NOTIFICATION_ROUTE_UNAVAILABLE_KEY) === "true"
    ) {
        return;
    }

    const token = window.sessionStorage.getItem("token") || window.localStorage.getItem("token") || "";
    const baseUrls = getNotificationBaseUrlCandidates();

    if (!token || !baseUrls.length) return;

    const requestBody = JSON.stringify({
        title: message || "Data Submitted",
        body: status ? `Action completed successfully with status ${status}.` : "Action completed successfully.",
    });

    const tryCreate = async () => {
        let lastError = null;

        for (const baseUrl of baseUrls) {
            try {
                const response = await fetch(`${baseUrl}/test`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: requestBody,
                });

                if (response.ok) {
                    window.dispatchEvent(new CustomEvent("admin-notification-created"));
                    return;
                }

                lastError = new Error(`Notification request failed with status ${response.status}`);
                if (response.status !== 404) {
                    throw lastError;
                }
            } catch (error) {
                lastError = error;
                throw error;
            }
        }

        const triedUrls = baseUrls.map((baseUrl) => `${baseUrl}/test`).join(", ");
        const error = lastError || new Error("Notification test route was not found.");
        error.triedUrls = triedUrls;
        error.allRoutesReturnedNotFound = Boolean(lastError) && baseUrls.length > 0;
        throw error;
    };

    tryCreate().catch((error) => {
        if (error?.allRoutesReturnedNotFound) {
            successNotificationRouteUnavailable = true;
            window.sessionStorage.setItem(SUCCESS_NOTIFICATION_ROUTE_UNAVAILABLE_KEY, "true");
            return;
        }
        console.warn("Success notification could not be created.", {
            message: error?.message,
            triedUrls: error?.triedUrls,
            error,
        });
    });
};

export const emitGlobalSuccessModal = ({ message, status, skipNotification } = {}) => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
        new CustomEvent(SUCCESS_EVENT_NAME, {
            detail: {
                message,
                status,
            },
        })
    );

    if (!skipNotification) {
        createSuccessNotification({ message, status });
    }
};

export const subscribeToGlobalSuccessModal = (handler) => {
    if (typeof window === "undefined") return () => {};

    const listener = (event) => {
        handler(event.detail || {});
    };

    window.addEventListener(SUCCESS_EVENT_NAME, listener);
    return () => window.removeEventListener(SUCCESS_EVENT_NAME, listener);
};
