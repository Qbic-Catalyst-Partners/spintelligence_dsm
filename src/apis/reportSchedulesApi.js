import apiConfig from "./apiConfig";

export const fetchReportSchedulesAPI = async () => {
  const response = await apiConfig.get("/reports/schedules", {}, {
    skipGlobalErrorModal: true,
    skipGlobalSuccessModal: true,
  });
  return response.data?.schedules || [];
};

export const saveReportScheduleAPI = async ({ schedule, mailPayload, editing = false }) => {
  const endpoint = editing
    ? `/reports/schedules/${encodeURIComponent(schedule.id)}`
    : "/reports/schedules";
  const method = editing ? apiConfig.put : apiConfig.post;
  const response = await method(endpoint, { schedule, mailPayload }, {
    skipGlobalErrorModal: true,
    skipGlobalSuccessModal: true,
  });
  return response.data?.schedule;
};

export const toggleReportScheduleAPI = async (scheduleId, active) => {
  const response = await apiConfig.patch(
    `/reports/schedules/${encodeURIComponent(scheduleId)}/status`,
    { active },
    {
      skipGlobalErrorModal: true,
      skipGlobalSuccessModal: true,
    }
  );
  return response.data?.schedule;
};

export const deleteReportScheduleAPI = async (scheduleId) => {
  const response = await apiConfig.delete(
    `/reports/schedules/${encodeURIComponent(scheduleId)}`,
    {},
    {
      skipGlobalErrorModal: true,
      skipGlobalSuccessModal: true,
    }
  );
  return response.data;
};

export const sendStoredReportScheduleAPI = async (scheduleId, mailPayload) => {
  const response = await apiConfig.post(
    `/reports/schedules/${encodeURIComponent(scheduleId)}/send`,
    mailPayload ? { mailPayload } : {},
    {
      skipGlobalErrorModal: true,
      skipGlobalSuccessModal: true,
    }
  );
  return response.data;
};
