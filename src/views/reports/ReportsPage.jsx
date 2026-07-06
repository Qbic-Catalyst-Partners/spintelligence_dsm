import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  FiCalendar,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiFilter,
  FiPause,
  FiSend,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { fetchBuilderOptions } from "@/apis/dashboardBuilderApi";
import {
  deleteReportScheduleAPI,
  fetchReportSchedulesAPI,
  saveReportScheduleAPI,
  sendStoredReportScheduleAPI,
  toggleReportScheduleAPI,
} from "@/apis/reportSchedulesApi";
import { fetchAnalysisRankingApi, fetchL1AnalysisApi, fetchL2AnalysisApi } from "@/apis/analysisApi";
import { fetchUsersAPI } from "@/apis/userApi";
import { emitGlobalFailureModal } from "@/utils/globalFailureModal";
import { emitGlobalSuccessModal } from "@/utils/globalSuccessModal";
import { notifyAdminAction } from "@/utils/adminActionNotifications";
import { isFullAccessUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import {
  fetchAutoconerConeDensity,
  fetchAutoconerConePackingAudit,
  fetchAutoconerCountWiseCuts,
  fetchAutoconerDrumWise,
  fetchAutoconerLycraChecking,
  fetchAutoconerPendingCspParameterEntries,
  fetchAutoconerPendingQualityParameterEntries,
  fetchAutoconerProcessParameters,
  fetchAutoconerQ2Entries,
  fetchAutoconerQ3Entries,
  fetchAutoconerRewindingStudy,
  fetchAutoconerSpliceStrength,
} from "@/apis/autoconer";
import { fetchBlowroomProcessParametersApi } from "@/apis/blowroom";
import {
  fetchCardingDfkPressureEntries,
  fetchCardingChangeControlEntries,
  fetchCardingUqcEntries,
  getCardingProcessParameterEntries,
} from "@/apis/carding";
import { fetchComberUqcEntries } from "@/apis/comber";
import {
  fetchDrawFrameCotsEntries,
  fetchDrawFrameFinisherEntries,
  fetchDrawFrameHeaderEntries,
  fetchDrawFrameUqcEntries,
} from "@/apis/draw-frame";
import {
  fetchMixingAfisEntries,
  fetchMixingCottonHviEntries,
  fetchMixingFibreEntries,
  fetchMixingMoistureEntries,
  fetchMixingOpennessEntries,
  getMixingProcessParameterEntries,
} from "@/apis/mixing";
import {
  fetchSimplexCotsChangeEntries,
  fetchSimplexProcessParameterEntries,
  fetchSimplexStudyReportEntries,
  fetchSimplexUqcEntries,
} from "@/apis/simplex";
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

const fetchGeneralReportDataRows = async (params = {}) => {
  const response = await apiConfig.get(
    "/reports/general-report/data",
    { page: 1, limit: 500, ...params },
    { skipGlobalErrorModal: true }
  );
  return response.data;
};

const ANALYSIS_DEPARTMENT = "Analysis";
const TEAM_PERFORMANCE_SUB_DEPARTMENT = "Team Performance";
const TEAM_PERFORMANCE_REPORT_TYPE = "Team Performance Analysis";

const formatAnalysisPercent = (value) => `${Number(value || 0).toFixed(2).replace(/\.00$/, "")}%`;

const isAnalysisDepartment = (departmentName) => matchesLookup(departmentName, ANALYSIS_DEPARTMENT);

const getAnalysisDateParams = (params = {}) => {
  const startDate = params.start_date || params.startDate;
  const endDate = params.end_date || params.endDate;
  const department = params.department || params.department_name || null;
  const subDepartment =
    params.sub_department ||
    params.subDepartment ||
    params.sub_department_name ||
    null;
  const base = startDate || endDate
    ? { period: "custom", start_date: startDate, end_date: endDate }
    : { period: "month" };
  return {
    ...base,
    ...(department && !isAnalysisDepartment(department) ? { department } : {}),
    ...(subDepartment ? { sub_department: subDepartment } : {}),
  };
};

const fetchTeamPerformanceAnalysisRows = async (params = {}) => {
  const analysisParams = getAnalysisDateParams(params);
  const [l1, l2, ranking] = await Promise.all([
    fetchL1AnalysisApi(analysisParams),
    fetchL2AnalysisApi(analysisParams),
    fetchAnalysisRankingApi(analysisParams),
  ]);
  const l1Metrics = l1?.metrics || {};
  const l2Metrics = l2?.metrics || {};
  const topRanking = Array.isArray(ranking?.ranking) ? ranking.ranking[0] : null;

  return [
    {
      "L1 Allocated Submission": Number(l1Metrics.allocated_submissions || 0),
      "L1 On Time Submission": Number(l1Metrics.on_time_submissions || 0),
      "L1 Delayed Submission": Number(l1Metrics.delayed_submissions || 0),
      "L1 Reworked Submission": Number(l1Metrics.reworked_submissions || 0),
      "L1 Submission Efficiency": formatAnalysisPercent(l1Metrics.submission_efficiency),
      "L1 Allocated Tickets": Number(l1Metrics.allocated_tickets || 0),
      "L1 On Time Resolution": Number(l1Metrics.on_time_resolutions || 0),
      "L1 Delayed Resolution": Number(l1Metrics.delayed_resolutions || 0),
      "L1 Reworked Resolution": Number(l1Metrics.reworked_resolutions || 0),
      "L1 Resolution Efficiency": formatAnalysisPercent(l1Metrics.resolution_efficiency),
      "L1 First Time Approval Rate": formatAnalysisPercent(l1Metrics.first_time_approval_rate),
      "L1 Ranking": formatAnalysisPercent(topRanking?.average_efficiency ?? l1Metrics.average_efficiency),
      "L2 Allocated Tickets": Number(l2Metrics.allocated_tickets || 0),
      "L2 On Time Approvals": Number(l2Metrics.on_time_approvals || 0),
      "L2 Delayed Approvals": Number(l2Metrics.delayed_approvals || 0),
      "L2 Approvals Efficiency": formatAnalysisPercent(l2Metrics.approval_efficiency),
    },
  ];
};

const reportSources = {
  Analysis: {
    "Team Performance": {
      "Team Performance Analysis": { fetcher: fetchTeamPerformanceAnalysisRows },
    },
  },
  "Quality Control": {
    Mixing: {
      "Process Parameter": { fetcher: getMixingProcessParameterEntries },
      "Cotton HVI Data Entry": { fetcher: fetchMixingCottonHviEntries },
      "Fibre Data Entry": { fetcher: fetchMixingFibreEntries },
      "AFIS Data Entry": { fetcher: fetchMixingAfisEntries },
      "Moisture Data Entry": { fetcher: fetchMixingMoistureEntries },
      "Openness Data Entry": { fetcher: fetchMixingOpennessEntries },
    },
    "Blow Room": {
      "Blow Room Sync": { endpoint: "/blowroom/sync" },
      "Process Parameter": { fetcher: fetchBlowroomProcessParametersApi },
      "BR Waste Study Entry": { fetcher: fetchEndpointRows.bind(null, "/blowroom/br-waste-study") },
      "Drop Test Data Entry": { fetcher: fetchEndpointRows.bind(null, "/blowroom/drop-test") },
    },
    Carding: {
      "Process Parameter": { fetcher: getCardingProcessParameterEntries },
      "Between & Within Card Data Entry": { endpoint: "/carding/between-within-card" },
    "Thick place & CV": { endpoint: "/carding/card-thick-place" },
      "Trials Data Entry Form": { endpoint: "/carding/trials" },
      "Nati Data Entry": { endpoint: "/carding/nati-data" },
      "U% Data Entry": { fetcher: fetchCardingUqcEntries },
      "Card DFK Pressure Checking": { fetcher: fetchCardingDfkPressureEntries },
      WheelChange: { fetcher: fetchCardingChangeControlEntries },
    },
    Comber: {
      "Ribbon Lap CV Data Entry": { endpoint: "/comber/lap-cv" },
      "Nati Data Entry": { endpoint: "/comber/nati-data-entry" },
      "U% Data Entry": { fetcher: fetchComberUqcEntries },
    },
    "Draw Frame": {
      "1 Yard / Half Yard CV Entry": { endpoint: "/drawframe/yarn-cv" },
      "Draw Frame Cots Data Entry": { fetcher: fetchDrawFrameCotsEntries },
      "U% Data Entry": { fetcher: fetchDrawFrameUqcEntries },
      "PP - Breaker Drawing": { fetcher: fetchDrawFrameHeaderEntries },
      "PP - Finisher Drawing": { fetcher: fetchDrawFrameFinisherEntries },
    },
    Simplex: {
      "Process Parameter": { fetcher: fetchSimplexProcessParameterEntries },
      "SMXCots Change Data Entry": { fetcher: fetchSimplexCotsChangeEntries },
      "SMX Breaks Study Report": { fetcher: fetchSimplexStudyReportEntries },
      "U% Data Entry": { fetcher: fetchSimplexUqcEntries },
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
      "PP - Autoconer Q2": { fetcher: fetchAutoconerQ2Entries },
      "PP - Autoconer Q3": { fetcher: fetchAutoconerQ3Entries },
      "Rewinding Study": { fetcher: fetchAutoconerRewindingStudy },
      "Cone Density": { fetcher: fetchAutoconerConeDensity },
      "Cone Packing Audit": { fetcher: fetchAutoconerConePackingAudit },
      "Lycra Checking": { fetcher: fetchAutoconerLycraChecking },
      "Count Wise Cuts Record": { fetcher: fetchAutoconerCountWiseCuts },
      "Splice Strength": { fetcher: fetchAutoconerSpliceStrength },
      "Drum wise Appearance": { fetcher: fetchAutoconerDrumWise },
      "CSP Parameter Entries": { fetcher: fetchAutoconerPendingCspParameterEntries },
      "U% Parameter Entries": { fetcher: fetchAutoconerPendingQualityParameterEntries },
    },
  },
};

const optionNameKeys = [
  "department_name",
  "departmentName",
  "sub_department_name",
  "subDepartmentName",
  "screen_name",
  "screenName",
  "input_screen_name",
  "inputScreenName",
  "notebook_name",
  "notebookName",
  "display_name",
  "displayName",
  "title",
  "name",
  "label",
  "text",
  "department",
  "sub_department",
  "subDepartment",
  "input_screen",
  "inputScreen",
  "field_name",
  "fieldName",
  "input_field",
  "inputField",
  "value",
  "key",
];

const nestedOptionKeys = [
  "data",
  "result",
  "items",
  "rows",
  "records",
  "departments",
  "department",
  "sub_departments",
  "subDepartments",
  "sub_department",
  "subDepartment",
  "input_screens",
  "inputScreens",
  "input_screen",
  "inputScreen",
  "screen_names",
  "screens",
  "notebook_types",
  "input_fields",
  "inputFields",
  "input_field",
  "inputField",
  "field_names",
  "fields",
];

const toOptionText = (value) => {
  const text = String(value ?? "").trim();
  return text ? text : "";
};

const isNumericOnlyText = (value) => /^\d+$/.test(String(value ?? "").trim());

const isReadableReportOption = (value) => {
  const text = toOptionText(value);
  return Boolean(text && !isNumericOnlyText(text));
};

const normalizeOptionList = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap(normalizeOptionList);
  }

  if (typeof value === "string" || typeof value === "number") {
    const option = toOptionText(value);
    return isReadableReportOption(option) ? [option] : [];
  }

  if (!value || typeof value !== "object") return [];

  for (const key of optionNameKeys) {
    const option = toOptionText(value[key]);
    if (isReadableReportOption(option)) return [option];
  }

  const nestedOptions = nestedOptionKeys.flatMap((key) => normalizeOptionList(value[key]));
  if (nestedOptions.length) return nestedOptions;

  return Object.keys(value)
    .map(toOptionText)
    .filter(isReadableReportOption);
};

const getFirstOptionList = (source, keys) => {
  for (const key of keys) {
    const options = normalizeOptionList(source?.[key]);
    if (options.length) return options;
  }
  return [];
};

const uniqueOptions = (options) => Array.from(new Set(normalizeOptionList(options).filter(isReadableReportOption)));

const catalogDepartments = departmentDirectory.map((item) => item.name);

const normalizeLookupKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const matchesLookup = (left, right) =>
  normalizeLookupKey(left) && normalizeLookupKey(left) === normalizeLookupKey(right);

const matchesLooseLookup = (left, right) => {
  const leftKey = normalizeLookupKey(left);
  const rightKey = normalizeLookupKey(right);
  return Boolean(leftKey && rightKey && (leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey)));
};

const findCatalogDepartment = (departmentName) =>
  departmentDirectory.find((item) => matchesLookup(item.name, departmentName) || matchesLookup(item.slug, departmentName));

const findCatalogSubDepartment = (departmentName, subDepartmentName) =>
  findCatalogDepartment(departmentName)?.subDepartments?.find(
    (item) => matchesLookup(item.name, subDepartmentName) || matchesLookup(item.slug, subDepartmentName)
  );

const getReportDepartmentKey = (departmentName) =>
  Object.keys(reportSources).find((key) => matchesLookup(key, departmentName)) || departmentName;

const getReportSubDepartmentKey = (departmentName, subDepartmentName) => {
  const departmentKey = getReportDepartmentKey(departmentName);
  if (isAnalysisDepartment(departmentKey)) return TEAM_PERFORMANCE_SUB_DEPARTMENT;
  return (
    Object.keys(reportSources[departmentKey] || {}).find((key) => matchesLookup(key, subDepartmentName)) ||
    findCatalogSubDepartment(departmentName, subDepartmentName)?.name ||
    subDepartmentName
  );
};

const getReportTypeKey = (departmentName, subDepartmentName, typeName) => {
  const departmentKey = getReportDepartmentKey(departmentName);
  const subDepartmentKey = getReportSubDepartmentKey(departmentName, subDepartmentName);
  return Object.keys(reportSources[departmentKey]?.[subDepartmentKey] || {}).find((key) => matchesLookup(key, typeName)) || typeName;
};

const getReportSource = (departmentName, subDepartmentName, typeName) => {
  const departmentKey = getReportDepartmentKey(departmentName);
  const subDepartmentKey = getReportSubDepartmentKey(departmentName, subDepartmentName);
  const typeKey = getReportTypeKey(departmentName, subDepartmentName, typeName);
  return reportSources[departmentKey]?.[subDepartmentKey]?.[typeKey];
};

const normalizeReportSelection = ({ departmentName, subDepartmentName, typeName }) => {
  const departmentKey = getReportDepartmentKey(departmentName);
  const subDepartmentKey = getReportSubDepartmentKey(departmentKey, subDepartmentName);
  const typeKey = getReportTypeKey(departmentKey, subDepartmentKey, typeName);

  if (isAnalysisDepartment(departmentKey)) {
    const selectedSubDepartment = isReadableReportOption(subDepartmentName)
      ? subDepartmentName
      : TEAM_PERFORMANCE_SUB_DEPARTMENT;
    return {
      department: ANALYSIS_DEPARTMENT,
      subDepartment: selectedSubDepartment,
      reportType: TEAM_PERFORMANCE_REPORT_TYPE,
    };
  }

  return {
    department: isReadableReportOption(departmentKey) ? departmentKey : "Quality Control",
    subDepartment: isReadableReportOption(subDepartmentKey) ? subDepartmentKey : "Mixing",
    reportType: isReadableReportOption(typeKey) ? typeKey : "Cotton HVI Data Entry",
  };
};

const normalizeReportSchedule = (schedule = {}) => {
  const canonical = normalizeReportSelection({
    departmentName: schedule.department,
    subDepartmentName: schedule.subDepartment || schedule.sub_department,
    typeName: schedule.reportType || schedule.report_type || schedule.input_screen,
  });

  return {
    ...schedule,
    department: canonical.department,
    subDepartment: canonical.subDepartment,
    reportType: canonical.reportType,
  };
};

const getCatalogSubDepartments = (selectedDepartment) =>
  findCatalogDepartment(selectedDepartment)?.subDepartments?.map((item) => item.name) || [];

const getStatisticsSubDepartmentOptions = () =>
  uniqueOptions(
    departmentDirectory
      .filter((department) => department.enabled)
      .flatMap((department) => department.subDepartments || [])
      .filter((subDepartment) => subDepartment.enabled)
      .map((subDepartment) => subDepartment.name)
  );

const getDepartmentSlugByName = (departmentName) =>
  findCatalogDepartment(departmentName)?.slug || "";

const getSubDepartmentSlugByName = (departmentName, subDepartmentName) =>
  findCatalogSubDepartment(departmentName, subDepartmentName)?.slug || "";

const getDepartmentOptions = (data) =>
  uniqueOptions([
    ...getFirstOptionList(data, ["departments", "department"]),
    ...catalogDepartments,
    ...Object.keys(reportSources),
  ]);

const getSubDepartmentOptions = (data, selectedDepartment) =>
  uniqueOptions([
    ...getFirstOptionList(data, [
      "sub_departments",
      "subDepartments",
      "sub_department",
      "subDepartment",
      "sub_department_names",
    ]),
    ...getCatalogSubDepartments(selectedDepartment),
    ...Object.keys(reportSources[selectedDepartment] || {}),
  ]);

const getInputScreenOptions = (data, selectedDepartment, selectedSubDepartment) =>
  uniqueOptions([
    ...getFirstOptionList(data, [
      "input_screens",
      "inputScreens",
      "input_screen",
      "inputScreen",
      "screen_names",
      "screens",
      "notebook_types",
    ]),
    ...getThresholdScreensForSubDepartment(
      getDepartmentSlugByName(selectedDepartment),
      getSubDepartmentSlugByName(selectedDepartment, selectedSubDepartment)
    ),
    ...Object.keys(reportSources[getReportDepartmentKey(selectedDepartment)]?.[getReportSubDepartmentKey(selectedDepartment, selectedSubDepartment)] || {}),
  ]);

const getInputFieldOptions = (data) =>
  uniqueOptions(
    getFirstOptionList(data, [
      "input_fields",
      "inputFields",
      "input_field",
      "inputField",
      "field_names",
      "fields",
    ])
  );

const getAccessEntryForReportSubDepartment = (accessByDepartment, subDepartmentName) => {
  const accessList = Array.isArray(accessByDepartment) ? accessByDepartment : [];
  return (
    accessList.find((entry) => matchesLookup(entry?.department_name, subDepartmentName)) ||
    accessList.find((entry) => matchesLooseLookup(entry?.department_name, subDepartmentName)) ||
    null
  );
};

const getAccessibleReportSources = (accessByDepartment, user) => {
  if (isFullAccessUser(user)) return reportSources;
  if (!Array.isArray(accessByDepartment)) return {};

  return Object.entries(reportSources).reduce((departmentMap, [departmentName, subDepartmentMap]) => {
    const nextSubDepartments = Object.entries(subDepartmentMap).reduce(
      (subDepartmentResult, [subDepartmentName, typeMap]) => {
        const accessEntry = getAccessEntryForReportSubDepartment(accessByDepartment, subDepartmentName);
        const screens = Array.isArray(accessEntry?.screens) ? accessEntry.screens : [];

        if (!screens.length) return subDepartmentResult;

        const nextTypes = Object.entries(typeMap).reduce((typeResult, [typeName, source]) => {
          const hasScreenAccess = screens.some((screen) => matchesLooseLookup(screen?.name, typeName));
          return hasScreenAccess ? { ...typeResult, [typeName]: source } : typeResult;
        }, {});

        return Object.keys(nextTypes).length
          ? { ...subDepartmentResult, [subDepartmentName]: nextTypes }
          : subDepartmentResult;
      },
      {}
    );

    return Object.keys(nextSubDepartments).length
      ? { ...departmentMap, [departmentName]: nextSubDepartments }
      : departmentMap;
  }, {});
};

const defaultSelectedFields = [];
const reportPageSize = 500;
const maxReportPages = 100;
const reportPageRequestTimeoutMs = 20000;
const hourOptions = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const weekdayOptions = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const frequencyOptions = ["Single Time", "Daily", "Weekly", "Monthly"];
const monthDayOptions = Array.from({ length: 31 }, (_, index) => String(index + 1));

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

const getReportValueSources = (row) => {
  const sources = [row, row?.data, row?.record, row?.details, row?.summary, row?.form, row?.payload];
  return sources.filter(isRecordObject);
};

const findValueByNormalizedKey = (row, targetKey) => {
  const normalizedTarget = normalizeLookupKey(targetKey);
  if (!normalizedTarget) return null;

  for (const source of getReportValueSources(row)) {
    const flatSource = flattenRecord(source, { includeArrays: true });
    const matchedKey = Object.keys(flatSource).find((rowKey) => {
      const normalizedRowKey = normalizeLookupKey(rowKey);
      return (
        normalizedRowKey === normalizedTarget ||
        normalizedRowKey.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedRowKey)
      );
    });
    if (matchedKey) {
      const matchedValue = flatSource[matchedKey];
      if (matchedValue !== null && typeof matchedValue !== "undefined" && matchedValue !== "") {
        return matchedValue;
      }
    }
  }

  return null;
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

const getTotalPages = (response) => {
  const candidates = [
    response?.totalPages,
    response?.total_pages,
    response?.pages,
    response?.meta?.totalPages,
    response?.meta?.total_pages,
    response?.pagination?.totalPages,
    response?.pagination?.total_pages,
    response?.data?.totalPages,
    response?.data?.total_pages,
    response?.data?.meta?.totalPages,
    response?.data?.pagination?.totalPages,
  ];
  const totalPages = candidates.map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (totalPages) return totalPages;

  const total = Number(response?.total ?? response?.data?.total ?? response?.meta?.total);
  const limit = Number(response?.limit ?? response?.data?.limit ?? response?.meta?.limit);
  return Number.isFinite(total) && Number.isFinite(limit) && limit > 0 ? Math.ceil(total / limit) : 0;
};

const stringifyForSignature = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stringifyForSignature).join(",")}]`;
  }

  if (isRecordObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stringifyForSignature(value[key])}`)
      .join(",")}}`;
  }

  return String(value ?? "");
};

const getRowSignature = (rows) =>
  rows
    .slice(0, 10)
    .map((row) => stringifyForSignature(row))
    .join("|");

const fetchAllReportRows = async (reportFetcher, baseParams = {}) => {
  const allRows = [];
  const seenPageSignatures = new Set();
  let totalPages = 0;

  for (let page = 1; page <= maxReportPages; page += 1) {
    const response = await Promise.race([
      reportFetcher({ ...baseParams, page, limit: reportPageSize }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Report data request timed out. Please check the backend connection.")), reportPageRequestTimeoutMs)
      ),
    ]);
    const pageRows = normalizeRows(response);
    const pageSignature = `${pageRows.length}:${getRowSignature(pageRows)}`;

    if (page > 1 && seenPageSignatures.has(pageSignature)) {
      break;
    }

    seenPageSignatures.add(pageSignature);
    allRows.push(...pageRows);

    totalPages = totalPages || getTotalPages(response);

    if (totalPages && page >= totalPages) {
      break;
    }

    if (!totalPages && pageRows.length < reportPageSize) {
      break;
    }

    if (!pageRows.length) {
      break;
    }
  }

  return allRows;
};

const getRowDate = (row) =>
  row?.inspection_date ||
  row?.creation_date ||
  row?.invoice_date ||
  row?.entry_date ||
  row?.date ||
  row?.created_at ||
  row?.generated_at;

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

const toReportField = (fieldName) => {
  const label = String(fieldName || "").trim();
  if (!label) return null;

  return {
    key: label,
    label,
  };
};

const reportFieldAliases = {
  "Span Length (2.5%)": ["span_length", "spanLength"],
  "Invisible Loss %": ["invisible_loss_percentage", "invisible_loss_percent", "invisibleLossPercent"],
  "Trash Content %": ["trash_content_percentage", "trash_content_percent", "trashContentPercent"],
  "Yellow + B": ["yellow_b", "yellowB"],
  TrCnt: ["trcnt", "tr_cnt", "trCnt"],
  TrAr: ["trar", "tr_ar", "trAr"],
  TrID: ["trid", "tr_id", "trID"],
  "Colour Grade": ["colour_grade", "color_grade", "colourGrade", "colorGrade"],
  "U%": ["u_percent", "uPercent"],
  "CV%": ["cv_percent", "cvPercent"],
};

const getCanonicalReportFieldKey = (field) => {
  const fieldKey = String(field?.key || field?.label || "").trim();
  const matchedAlias = Object.entries(reportFieldAliases).find(([label, aliases]) =>
    [label, ...aliases].some((candidate) => normalizeLookupKey(candidate) === normalizeLookupKey(fieldKey))
  );
  return matchedAlias ? normalizeLookupKey(matchedAlias[0]) : normalizeLookupKey(fieldKey);
};

const getReportFieldValue = (row, field) => {
  const keys = [
    field?.key,
    field?.label,
    ...(reportFieldAliases[field?.label] || []),
    ...(reportFieldAliases[field?.key] || []),
  ].filter(Boolean);

  for (const key of keys) {
    if (row?.[key] !== null && typeof row?.[key] !== "undefined" && row?.[key] !== "") return row[key];
    const target = normalizeLookupKey(key);
    const matchedKey = Object.keys(row || {}).find((rowKey) => {
      const normalizedRowKey = normalizeLookupKey(rowKey);
      return (
        normalizedRowKey === target ||
        normalizedRowKey.includes(target) ||
        target.includes(normalizedRowKey)
      );
    });
    if (matchedKey && row[matchedKey] !== null && typeof row[matchedKey] !== "undefined" && row[matchedKey] !== "") {
      return row[matchedKey];
    }

    const nestedValue = findValueByNormalizedKey(row, key);
    if (nestedValue !== null && typeof nestedValue !== "undefined" && nestedValue !== "") {
      return nestedValue;
    }
  }

  const fallbackSource = getReportValueSources(row);
  for (const source of fallbackSource) {
    const values = Object.values(flattenRecord(source, { includeArrays: true }));
    const firstMeaningful = values.find(
      (value) => value !== null && typeof value !== "undefined" && String(value).trim() !== ""
    );
    if (typeof firstMeaningful !== "undefined") {
      return firstMeaningful;
    }
  }

  return null;
};

const getCellValue = (row, field) => {
  if (
    field.key === "inspection_date" ||
    field.key === "creation_date" ||
    field.key === "invoice_date" ||
    field.key === "entry_date"
  ) {
    return formatDate(getReportFieldValue(row, field) || getRowDate(row));
  }

  const value = getReportFieldValue(row, field);
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

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const loadExcelJS = async () => {
  const excelJSImport = await import("exceljs");
  return excelJSImport?.default || excelJSImport;
};

const escapePdfText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const escapeHtmlText = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const compactPdfText = (value, maxLength = 110) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const toBase64Ascii = (value) => {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(value);
  }
  return "";
};

const getReportAttachmentName = (scheduleName) => {
  const safeName = String(scheduleName || "scheduled-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeName || "scheduled-report"}.pdf`;
};

const getReportPdfColumns = (report) => {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const fieldColumns = Array.isArray(report?.fields)
    ? report.fields
        .map((field) => String(field?.label || field?.key || field || "").trim())
        .filter(Boolean)
    : [];
  const rowColumns = rows.length ? Object.keys(rows[0] || {}) : [];
  return fieldColumns.length ? fieldColumns : rowColumns;
};

const shouldUseLandscapePdf = (columns, rows) => {
  if (columns.length > 5) return true;
  const longestLine = rows.slice(0, 25).reduce((longest, row) => {
    const length = columns.reduce((total, column) => total + String(row?.[column] ?? "").length + 3, 0);
    return Math.max(longest, length);
  }, columns.join(" | ").length);
  return longestLine > 95;
};

const padPdfCell = (value, width) => compactPdfText(value, width).padEnd(width, " ");

const buildReportPdfBase64 = ({ schedule = {}, report = {} }) => {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const columns = getReportPdfColumns(report);
  const landscape = shouldUseLandscapePdf(columns, rows);
  const page = landscape
    ? { width: 842, height: 595, fontSize: 7, lineHeight: 10 }
    : { width: 612, height: 792, fontSize: 8, lineHeight: 12 };
  const margin = 36;
  const approximateCharsPerLine = Math.floor((page.width - margin * 2) / (page.fontSize * 0.55));
  const columnWidth = Math.max(
    8,
    Math.floor((approximateCharsPerLine - Math.max(columns.length - 1, 0) * 3) / Math.max(columns.length, 1))
  );
  const lines = [
    schedule.name || "Scheduled Report",
    `Department: ${report.department || "-"}`,
    `Sub Department: ${report.subDepartment || "-"}`,
    `Type: ${report.reportType || "-"}`,
    `Date Range: ${report.dateRange?.from || "-"} to ${report.dateRange?.to || "-"}`,
    `Total Rows: ${report.totalRows ?? rows.length}`,
    "",
  ];

  if (columns.length) {
    lines.push(columns.map((column) => padPdfCell(column, columnWidth)).join(" | "));
    lines.push(columns.map(() => "-".repeat(columnWidth)).join("-+-"));
    if (rows.length) {
      rows.forEach((row) => {
        lines.push(columns.map((column) => padPdfCell(row?.[column] ?? "-", columnWidth)).join(" | "));
      });
    } else {
      lines.push("No report rows found for the selected filters.");
    }
  } else {
    lines.push("No report fields selected.");
  }

  const dynamicLineHeight = Math.min(page.lineHeight, (page.height - margin * 2) / Math.max(lines.length, 1));
  const dynamicFontSize = Math.max(0.9, Math.min(page.fontSize, dynamicLineHeight * 0.78));

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  const pageRefs = [];

  const content = [
    "BT",
    `/F1 ${dynamicFontSize.toFixed(2)} Tf`,
    `${margin} ${page.height - margin} Td`,
    `${dynamicLineHeight.toFixed(2)} TL`,
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET",
  ].join("\n");
  const contentObjectNumber = objects.length + 1;
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const pageObjectNumber = objects.length + 1;
  pageRefs.push(`${pageObjectNumber} 0 R`);
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
  );

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return toBase64Ascii(pdf);
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
  const authUser = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const [department, setDepartment] = useState("Quality Control");
  const [subDepartment, setSubDepartment] = useState("Spinning");
  const [reportType, setReportType] = useState("Process Parameter");
  const [startDate, setStartDate] = useState(toInputDate(defaultStartDate));
  const [endDate, setEndDate] = useState(toInputDate(today));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [builderOptions, setBuilderOptions] = useState({
    departments: [],
    sub_departments: [],
    input_screens: [],
    input_fields: [],
    periods: ["1D", "1W", "1M", "1Y"],
  });
  const [, setInputField] = useState("");
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
  const [sendingScheduleId, setSendingScheduleId] = useState("");
  const [scheduleReportName, setScheduleReportName] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState("Weekly");
  const [scheduleWeekday, setScheduleWeekday] = useState("Monday");
  const [scheduleMonthDay, setScheduleMonthDay] = useState("1");
  const [scheduleSingleDate, setScheduleSingleDate] = useState(toInputDate(today));
  const [sendToMe, setSendToMe] = useState(true);
  const [sendToOthers, setSendToOthers] = useState(false);
  const [scheduleUsers, setScheduleUsers] = useState([]);
  const [selectedScheduleUserIds, setSelectedScheduleUserIds] = useState([]);
  const [recipientDropdownOpen, setRecipientDropdownOpen] = useState(false);
  const requestIdRef = useRef(0);
  const timePickerRef = useRef(null);
  const recipientDropdownRef = useRef(null);
  const sendingScheduleKeysRef = useRef(new Set());

  const accessibleReportSources = useMemo(
    () => getAccessibleReportSources(accessByDepartment, authUser),
    [accessByDepartment, authUser]
  );
  const departments = Object.keys(accessibleReportSources);
  const isTeamPerformanceReport = isAnalysisDepartment(department);
  const subDepartments = isTeamPerformanceReport
    ? getStatisticsSubDepartmentOptions()
    : Object.keys(accessibleReportSources[department] || {});
  const reportTypes = isTeamPerformanceReport
    ? Object.keys(accessibleReportSources[department]?.[TEAM_PERFORMANCE_SUB_DEPARTMENT] || {})
    : Object.keys(accessibleReportSources[department]?.[subDepartment] || {});
  const selectedReportSource = isTeamPerformanceReport
    ? accessibleReportSources[department]?.[TEAM_PERFORMANCE_SUB_DEPARTMENT]?.[TEAM_PERFORMANCE_REPORT_TYPE]
    : accessibleReportSources[department]?.[subDepartment]?.[reportType];
  const isInvoiceDataReport = String(reportType || "").trim().toLowerCase().includes("invoice");

  const getUserId = (user) =>
    String(user?.id || user?.user_id || user?.userId || user?.employeeId || user?.employee_id || user?.email || "");

  const getUserName = (user) =>
    user?.name ||
    user?.full_name ||
    user?.fullName ||
    user?.username ||
    user?.email ||
    getUserId(user);

  const getUserEmail = (user) =>
    String(user?.email || user?.mail || user?.user_email || user?.official_email || "").trim();

  const sendToMeEmail = getUserEmail(authUser);
  const reportOwnerKey = String(
    authUser?.id ||
      authUser?.user_id ||
      authUser?.userId ||
      authUser?.employee_id ||
      authUser?.employeeId ||
      sendToMeEmail ||
      ""
  );

  const selfRecipientName =
    authUser?.full_name ||
    authUser?.fullName ||
    authUser?.name ||
    authUser?.username ||
    "there";

  const selectedScheduleUsers = useMemo(
    () => scheduleUsers.filter((user) => selectedScheduleUserIds.includes(getUserId(user))),
    [scheduleUsers, selectedScheduleUserIds]
  );

  const selectedRecipientLabel = selectedScheduleUsers.length
    ? selectedScheduleUsers.map(getUserName).join(", ")
    : "Select users";

  const getScheduleRecordId = (schedule) =>
    String(schedule?.id || schedule?._id || schedule?.scheduleId || schedule?.schedule_id || "");

  useEffect(() => {
    const nextDepartment = departments.includes(department) ? department : (departments[0] || "");
    const nextSubDepartments = isAnalysisDepartment(nextDepartment)
      ? getStatisticsSubDepartmentOptions()
      : Object.keys(accessibleReportSources[nextDepartment] || {});
    const nextSubDepartment = nextSubDepartments.includes(subDepartment)
      ? subDepartment
      : (nextSubDepartments[0] || "");
    const nextReportTypes = isAnalysisDepartment(nextDepartment)
      ? Object.keys(accessibleReportSources[nextDepartment]?.[TEAM_PERFORMANCE_SUB_DEPARTMENT] || {})
      : Object.keys(accessibleReportSources[nextDepartment]?.[nextSubDepartment] || {});
    const nextReportType = nextReportTypes.includes(reportType) ? reportType : (nextReportTypes[0] || "");

    if (nextDepartment !== department) setDepartment(nextDepartment);
    if (nextSubDepartment !== subDepartment) setSubDepartment(nextSubDepartment);
    if (nextReportType !== reportType) setReportType(nextReportType);
  }, [accessibleReportSources, department, departments, reportType, subDepartment]);

  const availableFields = useMemo(() => {
    const configuredFields = uniqueOptions([
      ...builderOptions.input_fields,
      ...getThresholdFieldsForScreen(reportType),
    ])
      .map(toReportField)
      .filter(Boolean);
    const sourceFields = [...configuredFields, ...inferFields(rows)].filter(
      (field, index, list) =>
        field?.key &&
        index === list.findIndex((item) => getCanonicalReportFieldKey(item) === getCanonicalReportFieldKey(field))
    );
    const selectedKeys = new Set(selectedFields.map((field) => field.key));
    return sourceFields.filter((field) => !selectedKeys.has(field.key));
  }, [builderOptions.input_fields, reportType, rows, selectedFields]);

  const filteredRows = useMemo(() => {
    if (isInvoiceDataReport) return rows;
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
  }, [dateFilterActive, endDate, isInvoiceDataReport, rows, startDate]);

  useEffect(() => {
    let isMounted = true;
    const loadDepartments = async () => {
      try {
        const response = await fetchBuilderOptions();
        if (!isMounted) return;
        const next = response?.data || {};
        const nextDepartments = getDepartmentOptions(next);
        const nextPeriods = Array.isArray(next.periods) && next.periods.length ? next.periods : ["1D", "1W", "1M", "1Y"];
        const defaultDepartment = nextDepartments.includes(department) ? department : (nextDepartments[0] || "");
        setBuilderOptions((current) => ({
          ...current,
          departments: nextDepartments,
          periods: nextPeriods,
        }));
        setDepartment(defaultDepartment);
      } catch {
        if (!isMounted) return;
        const fallbackDepartments = getDepartmentOptions({});
        const defaultDepartment = fallbackDepartments.includes(department) ? department : (fallbackDepartments[0] || "");
        setBuilderOptions((current) => ({
          ...current,
          departments: fallbackDepartments,
          periods: ["1D", "1W", "1M", "1Y"],
        }));
        setDepartment(defaultDepartment);
      }
    };
    loadDepartments();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadSubDepartments = async () => {
      if (!department) return;
      if (isAnalysisDepartment(department)) {
        const nextSubDepartments = getStatisticsSubDepartmentOptions();
        const nextSubDepartment = nextSubDepartments.includes(subDepartment) ? subDepartment : (nextSubDepartments[0] || "");
        setBuilderOptions((current) => ({ ...current, sub_departments: nextSubDepartments, input_screens: [], input_fields: [] }));
        setSubDepartment(nextSubDepartment);
        return;
      }
      try {
        const response = await fetchBuilderOptions({ department });
        if (!isMounted) return;
        const nextSubDepartments = getSubDepartmentOptions(response?.data || {}, department);
        const nextSubDepartment = nextSubDepartments.includes(subDepartment) ? subDepartment : (nextSubDepartments[0] || "");
        setBuilderOptions((current) => ({ ...current, sub_departments: nextSubDepartments, input_screens: [], input_fields: [] }));
        setSubDepartment(nextSubDepartment);
      } catch {
        if (!isMounted) return;
        const nextSubDepartments = getSubDepartmentOptions({}, department);
        const nextSubDepartment = nextSubDepartments.includes(subDepartment) ? subDepartment : (nextSubDepartments[0] || "");
        setBuilderOptions((current) => ({ ...current, sub_departments: nextSubDepartments, input_screens: [], input_fields: [] }));
        setSubDepartment(nextSubDepartment);
      }
    };
    loadSubDepartments();
    return () => {
      isMounted = false;
    };
  }, [department]);

  useEffect(() => {
    let isMounted = true;
    const loadScreens = async () => {
      if (!department || !subDepartment) return;
      if (isAnalysisDepartment(department)) {
        setBuilderOptions((current) => ({
          ...current,
          input_screens: [TEAM_PERFORMANCE_REPORT_TYPE],
          input_fields: [],
        }));
        setReportType(TEAM_PERFORMANCE_REPORT_TYPE);
        return;
      }
      try {
        const response = await fetchBuilderOptions({ department, sub_department: subDepartment });
        if (!isMounted) return;
        const nextScreens = getInputScreenOptions(response?.data || {}, department, subDepartment);
        const nextScreen = nextScreens.includes(reportType) ? reportType : (nextScreens[0] || "");
        setBuilderOptions((current) => ({ ...current, input_screens: nextScreens, input_fields: [] }));
        setReportType(nextScreen);
      } catch {
        if (!isMounted) return;
        const nextScreens = getInputScreenOptions({}, department, subDepartment);
        const nextScreen = nextScreens.includes(reportType) ? reportType : (nextScreens[0] || "");
        setBuilderOptions((current) => ({ ...current, input_screens: nextScreens, input_fields: [] }));
        setReportType(nextScreen);
      }
    };
    loadScreens();
    return () => {
      isMounted = false;
    };
  }, [department, subDepartment]);

  useEffect(() => {
    let isMounted = true;
    const loadFields = async () => {
      if (!department || !subDepartment || !reportType) return;
      const response = await fetchBuilderOptions({
        department,
        sub_department: subDepartment,
        input_screen: reportType,
      });
      if (!isMounted) return;
      const nextFields = getInputFieldOptions(response?.data || {});
      setBuilderOptions((current) => ({ ...current, input_fields: nextFields }));
      setInputField((current) => (nextFields.includes(current) ? current : (nextFields[0] || "")));
    };
    loadFields().catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [department, subDepartment, reportType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isActive = true;

    const loadSchedules = async () => {
      try {
        const schedules = await fetchReportSchedulesAPI(reportOwnerKey);
        if (isActive) {
          setScheduledReports(schedules.map(normalizeReportSchedule));
        }
      } catch {
        if (isActive) {
          setScheduledReports([]);
        }
      }
    };

    loadSchedules();

    return () => {
      isActive = false;
    };
  }, [reportOwnerKey]);

  useEffect(() => {
    let isActive = true;

    const loadUsers = async () => {
      try {
        const response = await fetchUsersAPI();
        if (!isActive) return;
        setScheduleUsers(normalizeRows(response).filter((user) => getUserId(user)));
      } catch {
        if (isActive) setScheduleUsers([]);
      }
    };

    loadUsers();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setRows([]);
    setSelectedFields([]);
    setError("");

    if (!department || !subDepartment || !reportType) {
      setRows([]);
      setSelectedFields([]);
      setError("No report screens are assigned to this user.");
      return;
    }

    let isActive = true;

    const loadReport = async () => {
      try {
        setLoading(true);
        const reportSource = selectedReportSource;
        const reportFetcher =
          reportSource?.fetcher ||
          (reportSource?.endpoint ? fetchEndpointRows.bind(null, reportSource.endpoint) : null);
        const canonicalReport = normalizeReportSelection({
          departmentName: department,
          subDepartmentName: subDepartment,
          typeName: reportType,
        });

        const baseReportParams = {
          start_date: startDate,
          end_date: endDate,
          department: canonicalReport.department,
          subDepartment: canonicalReport.subDepartment,
          sub_department: canonicalReport.subDepartment,
          reportType: canonicalReport.reportType,
          report_type: canonicalReport.reportType,
          input_screen: canonicalReport.reportType,
        };
        const generalReportFetcher = (params = {}) => fetchGeneralReportDataRows({ ...baseReportParams, ...params });

        let nextRows = [];
        if (reportFetcher) {
          try {
            nextRows = await fetchAllReportRows(reportFetcher, baseReportParams);
          } catch (directError) {
            nextRows = await fetchAllReportRows(generalReportFetcher, baseReportParams);
          }
        } else {
          nextRows = await fetchAllReportRows(generalReportFetcher, baseReportParams);
        }

        if (isActive && requestIdRef.current === requestId) {
          setRows(nextRows);
          setSelectedFields([]);
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
  }, [department, endDate, reportType, selectedReportSource, startDate, subDepartment]);

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

  useEffect(() => {
    if (!recipientDropdownOpen) return undefined;

    const handleClickOutside = (event) => {
      if (!recipientDropdownRef.current?.contains(event.target)) {
        setRecipientDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [recipientDropdownOpen]);

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
    setScheduleMonthDay("1");
    setScheduleSingleDate(toInputDate(new Date()));
    setSendToMe(true);
    setSendToOthers(false);
    setSelectedScheduleUserIds([]);
    setRecipientDropdownOpen(false);
    syncScheduleTime("08", "00", "AM");
  };

  const openScheduleModal = (schedule = null) => {
    if (schedule) {
      setEditingScheduleId(getScheduleRecordId(schedule));
      setScheduleReportName(schedule.name);
      setScheduleFrequency(schedule.frequency);
      setScheduleWeekday(schedule.weekday);
      setScheduleMonthDay(String(schedule.monthDay || "1"));
      setScheduleSingleDate(schedule.singleDate || toInputDate(new Date()));
      setSendToMe(schedule.sendToMe);
      const recipientIds = Array.isArray(schedule.recipientUserIds) ? schedule.recipientUserIds.map(String) : [];
      setSendToOthers(typeof schedule.sendToOthers === "boolean" ? schedule.sendToOthers : recipientIds.length > 0);
      setSelectedScheduleUserIds(recipientIds);
      setRecipientDropdownOpen(false);
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
    setRecipientDropdownOpen(false);
    setEditingScheduleId("");
  };

  const toggleScheduleRecipient = (userId) => {
    setSelectedScheduleUserIds((current) =>
      current.includes(userId)
        ? current.filter((selectedId) => selectedId !== userId)
        : [...current, userId]
    );
  };

  const filterRowsByScheduleDate = (schedule, reportRows) => {
    if (!schedule.dateFilterActive) return reportRows;

    const scheduleStartDate = schedule.startDate ? new Date(schedule.startDate) : null;
    const scheduleEndDate = schedule.endDate ? new Date(`${schedule.endDate}T23:59:59`) : null;

    return reportRows.filter((row) => {
      const rawDate = getRowDate(row);
      if (!rawDate || (!scheduleStartDate && !scheduleEndDate)) return true;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return true;
      if (scheduleStartDate && date < scheduleStartDate) return false;
      if (scheduleEndDate && date > scheduleEndDate) return false;
      return true;
    });
  };

  const loadScheduleRows = async (schedule) => {
    const normalizedSchedule = normalizeReportSchedule(schedule);
    const scheduleSource =
      accessibleReportSources[normalizedSchedule.department]?.[normalizedSchedule.subDepartment]?.[normalizedSchedule.reportType];
    const reportFetcher =
      scheduleSource?.fetcher ||
      (scheduleSource?.endpoint ? fetchEndpointRows.bind(null, scheduleSource.endpoint) : null);
    const baseScheduleParams = {
      start_date: normalizedSchedule.startDate,
      end_date: normalizedSchedule.endDate,
      department: normalizedSchedule.department,
      subDepartment: normalizedSchedule.subDepartment,
      sub_department: normalizedSchedule.subDepartment,
      reportType: normalizedSchedule.reportType,
      report_type: normalizedSchedule.reportType,
      input_screen: normalizedSchedule.reportType,
    };
    const generalReportFetcher = (params = {}) => fetchGeneralReportDataRows({ ...baseScheduleParams, ...params });
    let scheduleRows = [];

    if (reportFetcher) {
      try {
        scheduleRows = await fetchAllReportRows(reportFetcher, baseScheduleParams);
      } catch (directError) {
        scheduleRows = await fetchAllReportRows(generalReportFetcher, baseScheduleParams);
      }
    } else {
      scheduleRows = await fetchAllReportRows(generalReportFetcher, baseScheduleParams);
    }

    return filterRowsByScheduleDate(normalizedSchedule, scheduleRows);
  };

  const buildScheduleMailPayload = (schedule, reportRows = filteredRows) => {
    const normalizedSchedule = normalizeReportSchedule(schedule);
    const reportFields = schedule.selectedFields?.length ? schedule.selectedFields : selectedFields;
    const otherRecipientProfiles = schedule.sendToOthers
      ? (schedule.recipientUsers || [])
          .map((user) => ({
            name: user?.name || "there",
            email: getUserEmail(user),
          }))
          .filter((user) => user.email)
      : [];
    const recipientProfiles = [
      ...(schedule.sendToMe && sendToMeEmail ? [{ name: selfRecipientName, email: sendToMeEmail, kind: "self" }] : []),
      ...otherRecipientProfiles,
    ].filter((recipient, index, list) => recipient.email && index === list.findIndex((item) => item.email === recipient.email));
    const otherRecipientEmails = otherRecipientProfiles.map((user) => user.email);
    const recipients = Array.from(
      new Set([
        ...(schedule.sendToMe && sendToMeEmail ? [sendToMeEmail] : []),
        ...otherRecipientEmails,
      ])
    );

    const report = {
      department: normalizedSchedule.department,
      subDepartment: normalizedSchedule.subDepartment,
      reportType: normalizedSchedule.reportType,
      dateRange: {
        from: schedule.startDate || startDate,
        to: schedule.endDate || endDate,
      },
      fields: reportFields,
      rows: reportRows.map((row) =>
        reportFields.reduce((record, field) => {
          record[field.label] = getCellValue(row, field);
          return record;
        }, {})
      ),
      totalRows: reportRows.length,
    };
    const pdfAttachment = {
      filename: getReportAttachmentName(schedule.name),
      contentType: "application/pdf",
      content: buildReportPdfBase64({ schedule, report }),
      encoding: "base64",
    };

    const greetingName = recipientProfiles.length === 1 ? recipientProfiles[0].name : "Team";
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.55;">
        <p>Dear ${greetingName},</p>
        <p>I hope you are doing well.</p>
        <p>Please find attached the scheduled report <strong>${schedule.name}</strong> for your review.</p>
        <p>
          <strong>Department:</strong> ${normalizedSchedule.department}<br />
          <strong>Sub Department:</strong> ${normalizedSchedule.subDepartment}<br />
          <strong>Type:</strong> ${normalizedSchedule.reportType}<br />
          <strong>Date Range:</strong> ${report.dateRange.from} to ${report.dateRange.to}<br />
          <strong>Total Rows:</strong> ${report.totalRows}
        </p>
        <p>The report PDF is attached to this email and can be downloaded for your records.</p>
        <p>Warm regards,<br />Spintelligence Reports</p>
      </div>
    `;

    return {
      schedule: {
        ...normalizedSchedule,
        active: typeof schedule.active === "boolean" ? schedule.active : true,
      },
      mailPayload: {
        to: recipients,
        subject: `Scheduled Report: ${schedule.name}`,
        department: report.department,
        subDepartment: report.subDepartment,
        reportType: report.reportType,
        dateRange: report.dateRange,
        fields: report.fields,
        rows: report.rows,
        totalRows: report.totalRows,
        html,
        recipientProfiles,
        attachments: [pdfAttachment],
      },
    };
  };

  const handleSaveSchedule = async () => {
    const canonicalReport = normalizeReportSelection({
      departmentName: department,
      subDepartmentName: subDepartment,
      typeName: reportType,
    });
    const schedule = {
      id: editingScheduleId || `${Date.now()}`,
      name: scheduleReportName.trim() || `${canonicalReport.subDepartment} - ${canonicalReport.reportType}`,
      department: canonicalReport.department,
      subDepartment: canonicalReport.subDepartment,
      reportType: canonicalReport.reportType,
      startDate,
      endDate,
      dateFilterActive,
      frequency: scheduleFrequency,
      weekday: scheduleWeekday,
      monthDay: scheduleMonthDay,
      singleDate: scheduleSingleDate,
      time: scheduleTime,
      hour: scheduleHour,
      minute: scheduleMinute,
      meridiem: scheduleMeridiem,
      sendToMe,
      sendToOthers,
      recipientUserIds: selectedScheduleUserIds,
      recipientUsers: selectedScheduleUsers.map((user) => ({
        id: getUserId(user),
        name: getUserName(user),
        email: getUserEmail(user),
      })),
      selectedFields,
      ownerKey: reportOwnerKey,
      ownerEmail: sendToMeEmail,
      active: editingScheduleId
        ? scheduledReports.find((scheduleItem) => getScheduleRecordId(scheduleItem) === editingScheduleId)?.active ?? true
        : true,
      createdAt: editingScheduleId
        ? scheduledReports.find((scheduleItem) => getScheduleRecordId(scheduleItem) === editingScheduleId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const scheduleRows = await loadScheduleRows(schedule);
      const scheduleMailRequest = buildScheduleMailPayload(schedule, scheduleRows);
      const saveResult = await saveReportScheduleAPI({
        schedule,
        mailPayload: scheduleMailRequest.mailPayload,
        editing: Boolean(editingScheduleId),
        ownerKey: reportOwnerKey,
      });
      const savedSchedule = saveResult?.schedule || saveResult?.data?.schedule || saveResult?.data || saveResult || schedule;

      setScheduledReports((currentSchedules) =>
        editingScheduleId
          ? currentSchedules.map((scheduleItem) =>
              getScheduleRecordId(scheduleItem) === editingScheduleId ? savedSchedule || schedule : scheduleItem
            )
          : [savedSchedule || schedule, ...currentSchedules]
      );
      closeScheduleModal();
      emitGlobalSuccessModal({ message: saveResult?.message || "Schedule saved", status: 200 });
    } catch (saveError) {
      emitGlobalFailureModal({
        message: saveError?.response?.data?.message || saveError.message || "Schedule could not be saved.",
      });
    }
  };

  const handleSendScheduledReport = async (schedule) => {
    const sendKey = getScheduleRecordId(schedule);
    if (!sendKey || sendingScheduleKeysRef.current.has(sendKey)) return;
    if (sendingScheduleId) return;

    if (!schedule.active) {
      emitGlobalFailureModal({ message: "Activate the schedule before sending the report." });
      return;
    }

    const shouldSendMail =
      (schedule.sendToMe && sendToMeEmail) ||
      (schedule.sendToOthers && schedule.recipientUsers?.some((user) => user.email));

    if (!shouldSendMail) {
      emitGlobalFailureModal({ message: "Select at least one report recipient with an email address before sending." });
      return;
    }

    sendingScheduleKeysRef.current.add(sendKey);
    setSendingScheduleId(sendKey);

    try {
      const scheduleRows = await loadScheduleRows(schedule);
      const scheduleMailRequest = buildScheduleMailPayload(schedule, scheduleRows);
      const sendResult = await sendStoredReportScheduleAPI(
        sendKey,
        scheduleMailRequest
      );

      if (sendResult?.deleted || schedule.frequency === "Single Time") {
        setScheduledReports((currentSchedules) =>
          currentSchedules.filter((scheduleItem) => getScheduleRecordId(scheduleItem) !== sendKey)
        );
      } else if (sendResult?.schedule) {
        setScheduledReports((currentSchedules) =>
          currentSchedules.map((scheduleItem) =>
            getScheduleRecordId(scheduleItem) === sendKey ? sendResult.schedule : scheduleItem
          )
        );
      }

      const acceptedCount = Array.isArray(sendResult?.accepted)
        ? sendResult.accepted.length
        : Array.isArray(sendResult?.to)
          ? sendResult.to.length
          : scheduleMailRequest.mailPayload.to.length;
      emitGlobalSuccessModal({
        message:
          sendResult?.message ||
          `Mail sent successfully to ${acceptedCount} recipient${acceptedCount === 1 ? "" : "s"}.`,
        status: 200,
      });
    } catch (mailError) {
      emitGlobalFailureModal({
        message: mailError.message || "Schedule email could not be sent.",
      });
    } finally {
      sendingScheduleKeysRef.current.delete(sendKey);
      setSendingScheduleId("");
    }
  };

  const toggleScheduleStatus = async (scheduleId) => {
    const currentSchedule = scheduledReports.find((schedule) => getScheduleRecordId(schedule) === scheduleId);
    if (!currentSchedule) return;

    try {
      const toggleResult = await toggleReportScheduleAPI(scheduleId, !currentSchedule.active);
      const updatedSchedule = toggleResult?.schedule || toggleResult?.data?.schedule || toggleResult?.data || toggleResult;
      setScheduledReports((currentSchedules) =>
        currentSchedules.map((schedule) =>
          getScheduleRecordId(schedule) === scheduleId ? updatedSchedule || { ...schedule, active: !schedule.active } : schedule
        )
      );
      emitGlobalSuccessModal({ message: toggleResult?.message || "Schedule status updated", status: 200 });
    } catch (toggleError) {
      emitGlobalFailureModal({
        message: toggleError?.response?.data?.message || toggleError.message || "Schedule status could not be updated.",
      });
    }
  };

  const deleteSchedule = async (scheduleId) => {
    try {
      await deleteReportScheduleAPI(scheduleId);
      setScheduledReports((currentSchedules) =>
        currentSchedules.filter((schedule) => getScheduleRecordId(schedule) !== scheduleId)
      );
      notifyAdminAction({
        title: "Report schedule deleted",
        body: "A scheduled report was deleted.",
      });
    } catch (deleteError) {
      emitGlobalFailureModal({
        message: deleteError?.response?.data?.message || deleteError.message || "Schedule could not be deleted.",
      });
    }
  };

  const getScheduleTiming = (schedule) => {
    if (schedule.frequency === "Single Time") return `Once on ${toDisplayDate(schedule.singleDate)} at ${schedule.time}`;
    if (schedule.frequency === "Daily") return `Daily at ${schedule.time}`;
    if (schedule.frequency === "Monthly") return `Monthly on day ${schedule.monthDay || 1} at ${schedule.time}`;
    return `Weekly on ${schedule.weekday} at ${schedule.time}`;
  };

  const getScheduleRecipient = (schedule) => {
    const recipientNames = Array.isArray(schedule.recipientUsers)
      ? schedule.recipientUsers.map((user) => user?.name).filter(Boolean)
      : [];
    const recipients = [
      ...(schedule.sendToMe ? ["Self"] : []),
      ...recipientNames,
    ];

    return recipients.length ? recipients.join(", ") : "No recipients";
  };

  const exportRows = filteredRows;
  const activeReportDisplay = normalizeReportSelection({
    departmentName: department,
    subDepartmentName: subDepartment,
    typeName: reportType,
  });
  const activeReportDisplayText = `${activeReportDisplay.department} / ${activeReportDisplay.subDepartment} / ${activeReportDisplay.reportType}`;

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

  const handleExportCsv = () => {
    downloadFile("report.csv", buildCsv(), "text/csv;charset=utf-8");
    notifyAdminAction({
      title: "Report CSV exported",
      body: `${activeReportDisplayText} report was exported as CSV.`,
    });
  };

  const handleExportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Spintelligence";
      const sheet = workbook.addWorksheet("Report");
      const fields = selectedFields.length ? selectedFields : [{ key: "__report_data", label: "Report Data" }];
      const currentDateLabel = new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const currentTimeLabel = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(new Date());
      const reportDateLabel = `${startDate || "-"}${endDate && endDate !== startDate ? ` - ${endDate}` : ""}`;

      sheet.addRow([
        "Department :",
        activeReportDisplay.department || "-",
        "",
        "Selected Date :",
        reportDateLabel || "-",
      ]);
      sheet.addRow([
        "Sub-department :",
        activeReportDisplay.subDepartment || "-",
        "",
        "Current Date :",
        currentDateLabel || "-",
      ]);
      sheet.addRow([
        "Notebook Type :",
        activeReportDisplay.reportType || "-",
        "",
        "Current Time :",
        currentTimeLabel || "-",
      ]);
      sheet.addRow([]);
      sheet.addRow(fields.map((field) => field.label));
      if (exportRows.length && selectedFields.length) {
        exportRows.forEach((row) => {
          sheet.addRow(fields.map((field) => getCellValue(row, field)));
        });
      } else {
        sheet.addRow(["No report details found."]);
      }

      [1, 2, 3, 5].forEach((rowNumber) => {
        sheet.getRow(rowNumber).font = { bold: true };
      });
      sheet.getRow(4).height = 4;
      sheet.columns = [
        { width: 18 },
        { width: 28 },
        { width: 6 },
        { width: 18 },
        { width: 28 },
        ...fields.map((field) => ({
          width: Math.min(Math.max(String(field.label).length + 4, 16), 36),
        })),
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      downloadFile("report.xlsx", buffer, XLSX_MIME);
    } catch (error) {
      emitGlobalFailureModal({
        message: error.message || "Excel export failed.",
      });
    }
  };

  const handleExportPdf = () => {
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;
    const currentDateLabel = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const currentTimeLabel = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date());
    popup.document.write(`
      <html>
        <head>
          <title>Report</title>
          <style>
            @page { size: landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #14213d; }
            h1 { font-size: 20px; margin: 0 0 16px; }
            .meta {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 18px;
              margin-bottom: 14px;
              font-size: 11px;
              color: #344054;
            }
            .meta-col {
              display: grid;
              gap: 4px;
              align-content: start;
            }
            .meta strong { color: #101828; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
            th, td {
              border: 1px solid #d7dee9;
              padding: 7px;
              text-align: left;
              vertical-align: top;
              overflow-wrap: anywhere;
              word-break: break-word;
              white-space: normal;
            }
            th {
              background: #f6f8fb;
              color: #6f87a8;
              font-size: 12px;
              font-weight: 600;
              letter-spacing: 0;
            }
            tr { break-inside: avoid; page-break-inside: avoid; }
          </style>
        </head>
        <body>
          <h1>Report</h1>
          <section class="meta">
            <div class="meta-col">
              <div><strong>Dept:</strong> ${escapeHtmlText(activeReportDisplay.department)}</div>
              <div><strong>Sub-Dept:</strong> ${escapeHtmlText(activeReportDisplay.subDepartment)}</div>
              <div><strong>Type:</strong> ${escapeHtmlText(activeReportDisplay.reportType)}</div>
            </div>
            <div class="meta-col">
              <div><strong>Selected Date:</strong> ${escapeHtmlText(startDate)} - ${escapeHtmlText(endDate)}</div>
              <div><strong>Current Date:</strong> ${escapeHtmlText(currentDateLabel)}</div>
              <div><strong>Current Time:</strong> ${escapeHtmlText(currentTimeLabel)}</div>
            </div>
          </section>
          <table>
            <thead><tr>${selectedFields.map((field) => `<th>${escapeHtmlText(field.label)}</th>`).join("")}</tr></thead>
            <tbody>${exportRows
              .map(
                (row) =>
                  `<tr>${selectedFields.map((field) => `<td>${escapeHtmlText(getCellValue(row, field))}</td>`).join("")}</tr>`
              )
              .join("")}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
    notifyAdminAction({
      title: "Report PDF exported",
      body: `${activeReportDisplayText} report was exported as PDF.`,
    });
  };

  return (
    <main className={styles.page}>
      <nav className={styles.reportTabs} aria-label="Report views">
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
      </nav>

      {activeReportTab === "generate" ? (
        <>
          <section className={styles.filterCard}>
            <div className={styles.filterHeading}>
              <h1>Reports</h1>
              <p>Generate and schedule input task reports</p>
            </div>
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
                    const nextSubDepartments = isAnalysisDepartment(nextDepartment)
                      ? getStatisticsSubDepartmentOptions()
                      : Object.keys(accessibleReportSources[nextDepartment] || {});
                    const nextSubDepartment = nextSubDepartments[0] || "";
                    const nextReportTypes = isAnalysisDepartment(nextDepartment)
                      ? Object.keys(accessibleReportSources[nextDepartment]?.[TEAM_PERFORMANCE_SUB_DEPARTMENT] || {})
                      : Object.keys(accessibleReportSources[nextDepartment]?.[nextSubDepartment] || {});
                    const nextReportType = nextReportTypes[0] || "";

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
                    setReportType(
                      isTeamPerformanceReport
                        ? TEAM_PERFORMANCE_REPORT_TYPE
                        : Object.keys(accessibleReportSources[department]?.[nextSubDepartment] || {})[0] || ""
                    );
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
                  {reportTypes.length ? (
                    reportTypes.map((option) => (
                      <option key={option}>{option}</option>
                    ))
                  ) : (
                    <option value="">No type available</option>
                  )}
                </select>
                <FiChevronDown />
              </label>
              <>
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
              </>
            </div>
          </section>

          <section className={styles.contentGrid}>
            <aside className={styles.availableCard}>
              <h2>
                <strong>{activeReportDisplay.subDepartment}</strong> - {activeReportDisplay.reportType}
              </h2>
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
              <p>
                Drag to reorder, click X to remove · {filteredRows.length}{" "}
                {filteredRows.length === 1 ? "entry" : "entries"} loaded
              </p>
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
                    {!loading && selectedFields.length === 0 ? (
                      <tr>
                        <td colSpan={1}>Drag fields from Available Fields to preview the report.</td>
                      </tr>
                    ) : null}
                    {selectedFields.length > 0
                      ? filteredRows.map((row, rowIndex) => (
                          <tr key={row?.id || row?.qc_id || row?.param_id || rowIndex}>
                            {selectedFields.map((field) => (
                              <td key={field.key}>{getCellValue(row, field)}</td>
                            ))}
                          </tr>
                        ))
                      : null}
                    {!loading && selectedFields.length > 0 && filteredRows.length === 0 ? (
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
          </div>

          <div className={styles.scheduledList}>
            {scheduledReports.length ? (
              scheduledReports.map((schedule) => {
                const scheduleId = getScheduleRecordId(schedule);
                const displaySchedule = normalizeReportSchedule(schedule);

                return (
                <div className={styles.scheduledItem} key={scheduleId}>
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
                      <span><FiFilter /> {displaySchedule.department} / {displaySchedule.subDepartment} / {displaySchedule.reportType}</span>
                    </div>
                  </div>
                  <div className={styles.scheduledActions}>
                    <button
                      type="button"
                      aria-label="Send report"
                      disabled={!schedule.active || sendingScheduleId === scheduleId}
                      onClick={() => handleSendScheduledReport(schedule)}
                    >
                      <FiSend />
                    </button>
                    <button
                      type="button"
                      aria-label={schedule.active ? "Pause report" : "Activate report"}
                      onClick={() => toggleScheduleStatus(scheduleId)}
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
                      onClick={() => deleteSchedule(scheduleId)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                );
              })
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
                  {frequencyOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <FiChevronDown />
              </div>
            </label>

            <div className={styles.modalTwoColumns}>
              <label className={styles.modalField}>
                <span>
                  {scheduleFrequency === "Monthly"
                    ? "Date"
                    : scheduleFrequency === "Single Time"
                      ? "Date"
                      : "Weekday"}
                </span>
                {scheduleFrequency === "Single Time" ? (
                  <input
                    type="date"
                    value={scheduleSingleDate}
                    onChange={(event) => setScheduleSingleDate(event.target.value)}
                  />
                ) : (
                  <div className={styles.modalSelectWrap}>
                    {scheduleFrequency === "Monthly" ? (
                      <select value={scheduleMonthDay} onChange={(event) => setScheduleMonthDay(event.target.value)}>
                        {monthDayOptions.map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={scheduleFrequency === "Daily" ? "Every day" : scheduleWeekday}
                        disabled={scheduleFrequency === "Daily"}
                        onChange={(event) => setScheduleWeekday(event.target.value)}
                      >
                        {scheduleFrequency === "Daily" ? (
                          <option>Every day</option>
                        ) : (
                          weekdayOptions.map((option) => <option key={option}>{option}</option>)
                        )}
                      </select>
                    )}
                    <FiChevronDown />
                  </div>
                )}
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
              <span className={styles.sendToLabel}>Sent To</span>
              <label>
                <input
                  type="checkbox"
                  checked={sendToMe}
                  onChange={(event) => setSendToMe(event.target.checked)}
                />
                <span>Send to me</span>
              </label>
              <div className={styles.sendToRecipientRow}>
                <label>
                  <input
                    type="checkbox"
                    checked={sendToOthers}
                    onChange={(event) => {
                      setSendToOthers(event.target.checked);
                    }}
                  />
                  <span>Send to</span>
                </label>
                <div className={styles.recipientDropdown} ref={recipientDropdownRef}>
                  <button
                    type="button"
                    className={styles.recipientDropdownButton}
                    onClick={() => setRecipientDropdownOpen((isOpen) => !isOpen)}
                  >
                    <span>{selectedRecipientLabel}</span>
                    <FiChevronDown />
                  </button>
                  {recipientDropdownOpen ? (
                    <div className={styles.recipientDropdownMenu}>
                      {scheduleUsers.length ? (
                        scheduleUsers.map((user) => {
                          const userId = getUserId(user);
                          return (
                            <label key={userId}>
                              <input
                                type="checkbox"
                                checked={selectedScheduleUserIds.includes(userId)}
                                onChange={() => toggleScheduleRecipient(userId)}
                              />
                              <span>{getUserName(user)}</span>
                            </label>
                          );
                        })
                      ) : (
                        <p>No users found</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button type="button" onClick={closeScheduleModal}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.createScheduleButton}
                onClick={handleSaveSchedule}
              >
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
