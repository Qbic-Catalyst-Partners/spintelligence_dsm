// Extracts zero-padded day/month/2-digit-year in IST via formatToParts rather
// than toLocaleDateString's "en-US" slash format, which renders mm/dd/yy -
// the opposite field order from what dd/mm/yy actually means.
const getIstDateParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.day}/${byType.month}/${byType.year}`;
};

// Single source of truth for how timestamps are displayed across the app:
// "dd/mm/yy, hh:mm AM/PM" in IST, e.g. "22/07/26, 02:35 PM".
export const formatDateTime = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const time = date.toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${getIstDateParts(date)}, ${time}`;
};

// Just the date portion, same style: "22/07/26".
export const formatDateOnly = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return getIstDateParts(date);
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
