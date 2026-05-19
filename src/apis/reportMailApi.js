import apiConfig from "./apiConfig";

const localReportScheduleMailEndpoint = "/api/reportSchedules/schedule-email";

const reportScheduleMailEndpoints = [
  "/reports/schedule-email",
  "/reports/schedules/email",
  "/scheduled-reports/email",
  "/mail/report-schedule",
];

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const normalizeReportScheduleMailPayload = (payload = {}) => {
  if (!isObject(payload)) {
    return {
      schedule: {},
      mailPayload: {
        rows: [],
      },
    };
  }

  const report = isObject(payload.report) ? payload.report : {};
  const mailPayload = isObject(payload.mailPayload) ? payload.mailPayload : {};
  const rows = Array.isArray(mailPayload.rows)
    ? mailPayload.rows
    : Array.isArray(report.rows)
      ? report.rows
      : Array.isArray(payload.rows)
        ? payload.rows
        : [];

  return {
    schedule: isObject(payload.schedule) ? payload.schedule : isObject(mailPayload.schedule) ? mailPayload.schedule : {},
    mailPayload: {
      from: mailPayload.from ?? payload.from,
      to: mailPayload.to ?? payload.to ?? payload.receiverEmail,
      subject: mailPayload.subject ?? payload.subject,
      department: mailPayload.department ?? report.department ?? payload.department,
      subDepartment: mailPayload.subDepartment ?? report.subDepartment ?? payload.subDepartment,
      reportType: mailPayload.reportType ?? report.reportType ?? payload.reportType,
      dateRange: mailPayload.dateRange ?? report.dateRange ?? payload.dateRange,
      fields: mailPayload.fields ?? report.fields ?? payload.fields,
      rows,
      totalRows: mailPayload.totalRows ?? report.totalRows ?? payload.totalRows ?? rows.length,
      html: mailPayload.html ?? payload.html,
      recipientProfiles: mailPayload.recipientProfiles ?? payload.recipientProfiles,
      attachments: mailPayload.attachments ?? payload.attachments,
    },
  };
};

const postLocalScheduleMail = async (payload) => {
  const response = await fetch(localReportScheduleMailEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizeReportScheduleMailPayload(payload)),
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
  const requestPayload = normalizeReportScheduleMailPayload(payload);

  if (typeof window !== "undefined") {
    return postLocalScheduleMail(requestPayload);
  }

  let lastError = null;

  for (const endpoint of reportScheduleMailEndpoints) {
    try {
      const response = await apiConfig.post(endpoint, requestPayload, {
        skipGlobalErrorModal: true,
        skipGlobalSuccessModal: true,
      });

      return response.data;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    lastError?.response?.data?.message ||
      lastError?.response?.data?.error ||
      "Failed to send scheduled report email."
  );
};
