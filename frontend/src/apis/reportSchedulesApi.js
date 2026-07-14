import apiConfig from "./apiConfig";

const scheduleRequestTimeoutMs = 20000;

const getScheduleId = (schedule) =>
  String(schedule?.id || schedule?._id || schedule?.scheduleId || schedule?.schedule_id || "");

const normalizeScheduleList = (response) => {
  const value = response?.data ?? response;
  const schedules =
    value?.schedules ||
    value?.data?.schedules ||
    value?.data ||
    value?.items ||
    value?.rows ||
    value;

  return Array.isArray(schedules) ? schedules : [];
};

export const fetchReportSchedulesAPI = async (ownerKey = "") => {
  const response = await apiConfig.get(
    "/reports/schedules",
    ownerKey ? { ownerKey } : {},
    {
      skipGlobalErrorModal: true,
      timeout: scheduleRequestTimeoutMs,
    }
  );

  return normalizeScheduleList(response);
};

export const saveReportScheduleAPI = async ({ schedule, mailPayload, editing = false, ownerKey = "" }) => {
  const payload = {
    schedule: {
      ...schedule,
      ownerKey: schedule?.ownerKey || ownerKey || undefined,
    },
    mailPayload,
  };
  const scheduleId = getScheduleId(schedule);
  const response =
    editing && scheduleId
      ? await apiConfig.put(`/reports/schedules/${scheduleId}`, payload, {
          skipGlobalErrorModal: true,
          skipGlobalSuccessModal: true,
          timeout: scheduleRequestTimeoutMs,
        })
      : await apiConfig.post("/reports/schedules", payload, {
          skipGlobalErrorModal: true,
          skipGlobalSuccessModal: true,
          timeout: scheduleRequestTimeoutMs,
        });

  return response.data || { schedule };
};

export const toggleReportScheduleAPI = async (scheduleId, active) => {
  const response = await apiConfig.patch(
    `/reports/schedules/${scheduleId}/status`,
    { active },
    {
      skipGlobalErrorModal: true,
      skipGlobalSuccessModal: true,
      timeout: scheduleRequestTimeoutMs,
    }
  );

  return response.data;
};

export const deleteReportScheduleAPI = async (scheduleId) => {
  const response = await apiConfig.delete(
    `/reports/schedules/${scheduleId}`,
    {},
    {
      skipGlobalErrorModal: true,
      skipGlobalSuccessModal: true,
      timeout: scheduleRequestTimeoutMs,
    }
  );

  return response.data || { deleted: true };
};

export const sendStoredReportScheduleAPI = async (scheduleId, mailPayload) => {
  if (!scheduleId) {
    throw new Error("scheduleId is required to send a scheduled report.");
  }

  if (!mailPayload) {
    throw new Error("mailPayload is required to send a scheduled report.");
  }

  const response = await apiConfig.post(`/reports/schedules/${scheduleId}/send`, mailPayload, {
    skipGlobalErrorModal: true,
    skipGlobalSuccessModal: true,
    timeout: scheduleRequestTimeoutMs,
  });

  return response.data;
};
