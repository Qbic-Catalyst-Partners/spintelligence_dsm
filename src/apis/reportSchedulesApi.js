import { sendReportScheduleMail } from "./reportMailApi";

const reportSchedulesStorageKey = "spintelligence.reportSchedules";

const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

const readLocalSchedules = () => {
  if (!canUseStorage()) return [];

  try {
    const value = window.localStorage.getItem(reportSchedulesStorageKey);
    const schedules = JSON.parse(value || "[]");
    return Array.isArray(schedules) ? schedules : [];
  } catch {
    return [];
  }
};

const writeLocalSchedules = (schedules) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(reportSchedulesStorageKey, JSON.stringify(schedules));
};

export const persistReportSchedulesAPI = async (schedules) => {
  writeLocalSchedules(Array.isArray(schedules) ? schedules : []);
};

export const fetchReportSchedulesAPI = async () => readLocalSchedules();

export const saveReportScheduleAPI = async ({ schedule, editing = false }) => {
  const schedules = readLocalSchedules();
  const savedSchedule = {
    ...schedule,
    updatedAt: new Date().toISOString(),
  };
  const nextSchedules = editing
    ? schedules.map((scheduleItem) => (scheduleItem.id === savedSchedule.id ? savedSchedule : scheduleItem))
    : [savedSchedule, ...schedules.filter((scheduleItem) => scheduleItem.id !== savedSchedule.id)];

  writeLocalSchedules(nextSchedules);
  return savedSchedule;
};

export const toggleReportScheduleAPI = async (scheduleId, active) => {
  const schedules = readLocalSchedules();
  const updatedSchedule = schedules.find((schedule) => schedule.id === scheduleId);
  const nextSchedule = updatedSchedule
    ? { ...updatedSchedule, active, updatedAt: new Date().toISOString() }
    : null;

  writeLocalSchedules(
    schedules.map((schedule) => (schedule.id === scheduleId ? nextSchedule : schedule))
  );

  return nextSchedule;
};

export const deleteReportScheduleAPI = async (scheduleId) => {
  writeLocalSchedules(readLocalSchedules().filter((schedule) => schedule.id !== scheduleId));
  return { deleted: true };
};

export const sendStoredReportScheduleAPI = async (scheduleId, mailPayload) => {
  if (!mailPayload) {
    throw new Error("mailPayload is required to send a scheduled report.");
  }

  return sendReportScheduleMail(mailPayload);
};
