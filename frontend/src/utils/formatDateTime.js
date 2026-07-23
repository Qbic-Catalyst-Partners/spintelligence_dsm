// Single source of truth for how timestamps are displayed across the app:
// "DD Mon YYYY, hh:mm AM/PM" in IST, e.g. "22 Jul 2026, 02:35 PM".
export const formatDateTime = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// Just the date portion, same style: "22 Jul 2026".
export const formatDateOnly = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Just the time portion, same style: "02:35 PM".
export const formatTimeOnly = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
