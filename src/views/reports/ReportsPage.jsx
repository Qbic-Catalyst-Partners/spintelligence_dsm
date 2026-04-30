import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiCalendar,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiDownload,
  FiEdit2,
  FiFilter,
  FiFileText,
  FiPause,
  FiPlus,
  FiSend,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { fetchAutoconerProcessParameters } from "@/apis/autoconer";
import { getCardingProcessParameterEntries } from "@/apis/carding";
import { getMixingProcessParameterEntries } from "@/apis/mixing";
import { fetchSimplexProcessParameterEntries } from "@/apis/simplex";
import { getSpinningProcessParameterEntries } from "@/apis/spinning";
import styles from "@/styles/reports.module.css";

const fetchEndpointRows = async (endpoint, params = {}) => {
  const response = await apiConfig.get(
    endpoint,
    { page: 1, limit: 500, ...params },
    { skipGlobalErrorModal: true }
  );
  return response.data;
};

const reportSources = {
  "Quality Control": {
    Mixing: {
      "Process Parameter": { fetcher: getMixingProcessParameterEntries },
      "Cotton HVI Data Entry": { endpoint: "/mixing/cotton-hvi" },
      "Fibre Data Entry": { endpoint: "/mixing/fibre" },
      "AFIS Data Entry": { endpoint: "/mixing/afis" },
      "Moisture Data Entry": { endpoint: "/mixing/moisture" },
      "Openness Data Entry": { endpoint: "/mixing/openness" },
    },
    "Blow Room": {
      "Blow Room Sync": { fetcher: fetchEndpointRows.bind(null, "/blowroom/sync") },
      "Process Parameter": { fetcher: fetchEndpointRows.bind(null, "/blowroom/header") },
      "BR Waste Study Entry": { fetcher: fetchEndpointRows.bind(null, "/blowroom/br-waste-study") },
      "Drop Test Data Entry": { fetcher: fetchEndpointRows.bind(null, "/blowroom/drop-test") },
    },
    Carding: {
      "Process Parameter": { fetcher: getCardingProcessParameterEntries },
      "Between & Within Card Data Entry": { endpoint: "/carding/between-within-card" },
      "Card Thick Place Entry": { endpoint: "/carding/card-thick-place" },
      "Trials Data Entry Form": { endpoint: "/carding/trials" },
      "Nati Data Entry": { endpoint: "/carding/nati-data" },
      "U% Data Entry": { endpoint: "/carding/uqc" },
      "Card DFK Pressure Checking": { endpoint: "/carding/dfk-pressure" },
    },
    Comber: {
      "Ribbon Lap CV Data Entry": { endpoint: "/comber/lap-cv" },
      "Nati Data Entry": { endpoint: "/comber/nati-data-entry" },
      "U% Data Entry": { endpoint: "/comber/uqc" },
    },
    "Draw Frame": {
      "Yarn CV% Calculation Form": { endpoint: "/drawframe/yarn-cv" },
      "Draw Frame Cots Data Entry": { endpoint: "/drawframe/cots" },
      "U% Data Entry": { endpoint: "/drawframe/uqc" },
      "PP - Breaker Drawing": { endpoint: "/drawframe/header" },
      "PP - Finisher Drawing": { endpoint: "/drawframe/finisher" },
    },
    Simplex: {
      "Process Parameter": { fetcher: fetchSimplexProcessParameterEntries },
      "SMXCots Change Data Entry": { endpoint: "/simplex/SMXCotsChange" },
      "SMX Breaks Study Report": { endpoint: "/simplex/study" },
      "U% Data Entry": { endpoint: "/simplex/uqc" },
    },
    Spinning: {
      "Process Parameter": { fetcher: getSpinningProcessParameterEntries },
      "COTS Checking": { endpoint: "/spinning/cots-checking" },
      "Count Change": { endpoint: "/spinning/count-change" },
      "Ring Frame Log Book": { endpoint: "/spinning/ring-frame" },
      "Speed Checking": { endpoint: "/spinning/speed-checking" },
      "Lycra Missing": { endpoint: "/spinning/lycra-missing" },
      "Bottom Apron Checking": { endpoint: "/spinning/bottom-apron-checking" },
      "Lycra Centering": { endpoint: "/spinning/lycra-centering" },
      "RSM & Lycrasensor Checking Online": { endpoint: "/spinning/rsm-lycra-online" },
      "RSM & Lycrasensor Checking Offline": { endpoint: "/spinning/rsm-lycra-offline" },
      "Wheel Change": { endpoint: "/spinning/wheel-change" },
    },
    Autoconer: {
      "Process Parameter": { fetcher: fetchAutoconerProcessParameters },
      "PP - Autoconer Q2": { endpoint: "/autoconer/q2" },
      "PP - Autoconer Q3": { endpoint: "/autoconer/q3" },
      "Rewinding Study": { endpoint: "/autoconer/rewinding-study" },
      "Cone Density": { endpoint: "/autoconer/cone-density" },
      "Cone Packing Audit": { endpoint: "/autoconer/cone-packing-audit" },
      "Lycra Checking": { endpoint: "/autoconer/lycra-checking" },
      "Count Wise Cuts Record": { endpoint: "/autoconer/count-wise-cuts" },
      "Splice Strength": { endpoint: "/autoconer/splice-strength" },
      "Drum wise Appearance": { endpoint: "/autoconer/drum-wise" },
      "CSP Parameter Entries": { endpoint: "/autoconer/parameter-entries/pending-csp" },
      "U% Parameter Entries": { endpoint: "/autoconer/parameter-entries/pending-quality" },
    },
  },
};

const defaultSelectedFields = [];
const scheduledReportsStorageKey = "spintelligenceScheduledReports";
const hourOptions = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const SixDotGrip = () => (
  <span className={styles.sixDotGrip} aria-hidden="true">
    <span />
    <span />
    <span />
    <span />
    <span />
    <span />
  </span>
);

const today = new Date();
const defaultStartDate = new Date(today);
defaultStartDate.setDate(today.getDate() - 3);

const padDatePart = (value) => String(value).padStart(2, "0");

const toInputDate = (date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const parseInputDate = (value) => {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const toMonthKey = (date) => `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;

const getMonthDate = (monthKey) => {
  const [year, month] = String(monthKey || "")
    .split("-")
    .map(Number);
  return new Date(year || today.getFullYear(), (month || today.getMonth() + 1) - 1, 1);
};

const shiftMonthKey = (monthKey, amount) => {
  const monthDate = getMonthDate(monthKey);
  monthDate.setMonth(monthDate.getMonth() + amount);
  return toMonthKey(monthDate);
};

const getCalendarDays = (monthKey) => {
  const monthDate = getMonthDate(monthKey);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: firstDay }, () => null);

  for (let day = 1; day <= totalDays; day += 1) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
};

const toDisplayDate = (value) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB").replace(/\//g, "-");
};

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const findRowsArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;

  for (const key of ["data", "rows", "entries", "records", "result", "items"]) {
    const nestedRows = findRowsArray(value[key]);
    if (nestedRows) return nestedRows;
  }

  return null;
};

const isRecordObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

const flattenRecord = (record, { includeArrays = false, prefix = "" } = {}) => {
  if (!isRecordObject(record)) return {};

  return Object.entries(record).reduce((flatRecord, [key, value]) => {
    const flatKey = prefix ? `${prefix}_${key}` : key;

    if (Array.isArray(value)) {
      if (includeArrays) {
        flatRecord[flatKey] = value
          .map((item) => (isRecordObject(item) ? JSON.stringify(item) : item))
          .join(", ");
      }
      return flatRecord;
    }

    if (isRecordObject(value)) {
      return {
        ...flatRecord,
        ...flattenRecord(value, { includeArrays, prefix: flatKey }),
      };
    }

    flatRecord[flatKey] = value;
    return flatRecord;
  }, {});
};

const expandNestedRows = (rows) =>
  rows.flatMap((row) => {
    if (!isRecordObject(row)) return row;

    const nestedArrays = Object.entries(row).filter(
      ([, value]) => Array.isArray(value) && value.some((item) => isRecordObject(item))
    );
    const parentFields = flattenRecord(row);

    if (!nestedArrays.length) {
      return flattenRecord(row, { includeArrays: true });
    }

    const usePrefix = nestedArrays.length > 1;
    const maxNestedLength = Math.max(...nestedArrays.map(([, value]) => value.length));

    return Array.from({ length: maxNestedLength }, (_, index) => {
      const childFields = nestedArrays.reduce((currentFields, [arrayKey, value]) => {
        const nestedItem = value[index];
        if (!isRecordObject(nestedItem)) return currentFields;

        return {
          ...currentFields,
          ...flattenRecord(nestedItem, {
            includeArrays: true,
            prefix: usePrefix ? arrayKey : "",
          }),
        };
      }, {});

      return {
        ...parentFields,
        ...childFields,
      };
    });
  });

const normalizeRows = (response) => {
  const rows = Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.rows)
        ? response.rows
        : Array.isArray(response?.entries)
          ? response.entries
          : Array.isArray(response?.records)
            ? response.records
            : Array.isArray(response?.result)
              ? response.result
              : Array.isArray(response?.data?.rows)
                ? response.data.rows
                : Array.isArray(response?.data?.entries)
                  ? response.data.entries
                  : Array.isArray(response?.data?.records)
                    ? response.data.records
                    : findRowsArray(response) || [];

  return expandNestedRows(rows);
};

const getRowDate = (row) =>
  row?.creation_date || row?.invoice_date || row?.entry_date || row?.date || row?.created_at;

const inferFields = (rows) => {
  const keys = Array.from(
    new Set(
      rows
        .flatMap((row) => Object.keys(row || {}))
        .filter((key) => !["id", "_id", "__v", "created_at", "updated_at"].includes(key))
    )
  );

  return keys.map((key) => ({ key, label: titleCase(key) }));
};

const getCellValue = (row, field) => {
  if (field.key === "creation_date" || field.key === "invoice_date" || field.key === "entry_date") {
    return formatDate(row?.[field.key] || getRowDate(row));
  }

  const value = row?.[field.key];
  if (value === null || typeof value === "undefined" || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const downloadFile = (filename, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

function CalendarPanel({ month, onMonthChange, onDateClick, selectedValue, title }) {
  const monthDate = getMonthDate(month);
  const days = getCalendarDays(month);
  const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={styles.calendarPanel}>
      <div className={styles.calendarPanelTitle}>
        <span>{title}</span>
        <small>{toDisplayDate(selectedValue)}</small>
      </div>
      <div className={styles.calendarHeader}>
        <button type="button" onClick={() => onMonthChange(shiftMonthKey(month, -1))}>
          <FiChevronLeft />
        </button>
        <span>{monthLabel}</span>
        <button type="button" onClick={() => onMonthChange(shiftMonthKey(month, 1))}>
          <FiChevronRight />
        </button>
      </div>
      <div className={styles.weekdayGrid}>
        {weekdayLabels.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className={styles.dayGrid}>
        {days.map((day, index) => {
          const dayKey = day ? toInputDate(day) : "";
          const dayClassName = dayKey === selectedValue ? styles.selectedDay : "";

          return day ? (
            <button
              key={dayKey}
              type="button"
              className={dayClassName}
              onClick={() => onDateClick(dayKey)}
            >
              {day.getDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          );
        })}
      </div>
    </div>
  );
}

function ReportsPage() {
  const [department, setDepartment] = useState("Quality Control");
  const [subDepartment, setSubDepartment] = useState("Spinning");
  const [reportType, setReportType] = useState("Process Parameter");
  const [startDate, setStartDate] = useState(toInputDate(defaultStartDate));
  const [endDate, setEndDate] = useState(toInputDate(today));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFields, setSelectedFields] = useState(defaultSelectedFields);
  const [draggingField, setDraggingField] = useState(null);
  const [activeDatePicker, setActiveDatePicker] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(toMonthKey(parseInputDate(toInputDate(today))));
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleHour, setScheduleHour] = useState("08");
  const [scheduleMinute, setScheduleMinute] = useState("00");
  const [scheduleMeridiem, setScheduleMeridiem] = useState("AM");
  const [scheduleTime, setScheduleTime] = useState("08:00 AM");
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState("generate");
  const [scheduledReports, setScheduledReports] = useState([]);
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [scheduleReportName, setScheduleReportName] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState("Weekly");
  const [scheduleWeekday, setScheduleWeekday] = useState("Monday");
  const [sendToMe, setSendToMe] = useState(true);
  const [sendToCustomer, setSendToCustomer] = useState(false);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const requestIdRef = useRef(0);
  const timePickerRef = useRef(null);

  const departments = Object.keys(reportSources);
  const subDepartments = Object.keys(reportSources[department] || {});
  const reportTypes = Object.keys(reportSources[department]?.[subDepartment] || {});
  const selectedReportSource = reportSources[department]?.[subDepartment]?.[reportType];

  const availableFields = useMemo(() => {
    const fields = inferFields(rows);
    const selectedKeys = new Set(selectedFields.map((field) => field.key));
    return fields.filter((field) => !selectedKeys.has(field.key));
  }, [rows, selectedFields]);

  const filteredRows = useMemo(() => {
    if (!dateFilterActive) return rows;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

    return rows.filter((row) => {
      const rawDate = getRowDate(row);
      if (!rawDate || (!start && !end)) return true;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return true;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }, [dateFilterActive, endDate, rows, startDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedSchedules = window.localStorage.getItem(scheduledReportsStorageKey);
      if (savedSchedules) {
        setScheduledReports(JSON.parse(savedSchedules));
      }
    } catch {
      setScheduledReports([]);
    } finally {
      setSchedulesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !schedulesLoaded) return;
    window.localStorage.setItem(scheduledReportsStorageKey, JSON.stringify(scheduledReports));
  }, [scheduledReports, schedulesLoaded]);

  useEffect(() => {
    const fetcher = selectedReportSource?.fetcher;
    const endpoint = selectedReportSource?.endpoint;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const reportFetcher = fetcher || (endpoint ? fetchEndpointRows.bind(null, endpoint) : null);
    if (!reportFetcher) {
      setRows([]);
      setSelectedFields([]);
      setError("No report list API is configured for this selection.");
      return;
    }

    let isActive = true;

    const loadReport = async () => {
      try {
        setLoading(true);
        const response = await reportFetcher({ page: 1, limit: 500 });
        if (isActive && requestIdRef.current === requestId) {
          const nextRows = normalizeRows(response);
          const nextFields = inferFields(nextRows);
          setRows(nextRows);
          setSelectedFields((currentFields) => {
            const availableKeys = new Set(nextFields.map((field) => field.key));
            const preservedFields = currentFields.filter((field) => availableKeys.has(field.key));
            return preservedFields.length ? preservedFields : nextFields.slice(0, Math.min(5, nextFields.length));
          });
          setError("");
        }
      } catch (requestError) {
        if (isActive && requestIdRef.current === requestId) {
          setError(requestError.message || "Unable to load report details.");
        }
      } finally {
        if (isActive && requestIdRef.current === requestId) setLoading(false);
      }
    };

    loadReport();

    return () => {
      isActive = false;
    };
  }, [department, reportType, subDepartment]);

  useEffect(() => {
    if (!timePickerOpen) return undefined;

    const handleClickOutside = (event) => {
      if (!timePickerRef.current?.contains(event.target)) {
        setTimePickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [timePickerOpen]);

  const addField = (field) => {
    setSelectedFields((current) =>
      current.some((selectedField) => selectedField.key === field.key) ? current : [...current, field]
    );
  };

  const removeField = (fieldKey) => {
    setSelectedFields((current) => current.filter((field) => field.key !== fieldKey));
  };

  const handleSelectedDrop = (targetKey) => {
    if (!draggingField) return;

    setSelectedFields((current) => {
      const withoutDragged = current.filter((field) => field.key !== draggingField.key);
      const targetIndex = withoutDragged.findIndex((field) => field.key === targetKey);
      const nextIndex = targetIndex === -1 ? withoutDragged.length : targetIndex;
      return [
        ...withoutDragged.slice(0, nextIndex),
        draggingField,
        ...withoutDragged.slice(nextIndex),
      ];
    });
    setDraggingField(null);
  };

  const handleSelectedAreaDrop = () => {
    if (!draggingField) return;

    setSelectedFields((current) => [
      ...current.filter((field) => field.key !== draggingField.key),
      draggingField,
    ]);
    setDraggingField(null);
  };

  const handleCalendarDateClick = (value) => {
    setDateFilterActive(true);

    if (activeDatePicker === "start") {
      setStartDate(value);
      if (value > endDate) setEndDate(value);
      setActiveDatePicker("");
      return;
    }

    if (value < startDate) {
      setStartDate(value);
    } else {
      setEndDate(value);
    }
    setActiveDatePicker("");
  };

  const openDatePicker = (step) => {
    setCalendarMonth(toMonthKey(parseInputDate(step === "start" ? startDate : endDate)));
    setActiveDatePicker((current) => (current === step ? "" : step));
  };

  const syncScheduleTime = (nextHour, nextMinute, nextMeridiem) => {
    setScheduleHour(nextHour);
    setScheduleMinute(nextMinute);
    setScheduleMeridiem(nextMeridiem);
    setScheduleTime(`${nextHour}:${nextMinute} ${nextMeridiem}`);
  };

  const handleScheduleTimeInput = (value) => {
    const nextValue = value.toUpperCase();
    setScheduleTime(nextValue);

    const match = nextValue.match(/^(\d{1,2})(?::(\d{0,2}))?\s*(A|P|AM|PM)?$/);
    if (!match) return;

    const nextHour = match[1] ? match[1].padStart(2, "0").slice(0, 2) : scheduleHour;
    const nextMinute = match[2] ? match[2].padStart(2, "0").slice(0, 2) : scheduleMinute;
    const nextMeridiem = match[3]?.startsWith("P") ? "PM" : match[3]?.startsWith("A") ? "AM" : scheduleMeridiem;

    setScheduleHour(nextHour);
    setScheduleMinute(nextMinute);
    setScheduleMeridiem(nextMeridiem);
  };

  const resetScheduleForm = () => {
    setEditingScheduleId("");
    setScheduleReportName(`${subDepartment} - ${reportType}`);
    setScheduleFrequency("Weekly");
    setScheduleWeekday("Monday");
    setSendToMe(true);
    setSendToCustomer(false);
    syncScheduleTime("08", "00", "AM");
  };

  const openScheduleModal = (schedule = null) => {
    if (schedule) {
      setEditingScheduleId(schedule.id);
      setScheduleReportName(schedule.name);
      setScheduleFrequency(schedule.frequency);
      setScheduleWeekday(schedule.weekday);
      setSendToMe(schedule.sendToMe);
      setSendToCustomer(schedule.sendToCustomer);
      syncScheduleTime(schedule.hour, schedule.minute, schedule.meridiem);
    } else {
      resetScheduleForm();
    }

    setTimePickerOpen(false);
    setScheduleOpen(true);
  };

  const closeScheduleModal = () => {
    setScheduleOpen(false);
    setTimePickerOpen(false);
    setEditingScheduleId("");
  };

  const handleSaveSchedule = () => {
    const schedule = {
      id: editingScheduleId || `${Date.now()}`,
      name: scheduleReportName.trim() || `${subDepartment} - ${reportType}`,
      department,
      subDepartment,
      reportType,
      frequency: scheduleFrequency,
      weekday: scheduleWeekday,
      time: scheduleTime,
      hour: scheduleHour,
      minute: scheduleMinute,
      meridiem: scheduleMeridiem,
      sendToMe,
      sendToCustomer,
      selectedFields,
      active: true,
      createdAt: editingScheduleId
        ? scheduledReports.find((scheduleItem) => scheduleItem.id === editingScheduleId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setScheduledReports((currentSchedules) =>
      editingScheduleId
        ? currentSchedules.map((scheduleItem) =>
            scheduleItem.id === editingScheduleId ? { ...scheduleItem, ...schedule } : scheduleItem
          )
        : [schedule, ...currentSchedules]
    );
    setActiveReportTab("scheduled");
    closeScheduleModal();
  };

  const toggleScheduleStatus = (scheduleId) => {
    setScheduledReports((currentSchedules) =>
      currentSchedules.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, active: !schedule.active } : schedule
      )
    );
  };

  const deleteSchedule = (scheduleId) => {
    setScheduledReports((currentSchedules) =>
      currentSchedules.filter((schedule) => schedule.id !== scheduleId)
    );
  };

  const getScheduleTiming = (schedule) => {
    if (schedule.frequency === "Daily") return `Daily at ${schedule.time}`;
    if (schedule.frequency === "Monthly") return `Monthly on day 1 at ${schedule.time}`;
    return `Weekly on ${schedule.weekday} at ${schedule.time}`;
  };

  const getScheduleRecipient = (schedule) => {
    if (schedule.sendToMe && schedule.sendToCustomer) return "Self, Customer contacts";
    if (schedule.sendToCustomer) return "Customer contacts";
    return "Self";
  };

  const exportRows = filteredRows.slice(0, 100);

  const buildCsv = () => {
    const header = selectedFields.map((field) => field.label).join(",");
    const body = exportRows
      .map((row) =>
        selectedFields
          .map((field) => `"${getCellValue(row, field).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    return `${header}\n${body}`;
  };

  const handleExportCsv = () => downloadFile("report.csv", buildCsv(), "text/csv;charset=utf-8");

  const handleExportExcel = () => {
    const tableRows = exportRows
      .map(
        (row) =>
          `<tr>${selectedFields.map((field) => `<td>${getCellValue(row, field)}</td>`).join("")}</tr>`
      )
      .join("");
    const table = `<table><thead><tr>${selectedFields
      .map((field) => `<th>${field.label}</th>`)
      .join("")}</tr></thead><tbody>${tableRows}</tbody></table>`;
    downloadFile("report.xls", table, "application/vnd.ms-excel;charset=utf-8");
  };

  const handleExportPdf = () => {
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;
    popup.document.write(`
      <html>
        <head>
          <title>Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #14213d; }
            h1 { font-size: 20px; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d7dee9; padding: 8px; text-align: left; }
            th { background: #f6f8fb; }
          </style>
        </head>
        <body>
          <h1>${department} - ${subDepartment} - ${reportType}</h1>
          <table>
            <thead><tr>${selectedFields.map((field) => `<th>${field.label}</th>`).join("")}</tr></thead>
            <tbody>${exportRows
              .map(
                (row) =>
                  `<tr>${selectedFields.map((field) => `<td>${getCellValue(row, field)}</td>`).join("")}</tr>`
              )
              .join("")}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <main className={styles.page}>
      <section className={styles.heading}>
        <div className={styles.headingIcon}>
          <FiFileText />
        </div>
        <div>
          <h1>Reports</h1>
          <p>Generate and schedule custom task reports</p>
        </div>
      </section>

      <section className={styles.reportTabs} aria-label="Report sections">
        <button
          type="button"
          className={activeReportTab === "generate" ? styles.activeReportTab : ""}
          onClick={() => setActiveReportTab("generate")}
        >
          <FiFileText /> Generate Report
        </button>
        <button
          type="button"
          className={activeReportTab === "scheduled" ? styles.activeReportTab : ""}
          onClick={() => setActiveReportTab("scheduled")}
        >
          <FiCalendar /> Scheduled ({scheduledReports.length})
        </button>
      </section>

      {activeReportTab === "generate" ? (
        <>
          <section className={styles.filterCard}>
            <div className={styles.filterTitle}>
              <FiFilter />
              <span>Filter</span>
            </div>
            <div className={styles.filterGrid}>
              <label className={styles.fieldGroup}>
                <span>Department</span>
                <select
                  value={department}
                  onChange={(event) => {
                    const nextDepartment = event.target.value;
                    const nextSubDepartment = Object.keys(reportSources[nextDepartment] || {})[0] || "";
                    const nextReportType =
                      Object.keys(reportSources[nextDepartment]?.[nextSubDepartment] || {})[0] || "";

                    setDepartment(nextDepartment);
                    setSubDepartment(nextSubDepartment);
                    setReportType(nextReportType);
                  }}
                >
                  {departments.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <FiChevronDown />
              </label>
              <label className={styles.fieldGroup}>
                <span>Sub Departments</span>
                <select
                  value={subDepartment}
                  onChange={(event) => {
                    const nextSubDepartment = event.target.value;
                    setSubDepartment(nextSubDepartment);
                    setReportType(Object.keys(reportSources[department]?.[nextSubDepartment] || {})[0] || "");
                  }}
                >
                  {subDepartments.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <FiChevronDown />
              </label>
              <label className={styles.fieldGroup}>
                <span>Type</span>
                <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
                  {reportTypes.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <FiChevronDown />
              </label>
              <div className={`${styles.fieldGroup} ${styles.dateGroup}`}>
                <span>Date - From</span>
                <button
                  type="button"
                  className={styles.dateInputs}
                  onClick={() => openDatePicker("start")}
                >
                  <span className={styles.dateDisplay}>{toDisplayDate(startDate)}</span>
                  <FiCalendar />
                </button>
                {activeDatePicker === "start" ? (
                  <div className={styles.datePickerPopover}>
                    <CalendarPanel
                      month={calendarMonth}
                      onDateClick={handleCalendarDateClick}
                      onMonthChange={setCalendarMonth}
                      selectedValue={startDate}
                      title="Select From Date"
                    />
                  </div>
                ) : null}
              </div>
              <div className={`${styles.fieldGroup} ${styles.dateGroup}`}>
                <span>Date - To</span>
                <button
                  type="button"
                  className={styles.dateInputs}
                  onClick={() => openDatePicker("end")}
                >
                  <span className={styles.dateDisplay}>{toDisplayDate(endDate)}</span>
                  <FiCalendar />
                </button>
                {activeDatePicker === "end" ? (
                  <div className={styles.datePickerPopover}>
                    <CalendarPanel
                      month={calendarMonth}
                      onDateClick={handleCalendarDateClick}
                      onMonthChange={setCalendarMonth}
                      selectedValue={endDate}
                      title="Select To Date"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className={styles.contentGrid}>
            <aside className={styles.availableCard}>
              <h2>{subDepartment} - {reportType}</h2>
              <h3>Available Fields</h3>
              <p>Drag or click the fields to add to report</p>
              <div className={styles.fieldList}>
                {availableFields.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    draggable
                    onClick={() => addField(field)}
                    onDragStart={() => setDraggingField(field)}
                    onDragEnd={() => setDraggingField(null)}
                  >
                    <SixDotGrip />
                    <span>{field.label}</span>
                  </button>
                ))}
              </div>
            </aside>

            <section className={styles.previewCard}>
              <h2>Report Preview</h2>
              <p>Drag to reorder, click X to remove</p>
              <div
                className={styles.selectedFields}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleSelectedAreaDrop}
              >
                {selectedFields.map((field) => (
                  <div
                    key={field.key}
                    className={styles.selectedField}
                    draggable
                    onDragStart={() => setDraggingField(field)}
                    onDragEnd={() => setDraggingField(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.stopPropagation();
                      handleSelectedDrop(field.key);
                    }}
                  >
                    <SixDotGrip />
                    <span>{field.label}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${field.label}`}
                      onClick={() => removeField(field.key)}
                    >
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>

              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      {selectedFields.map((field) => (
                        <th key={field.key}>{field.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, rowIndex) => (
                      <tr key={row?.id || row?.qc_id || row?.param_id || rowIndex}>
                        {selectedFields.map((field) => (
                          <td key={field.key}>{getCellValue(row, field)}</td>
                        ))}
                      </tr>
                    ))}
                    {!loading && filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={selectedFields.length || 1}>{error || "No report details found."}</td>
                      </tr>
                    ) : null}
                    {loading ? (
                      <tr>
                        <td colSpan={selectedFields.length || 1}>Loading report details...</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <section className={styles.exportBar}>
            <p>
              Ready to export Report with <strong>{selectedFields.length}</strong>{" "}
              {selectedFields.length === 1 ? "column" : "columns"}
            </p>
            <div className={styles.exportActions}>
              <button type="button" onClick={() => openScheduleModal()}>
                <FiCalendar /> Schedule Report
              </button>
              <button type="button" onClick={handleExportCsv}>
                <FiDownload /> Export CSV
              </button>
              <button type="button" onClick={handleExportExcel}>
                <FiDownload /> Export Excel
              </button>
              <button type="button" className={styles.primaryExport} onClick={handleExportPdf}>
                <FiDownload /> Export PDF
              </button>
            </div>
          </section>
        </>
      ) : (
        <section className={styles.scheduledCard}>
          <div className={styles.scheduledHeader}>
            <div>
              <h2>Scheduled Reports</h2>
              <p>Automatically send reports via email on a schedule</p>
            </div>
            <button type="button" onClick={() => openScheduleModal()}>
              <FiPlus /> New Schedule
            </button>
          </div>

          <div className={styles.scheduledList}>
            {scheduledReports.length ? (
              scheduledReports.map((schedule) => (
                <div className={styles.scheduledItem} key={schedule.id}>
                  <div>
                    <div className={styles.scheduledTitleRow}>
                      <h3>{schedule.name}</h3>
                      <span className={schedule.active ? "" : styles.pausedScheduledStatus}>
                        {schedule.active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className={styles.scheduledMeta}>
                      <span><FiClock /> {getScheduleTiming(schedule)}</span>
                      <span><FiUsers /> {getScheduleRecipient(schedule)}</span>
                      <span><FiFilter /> {schedule.department} / {schedule.subDepartment} / {schedule.reportType}</span>
                    </div>
                  </div>
                  <div className={styles.scheduledActions}>
                    <button type="button" aria-label="Send report"><FiSend /></button>
                    <button
                      type="button"
                      aria-label={schedule.active ? "Pause report" : "Activate report"}
                      onClick={() => toggleScheduleStatus(schedule.id)}
                    >
                      <FiPause />
                    </button>
                    <button type="button" aria-label="Edit report" onClick={() => openScheduleModal(schedule)}>
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      className={styles.deleteScheduledButton}
                      aria-label="Delete report"
                      onClick={() => deleteSchedule(schedule.id)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.scheduledEmpty}>
                <h3>No scheduled reports yet</h3>
                <p>Create a schedule from the current report filters and it will appear here automatically.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {scheduleOpen ? (
        <div className={styles.modalOverlay}>
          <section className={styles.scheduleModal} role="dialog" aria-modal="true" aria-labelledby="schedule-report-title">
            <h2 id="schedule-report-title">Schedule Report</h2>
            <p>Configure when and to whom this report should be sent</p>

            <label className={styles.modalField}>
              <span>Report Name</span>
              <input
                type="text"
                value={scheduleReportName}
                placeholder="e.g., Customer Report"
                onChange={(event) => setScheduleReportName(event.target.value)}
              />
            </label>

            <label className={styles.modalField}>
              <span>Frequency</span>
              <div className={styles.modalSelectWrap}>
                <select value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value)}>
                  <option>Weekly</option>
                  <option>Daily</option>
                  <option>Monthly</option>
                </select>
                <FiChevronDown />
              </div>
            </label>

            <div className={styles.modalTwoColumns}>
              <label className={styles.modalField}>
                <span>Weekday</span>
                <div className={styles.modalSelectWrap}>
                  <select value={scheduleWeekday} onChange={(event) => setScheduleWeekday(event.target.value)}>
                    <option>Monday</option>
                    <option>Tuesday</option>
                    <option>Wednesday</option>
                    <option>Thursday</option>
                    <option>Friday</option>
                  </select>
                  <FiChevronDown />
                </div>
              </label>

              <label className={styles.modalField}>
                <span>Time</span>
                <div className={styles.modalTimeWrap} ref={timePickerRef}>
                  <input
                    type="text"
                    value={scheduleTime}
                    placeholder="08:00 AM"
                    onFocus={() => setTimePickerOpen(true)}
                    onClick={() => setTimePickerOpen(true)}
                    onChange={(event) => handleScheduleTimeInput(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.timeIconButton}
                    onClick={() => setTimePickerOpen((isOpen) => !isOpen)}
                    aria-label="Select schedule time"
                  >
                    <FiClock />
                  </button>
                  {timePickerOpen ? (
                    <div className={styles.timePickerMenu}>
                      <label>
                        <span>Hrs</span>
                        <select
                          value={scheduleHour}
                          onChange={(event) => syncScheduleTime(event.target.value, scheduleMinute, scheduleMeridiem)}
                        >
                          {hourOptions.map((hour) => (
                            <option key={hour} value={hour}>
                              {hour}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Mins</span>
                        <select
                          value={scheduleMinute}
                          onChange={(event) => syncScheduleTime(scheduleHour, event.target.value, scheduleMeridiem)}
                        >
                          {minuteOptions.map((minute) => (
                            <option key={minute} value={minute}>
                              {minute}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>AM/PM</span>
                        <select
                          value={scheduleMeridiem}
                          onChange={(event) => syncScheduleTime(scheduleHour, scheduleMinute, event.target.value)}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              </label>
            </div>

            <div className={styles.sendToBlock}>
              <span>Sent To</span>
              <label>
                <input
                  type="checkbox"
                  checked={sendToMe}
                  onChange={(event) => setSendToMe(event.target.checked)}
                />
                <span>Sent to me (gmail.com)</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={sendToCustomer}
                  onChange={(event) => setSendToCustomer(event.target.checked)}
                />
                <span>Send to customer contacts (select a customer first)</span>
              </label>
            </div>

            <div className={styles.modalActions}>
              <button type="button" onClick={closeScheduleModal}>
                Cancel
              </button>
              <button type="button" className={styles.createScheduleButton} onClick={handleSaveSchedule}>
                {editingScheduleId ? "Update Schedule" : "Create Schedule"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default ReportsPage;
