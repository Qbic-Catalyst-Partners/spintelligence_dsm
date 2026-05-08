import apiConfig from "./apiConfig";

const localReportScheduleMailEndpoint = "/api/reports/schedule-email";

const reportScheduleMailEndpoints = [
  "/reports/schedule-email",
  "/reports/schedules/email",
  "/scheduled-reports/email",
  "/mail/report-schedule",
];

const postLocalScheduleMail = async (payload) => {
  const response = await fetch(localReportScheduleMailEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || "Failed to send scheduled report email.");
  }

  return data;
};

export const sendReportScheduleMail = async (payload) => {
  let lastError = null;

  for (const endpoint of reportScheduleMailEndpoints) {
    try {
      const response = await apiConfig.post(endpoint, payload, {
        skipGlobalErrorModal: true,
        skipGlobalSuccessModal: true,
      });

      return response.data;
    } catch (error) {
      lastError = error;

      if (!error.response || ![404, 405].includes(error.response.status)) {
        break;
      }
    }
  }

  if (typeof window !== "undefined") {
    return postLocalScheduleMail(payload);
  }

  throw new Error(
    lastError?.response?.data?.message ||
      lastError?.response?.data?.error ||
      "Failed to send scheduled report email."
  );
};
