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
import { fetchSubmittedNotebooksApi } from "@/apis/submittedNotebooksApi";
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
  fetchAutoconerCspParameterEntriesForReport,
  fetchAutoconerQualityParameterEntriesForReport,
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
  fetchWrappingCardingNotebookEntries,
  getCardingProcessParameterEntries,
} from "@/apis/carding";
import { fetchComberUqcEntries } from "@/apis/comber";
import {
  fetchDrawFrameCotsEntries,
  fetchDrawFrameUqcEntries,
  fetchDrawFrameBreakerProcessParameterEntries,
  fetchDrawFrameFinisherProcessParameterEntries,
} from "@/apis/draw-frame";
import {
  fetchMixingAfisEntries,
  fetchMixingAfis6CottonEntries,
  fetchMixingAfis6MmfEntries,
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
  fetchSimplexWheelChangeEntries,
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

const fetchBrWasteStudyRowsByType = async (studyType) => {
  const rows = await fetchEndpointRows("/blowroom/br-waste-study");
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => row?.study_type === studyType
  );
};

const fetchCardWasteStudyRowsByType = async (studyType) => {
  const rows = await fetchEndpointRows("/carding/card-waste-study");
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => row?.study_type === studyType
  );
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
      "AFIS-6 Cotton": { fetcher: fetchMixingAfis6CottonEntries },
      "AFIS-6 MMF": { fetcher: fetchMixingAfis6MmfEntries },
      "Moisture Data Entry": { fetcher: fetchMixingMoistureEntries },
      "Openness Data Entry": { fetcher: fetchMixingOpennessEntries },
    },
    "Blow Room": {
      "Blow Room Sync": { endpoint: "/blowroom/sync" },
      "Process Parameter": { fetcher: fetchBlowroomProcessParametersApi },
      "BR Waste Study T-1": { fetcher: fetchBrWasteStudyRowsByType.bind(null, "Type 1") },
      "BR Waste Study T-2": { fetcher: fetchBrWasteStudyRowsByType.bind(null, "Type 2") },
      "BR Waste Study T-3": { fetcher: fetchBrWasteStudyRowsByType.bind(null, "Type 3") },
      "Drop Test Data Entry": { fetcher: fetchEndpointRows.bind(null, "/blowroom/drop-test") },
      "B/R CV1M Data Entry Within Lap": { endpoint: "/blowroom/within-lap-cv" },
      "B/R Between Lap CV%": { endpoint: "/blowroom/between-lap-cv" },
    },
    Carding: {
      "Process Parameter": { fetcher: getCardingProcessParameterEntries },
      "Between & Within Card Data Entry": { endpoint: "/carding/between-within-card" },
    "Thick place & CV": { endpoint: "/carding/card-thick-place" },
      "Carding NRE%": { endpoint: "/carding/nre" },
      "Nati Data Entry": { endpoint: "/carding/nati-data-entry" },
      "U% Data Entry": { fetcher: fetchCardingUqcEntries },
      "Card DFK Data": { fetcher: fetchCardingDfkPressureEntries },
      WheelChange: { fetcher: fetchCardingChangeControlEntries },
      "Card Waste Study T-1": { fetcher: fetchCardWasteStudyRowsByType.bind(null, "Type 1") },
      "Card Waste Study T-2": { fetcher: fetchCardWasteStudyRowsByType.bind(null, "Type 2") },
      "Card Waste Study T-3": { fetcher: fetchCardWasteStudyRowsByType.bind(null, "Type 3") },
    },
    "Individual Card Performance": {
      "Individual Card performance Data": { endpoint: "/carding/trials" },
    },
    Comber: {
      "Ribbon Lap CV1M Data Entry": { endpoint: "/comber/lap-cv" },
      "Nati Data Entry": { endpoint: "/comber/nati-data-entry" },
      "U% Data Entry": { fetcher: fetchComberUqcEntries },
      "Comber NRE%": { endpoint: "/comber/nre" },
      "Comber Efficiency": { endpoint: "/comber/efficiency" },
      "Comber Nolis %": { endpoint: "/drawframe/wrapping/comber-noil-percent" },
    },
    "Draw Frame": {
      "1 Yard / Half Yard CV Entry": { endpoint: "/drawframe/yarn-cv" },
      "Draw Frame Cots Data Entry": { fetcher: fetchDrawFrameCotsEntries },
      "U% Data Entry": { fetcher: fetchDrawFrameUqcEntries },
      "A%": { endpoint: "/drawframe/a-percent" },
      "Wheel Change Type-1 (SB20)": { endpoint: "/drawframe/wheel-change/type1" },
      "Wheel Change Type-2 (TD7)": { endpoint: "/drawframe/wheel-change/type2" },
      "Wheel Change Type-3 (TD9)": { endpoint: "/drawframe/wheel-change/type3" },
      "Wheel Change Type-1 (LRSB)": { endpoint: "/drawframe/wheel-change/finisher-type1-lrsb" },
      "Wheel Change Type-2 (D40)": { endpoint: "/drawframe/wheel-change/type2-d40" },
      "Wheel Change Type-3 (D50/D55)": { endpoint: "/drawframe/wheel-change/type3-d50-d55" },
      "Wheel Change Type-4 (LDF3S)": { endpoint: "/drawframe/wheel-change/type4-ldf3s" },
    },
    Simplex: {
      "Process Parameter": { fetcher: fetchSimplexProcessParameterEntries },
      "SMXCots Change Data Entry": { fetcher: fetchSimplexCotsChangeEntries },
      "SMX Breaks Study Report": { fetcher: fetchSimplexStudyReportEntries },
      "U% Data Entry": { fetcher: fetchSimplexUqcEntries },
      "Wheel Change": { fetcher: fetchSimplexWheelChangeEntries },
      "Stretch %": { endpoint: "/drawframe/stretch-percent" },
    },
    Spinning: {
      "Process Parameter": { fetcher: getSpinningProcessParameterEntries },
      "COTS Checking": { endpoint: "/spinning/cots-checking" },
      "Count Change": { endpoint: "/spinning/count-change" },
      "Ring Frame Log Book": { endpoint: "/spinning/ring-frame" },
      "Speed Checking": { endpoint: "/spinning/speed-checking" },
      "Bottom Apron Checking": { endpoint: "/spinning/bottom-apron-checking" },
      "Lycra Out of Centering": { endpoint: "/spinning/lycra-centering" },
      "RSM & Lycrasensor Checking Online": { endpoint: "/spinning/rsm-lycra-online" },
      "RSM & Lycrasensor Checking Offline": { endpoint: "/spinning/rsm-lycra-offline" },
      "Wheel Change Type-1": { endpoint: "/spinning/wheel-change/type1" },
      "Wheel Change Type-2": { endpoint: "/spinning/wheel-change/type2" },
      "Wheel Change Type-3": { endpoint: "/spinning/wheel-change/type3" },
      "Wheel Change Type-4": { endpoint: "/spinning/wheel-change/type4" },
    },
    Autoconer: {
      "Process Parameter": { fetcher: fetchAutoconerProcessParameters },
      "PP - Autoconer Q2": { fetcher: fetchAutoconerQ2Entries },
      "PP - Autoconer Q3": { fetcher: fetchAutoconerQ3Entries },
      "Rewinding Study": { fetcher: fetchAutoconerRewindingStudy },
      "Cone Density": { fetcher: fetchAutoconerConeDensity },
      "Cone Packing Audit": { fetcher: fetchAutoconerConePackingAudit },
      "Lycra % Checking": { fetcher: fetchAutoconerLycraChecking },
      "Count Wise Cuts Record": { fetcher: fetchAutoconerCountWiseCuts },
      "Splice Strength": { fetcher: fetchAutoconerSpliceStrength },
      "Drum wise Appearance": { fetcher: fetchAutoconerDrumWise },
      "CSP Parameter Entries": { fetcher: fetchAutoconerCspParameterEntriesForReport },
      "U% Parameter Entries": { fetcher: fetchAutoconerQualityParameterEntriesForReport },
    },
    Wrapping: {
      Carding: { fetcher: fetchWrappingCardingNotebookEntries },
      Drawing: { endpoint: "/drawframe/wrapping-drawframe-notebook" },
      Simplex: { endpoint: "/simplex/wrapping-simplex-notebook" },
    },
  },
};

// Backend-supplied fields (builderOptions.input_fields) can include generic fields that aren't
// specific to any screen's actual form (e.g. a catch-all "Inspection Date"). Hide these from
// every screen's available fields list in Custom Report.
const globallyExcludedReportFields = ["Inspection Date", "Crimp", "Date"];

const reportTypeUsageCount = (() => {
  const counts = new Map();
  Object.values(reportSources).forEach((subDepartmentMap) => {
    Object.values(subDepartmentMap).forEach((typeMap) => {
      Object.keys(typeMap).forEach((typeName) => {
        counts.set(typeName, (counts.get(typeName) || 0) + 1);
      });
    });
  });
  return counts;
})();

// A handful of type names (e.g. "Process Parameter") are reused across unrelated departments
// with different field sets in the threshold field catalog. Names unique to a single
// department/sub-department combination can be trusted outright.
const isAmbiguousReportType = (typeName) => (reportTypeUsageCount.get(typeName) || 0) > 1;

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
  // Build the day-month-year string manually (e.g. "20-08-2026") rather than relying on
  // toLocaleDateString, whose output format depends on the runtime's ICU/locale data.
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
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
    const flatKeys = Object.keys(flatSource);
    const exactKey = flatKeys.find((rowKey) => normalizeLookupKey(rowKey) === normalizedTarget);
    const fuzzyKey = flatKeys.find((rowKey) => {
      const normalizedRowKey = normalizeLookupKey(rowKey);
      return normalizedRowKey.includes(normalizedTarget) || normalizedTarget.includes(normalizedRowKey);
    });
    const matchedKey = exactKey || fuzzyKey;
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

const extractResponseRows = (response) =>
  Array.isArray(response)
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

const normalizeRows = (response) => expandNestedRows(extractResponseRows(response));

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

const fetchAllReportRows = async (reportFetcher, baseParams = {}, extractRows = normalizeRows) => {
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
    const pageRows = extractRows(response);
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

// Draw Frame's "A%" notebook stores 10 sample rows + 7 named summary rows in a single flat
// array (each shaped { sampleNo, nMinus1, n, nPlus1 }), rather than as top-level fields. Custom
// Report needs one column per (row label) x (N-1/N/N+1) combination — synthesize those from the
// catalog's "<Label> - <Column>" field names by looking up the matching row in that array.
const A_PERCENT_SUMMARY_LABELS = ["Average Weight", "Weight (Max)", "Weight (Min)", "Range", "Hank", "SD", "CV"];
const A_PERCENT_ROW_COLUMN_KEYS = { "N-1": "nMinus1", N: "n", "N+1": "nPlus1" };

const parseAPercentFieldLabel = (label) => {
  const match = String(label || "").match(/^(.*)\s-\s(N-1|N\+1|N)$/);
  if (!match) return null;
  const rowLabel = match[1].trim();
  const columnKey = A_PERCENT_ROW_COLUMN_KEYS[match[2]];
  const sampleMatch = rowLabel.match(/^Sample\s+(\d+)$/i);
  const sampleNo = sampleMatch ? sampleMatch[1] : A_PERCENT_SUMMARY_LABELS.includes(rowLabel) ? rowLabel : null;
  return sampleNo ? { sampleNo, columnKey } : null;
};

const getAPercentRowsArray = (row) => {
  const candidates = [row?.rows, row?.manual_json, row?.ocr_json];
  return candidates.find((list) => Array.isArray(list) && list.length) || [];
};

const getAPercentTableValue = (row, fieldLabel) => {
  const parsed = parseAPercentFieldLabel(fieldLabel);
  if (!parsed) return undefined;
  const match = getAPercentRowsArray(row).find(
    (item) => normalizeLookupKey(item?.sampleNo) === normalizeLookupKey(parsed.sampleNo)
  );
  return match ? match[parsed.columnKey] : undefined;
};

// Simplex's "SMXCots Change Data Entry" saves its 14 damage/status checks as a single `items`
// array (each shaped { item_name, status_value }) describing one entry, not 14 separate
// records. Custom Report needs one column per item label — look each one up by item_name.
const SMX_COTS_CHANGE_ITEM_LABELS = [
  "Front Cots Damage",
  "Third Cots Damage",
  "Back Cots Damage",
  "Apron Damage",
  "Front Cots Tilting",
  "Second Cots Tilting",
  "Third Cots Tilting",
  "Back Cots Tilting",
  "Cradle Lifting",
  "Floating Condensor Missing",
  "Middle Condensor Missing",
  "Back Condensor Missing",
  "Others 1",
  "Others 2",
];

const getSmxCotsChangeItemValue = (row, fieldLabel) => {
  if (!SMX_COTS_CHANGE_ITEM_LABELS.includes(fieldLabel)) return undefined;
  const items = Array.isArray(row?.items) ? row.items : [];
  const match = items.find((item) => normalizeLookupKey(item?.item_name) === normalizeLookupKey(fieldLabel));
  return match ? match.status_value : undefined;
};

// Simplex's "SMX Breaks Study Report" saves a 13 (length range) x 9 (break type) matrix as one
// `items` array, each shaped { item_name: <break type>, length_range: <e.g. "0 - 200">,
// status_value }. Custom Report needs one column per (length range x break type) cell —
// generated as catalog labels like "Length 0-200 - Roving Breaks at Finger".
const SMX_BREAKS_STUDY_COLUMNS = [
  "Roving Breaks at Finger",
  "Roving Breaks at Front Roller Nip",
  "Roving Breaks at Between Flyer",
  "Undraft",
  "Top Roller Lapping",
  "Bottom Roller Lapping",
  "SLIVER BREAKS",
  "Can Exhaust",
  "Unknown Stop",
];

const parseSmxBreaksStudyFieldLabel = (label) => {
  const match = String(label || "").match(/^Length\s+(\S+)\s-\s(.+)$/);
  if (!match) return null;
  const columnLabel = match[2].trim();
  return SMX_BREAKS_STUDY_COLUMNS.includes(columnLabel) ? { lengthRange: match[1], columnLabel } : null;
};

const getSmxBreaksStudyCellValue = (row, fieldLabel) => {
  const parsed = parseSmxBreaksStudyFieldLabel(fieldLabel);
  if (!parsed) return undefined;
  const items = Array.isArray(row?.items) ? row.items : [];
  const match = items.find(
    (item) =>
      normalizeLookupKey(item?.item_name) === normalizeLookupKey(parsed.columnLabel) &&
      normalizeLookupKey(item?.length_range) === normalizeLookupKey(parsed.lengthRange)
  );
  return match ? match.status_value : undefined;
};

// Simplex's "Stretch %" notebook stores a dynamic number of tables (each with its own meta
// fields + samples[] + summaries[] arrays) under one `tables` array — one PDF can OCR into any
// number of tables/sample rows, so Custom Report generates a capped set of columns like
// "Table 1 - Test ID", "Table 1 - Sample 2 - Initial Bobbin", "Table 1 - Summary Hank - Full
// Bobbin" (see fieldCatalog.js's "Stretch %" entry) and this resolves each back to the matching
// table/sample/summary in the row's `tables` array.
const STRETCH_TABLE_META_KEYS = {
  "Test ID": "test_id",
  "Total Test": "total_test",
  "Number of Entries (N)": "number_of_entries",
  Length: "length",
  Tester: "tester",
  "Std. Stretch %": "std_stretch_percent",
  "Stretch %": "stretch_percent",
  Remark: "remark",
};

const parseStretchFieldLabel = (label) => {
  const text = String(label || "");
  let match = text.match(/^Table\s+(\d+)\s-\s(Test ID|Total Test|Number of Entries \(N\)|Length|Tester|Std\. Stretch %|Stretch %|Remark)$/);
  if (match) return { tableNo: match[1], kind: "meta", metaKey: STRETCH_TABLE_META_KEYS[match[2]] };

  match = text.match(/^Table\s+(\d+)\s-\sSample\s+(\d+)\s-\s(Initial Bobbin|Full Bobbin)$/);
  if (match) return { tableNo: match[1], kind: "sample", sampleNo: match[2], column: match[3] };

  match = text.match(/^Table\s+(\d+)\s-\sSummary\s+(.+)\s-\s(Initial Bobbin|Full Bobbin)$/);
  if (match) return { tableNo: match[1], kind: "summary", summaryLabel: match[2], column: match[3] };

  return null;
};

const getStretchTableRow = (row, tableNo) => {
  const tables = Array.isArray(row?.tables) ? row.tables : [];
  return tables.find((table) => normalizeLookupKey(table?.table_no) === normalizeLookupKey(tableNo));
};

const getStretchTableValue = (row, fieldLabel) => {
  const parsed = parseStretchFieldLabel(fieldLabel);
  if (!parsed) return undefined;
  const table = getStretchTableRow(row, parsed.tableNo);
  if (!table) return undefined;

  if (parsed.kind === "meta") return table[parsed.metaKey];

  const columnKey = parsed.column === "Initial Bobbin" ? "initial_bobbin" : "full_bobbin";
  if (parsed.kind === "sample") {
    const samples = Array.isArray(table.samples) ? table.samples : [];
    const match = samples.find((sample) => normalizeLookupKey(sample?.sample_no) === normalizeLookupKey(parsed.sampleNo));
    return match ? match[columnKey] : undefined;
  }

  const summaries = Array.isArray(table.summaries) ? table.summaries : [];
  const match = summaries.find((summary) => normalizeLookupKey(summary?.label) === normalizeLookupKey(parsed.summaryLabel));
  return match ? match[columnKey] : undefined;
};

// Autoconer's "Drum wise Appearance" saves per-drum ok/not-ok flags as a `drum_inspections`
// array, not a single "Appearance" value — sum across drums for a meaningful per-entry total.
const DRUM_WISE_APPEARANCE_FIELD_KEYS = {
  "Appearance OK Count": "appearance_ok_count",
  "Appearance Not OK Count": "appearance_not_ok_count",
};

const getDrumWiseAppearanceCount = (row, fieldLabel) => {
  const countKey = DRUM_WISE_APPEARANCE_FIELD_KEYS[fieldLabel];
  if (!countKey) return undefined;
  const inspections = Array.isArray(row?.drum_inspections) ? row.drum_inspections : [];
  if (!inspections.length) return undefined;
  return inspections.reduce((sum, item) => sum + (Number(item?.[countKey]) || 0), 0);
};

const OPERATOR_FIELD_KEY = "operator";
const OPERATOR_FIELD = { key: OPERATOR_FIELD_KEY, label: "Operator" };
const ENTRY_ID_FIELD = { key: "Entry ID", label: "Entry ID" };

const normalizeEntryKey = (value) => String(value ?? "").trim().toLowerCase();

// Priority order: try each candidate key (case/format-insensitive) in turn, and only move on to
// the next if the found value is missing/empty — an empty `entry_id` shouldn't block falling
// back to a distinct, non-empty `id` field (an empty string is not nullish, so `??` chaining
// alone would get stuck on it).
const ENTRY_KEY_CANDIDATES = ["entry_id", "entryid", "lot_no", "lotno", "id"];

const getRowEntryKey = (row) => {
  const rowKeys = Object.keys(row || {});
  for (const candidate of ENTRY_KEY_CANDIDATES) {
    const matchKey = rowKeys.find((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === candidate);
    if (!matchKey) continue;
    const value = row[matchKey];
    if (value !== null && typeof value !== "undefined" && value !== "") return normalizeEntryKey(value);
  }
  return "";
};

const extractSubmittedNotebookRows = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.submitted_notebooks)) return data.submitted_notebooks;
  if (Array.isArray(data?.submittedNotebooks)) return data.submittedNotebooks;
  if (Array.isArray(data?.notebooks)) return data.notebooks;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const getSubmittedNotebookEntryKey = (notebook) =>
  normalizeEntryKey(notebook?.entry_id ?? notebook?.entryId ?? notebook?.lot_no ?? notebook?.lotNo ?? "");

const getSubmittedNotebookOperatorName = (notebook) =>
  String(
    notebook?.operator_name ||
      notebook?.operatorName ||
      notebook?.submitted_by_name ||
      notebook?.submittedByName ||
      ""
  ).trim();

const buildOperatorByEntryKey = (data) => {
  const map = {};
  extractSubmittedNotebookRows(data).forEach((notebook) => {
    const key = getSubmittedNotebookEntryKey(notebook);
    const operatorName = getSubmittedNotebookOperatorName(notebook);
    if (key && operatorName) map[key] = operatorName;
  });
  return map;
};

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
  "1mCV": ["cvm_1m", "im_cvm", "1m_cvm", "one_m_cvm"],
  "3mCV": ["cvm_3m", "m3_cvm", "3m_cvm", "three_m_cvm"],
  "A% (N-1)": ["a_percent_n_minus_1"],
  "A% (N+1)": ["a_percent_n_plus_1"],
  "LHS (Spindle Number)": ["lhs_value"],
  "Number of Readings (N)": ["num_readings"],
  "Created Date": ["inspection_date", "creation_date"],
  "Count": ["count_name"],
  "CVT": ["cvd"],
  "I1": ["l1"],
  "I2": ["l2"],
  "RHS (Spindle Number)": ["rhs_value"],
  "LHS Remarks": ["lhs_textremarks"],
  "RHS Remarks": ["rhs_textremarks"],
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
  "Ratio into size-1.0": ["ratio_size_1", "ratioSize1"],
  "Ratio into size-0.7": ["ratio_size_07", "ratioSize07"],
  "Ratio into size-0.5": ["ratio_size_05", "ratioSize05"],
  "Lot No.": ["lot_no"],
  "Blend-1": ["percentage", "blend"],
  "Merge No.": ["merge_no"],
  "Process Parameter ID": ["entry_id", "param_id", "paramId"],
  "Break Draft": ["breaker_draft", "break_draft"],
  "Scanning Roll Size": ["scanning_rolls_size", "scanning_roll_size"],
  "MC Name": ["machine_name", "mc_name"],
  "Mc. Name": ["mc_name"],
  "SCF(W)<12.70mm": ["sfc_w_percent"],
  "SCF(n)<12.70mm": ["sfc_n_percent"],
  "5%L(n)": ["five_pct_l_n_mm"],
  "50%L(n)": ["fifty_pct_l_n_mm"],
  "Long Fiber >45.60mm": ["long_fiber_gt_45_60_percent"],
  "Long Fiber Count >45.60mm": ["long_fiber_count_gt_45_60"],
  "Run Time (Seconds)": ["value_a"],
  "Idle Time (Seconds)": ["value_b"],
  "Sub Total Time": ["value_c"],
  "Wing Settling 1": ["wing_setting_1"],
  "Wing Settling 2": ["wing_setting_2"],
  "1st Lickerin Speed": ["lickerin_speed_1"],
  "2nd Lickerin Speed": ["lickerin_speed_2"],
  "3rd Lickerin Speed": ["lickerin_speed_3"],
  "Waste KGs %": ["waste_percent", "waste_kgs_percent"],
  "Total Waste KGs %": ["waste_percent"],
  "Overall Waste %": ["overall_percent"],
  "Display Wt.": ["display_weight"],
  "Actual Wt.": ["actual_weight"],
  "Diff (Actual Wt. - Display Wt.)": ["difference"],
  "Ratio (Average Wt. / Total) * 100": ["ratio_percent"],
  "Grams / Meter": ["grams_per_meter"],
  "Standard Deviation": ["std_deviation"],
  "Coefficient of Variation (CV%)": ["cv_percent"],
  "Cylinder Wire Specification - Specs": ["cylinder_specs"],
  "Cylinder Wire Specification - Tonnage in Kgs (1)": ["cylinder_tonnage_1"],
  "Cylinder Wire Specification - Tonnage in Kgs (2)": ["cylinder_tonnage_2"],
  "Doffer Wire Specification - Specs": ["doffer_specs"],
  "Doffer Wire Specification - Tonnage in Kgs (1)": ["doffer_tonnage_1"],
  "Doffer Wire Specification - Tonnage in Kgs (2)": ["doffer_tonnage_2"],
  "Flat Wire Specification - Specs": ["flat_specs"],
  "Flat Wire Specification - Tonnage in Kgs (1)": ["flat_tonnage_1"],
  "Flat Wire Specification - Tonnage in Kgs (2)": ["flat_tonnage_2"],
  "Lickerin Wire Specification - Specs": ["lickerin_specs"],
  "Lickerin Wire Specification - Tonnage in Kgs (1)": ["lickerin_tonnage_1"],
  "Lickerin Wire Specification - Tonnage in Kgs (2)": ["lickerin_tonnage_2"],
  Draft: ["draft_speed"],
  "Card Thick Place Value": ["cv_value"],
  "5m CV": ["cv_5m_value", "cv_5m"],
  "CV in Metres": ["cvm"],
  "1m CV in Metres": ["cvm_1m"],
  "3m CV in Metres": ["cvm_3m"],
  "Feed in mm / Nep": ["feed_mm_per_nep"],
  "50% span length in LAP": ["span_length_50_lap"],
  "50% span length in Sliver": ["span_length_50_sliver"],
  "Combing Efficiency": ["combining_efficiency_formula"],
  "Process Type": ["sub_type"],
  Machine: ["mc_name"],
  "Sliver Monitor": ["silver_worn"],
  "Mass Thick Place": ["main_tin"],
  "AVG (1/2Y)": ["avg_half"],
  "HANK (1/2Y)": ["hank_half"],
  "SD (1/2Y)": ["sd_half"],
  "CV% (1/2Y)": ["cv_half"],
  "Mixing - Existing": ["rows_milling_existing", "rows_mixing_existing", "rows_lrsbMixing_existing", "rows_d40Mixing_existing", "rows_d50Mixing_existing", "rows_ldf3sMixing_existing"],
  "Mixing - Proposed": ["rows_milling_proposed", "rows_mixing_proposed", "rows_lrsbMixing_proposed", "rows_d40Mixing_proposed", "rows_d50Mixing_proposed", "rows_ldf3sMixing_proposed"],
  "Blend % - Existing": ["rows_blendPercent_existing", "rows_lrsbBlendPercent_existing", "rows_d40BlendPercent_existing", "rows_d50BlendPercent_existing", "rows_ldf3sBlendPercent_existing"],
  "Blend % - Proposed": ["rows_blendPercent_proposed", "rows_lrsbBlendPercent_proposed", "rows_d40BlendPercent_proposed", "rows_d50BlendPercent_proposed", "rows_ldf3sBlendPercent_proposed"],
  "Del-Hank - Existing": ["rows_exHank_existing", "rows_delHank_existing", "rows_lrsbDelHank_existing", "rows_d40DelHank_existing", "rows_d50DelHank_existing", "rows_ldf3sDelHank_existing"],
  "Del-Hank - Proposed": ["rows_exHank_proposed", "rows_delHank_proposed", "rows_lrsbDelHank_proposed", "rows_d40DelHank_proposed", "rows_d50DelHank_proposed", "rows_ldf3sDelHank_proposed"],
  "Feed Hank - Existing": ["rows_feedHank_existing", "rows_lrsbFeedHank_existing", "rows_d40FeedHank_existing", "rows_d50FeedHank_existing", "rows_ldf3sFeedHank_existing"],
  "Feed Hank - Proposed": ["rows_feedHank_proposed", "rows_lrsbFeedHank_proposed", "rows_d40FeedHank_proposed", "rows_d50FeedHank_proposed", "rows_ldf3sFeedHank_proposed"],
  "No. of Ends - Existing": ["rows_noOfEnds_existing", "rows_lrsbNoOfEnds_existing", "rows_d40NoOfEnds_existing", "rows_d50NoOfEnds_existing", "rows_ldf3sNoOfEnds_existing"],
  "No. of Ends - Proposed": ["rows_noOfEnds_proposed", "rows_lrsbNoOfEnds_proposed", "rows_d40NoOfEnds_proposed", "rows_d50NoOfEnds_proposed", "rows_ldf3sNoOfEnds_proposed"],
  "Speed - Existing": ["rows_speed_existing", "rows_lrsbSpeed_existing", "rows_d40Speed_existing", "rows_d50Speed_existing", "rows_ldf3sSpeed_existing"],
  "Speed - Proposed": ["rows_speed_proposed", "rows_lrsbSpeed_proposed", "rows_d40Speed_proposed", "rows_d50Speed_proposed", "rows_ldf3sSpeed_proposed"],
  "Draft Constant - Existing": ["rows_draftConstant_existing"],
  "Draft Constant - Proposed": ["rows_draftConstant_proposed"],
  "NW1 - Existing": ["rows_md1_existing", "rows_lrsbNw1_existing", "rows_d40Nw1_existing"],
  "NW1 - Proposed": ["rows_md1_proposed", "rows_lrsbNw1_proposed", "rows_d40Nw1_proposed"],
  "NW2 - Existing": ["rows_md2_existing", "rows_lrsbNw2_existing", "rows_d40Nw2_existing"],
  "NW2 - Proposed": ["rows_md2_proposed", "rows_lrsbNw2_proposed", "rows_d40Nw2_proposed"],
  "Total Draft - Existing": ["rows_totalDraft_existing", "rows_lrsbTotalDraft_existing", "rows_d40TotalDraft_existing", "rows_d50TotalDraft_existing", "rows_ldf3sTotalDraft_existing"],
  "Total Draft - Proposed": ["rows_totalDraft_proposed", "rows_lrsbTotalDraft_proposed", "rows_d40TotalDraft_proposed", "rows_d50TotalDraft_proposed", "rows_ldf3sTotalDraft_proposed"],
  "BDCP (W4 / Break Draft) - Existing": ["rows_bdcp_existing"],
  "BDCP (W4 / Break Draft) - Proposed": ["rows_bdcp_proposed"],
  "Creel Tension (W1VWW2) / Creel Tension Draft - Existing": ["rows_creelTension_existing"],
  "Creel Tension (W1VWW2) / Creel Tension Draft - Proposed": ["rows_creelTension_proposed"],
  "Feed Tension (W8/VEG) / Feed Tension Draft - Existing": ["rows_feedTension_existing"],
  "Feed Tension (W8/VEG) / Feed Tension Draft - Proposed": ["rows_feedTension_proposed"],
  "Web Tension (W3) / Web Tension Draft - Existing": ["rows_webTension_existing"],
  "Web Tension (W3) / Web Tension Draft - Proposed": ["rows_webTension_proposed"],
  "Trumpet - Existing": ["rows_trumpet_existing", "rows_lrsbTrumpet_existing", "rows_d40Trumpet_existing", "rows_d50Trumpet_existing", "rows_ldf3sTrumpet_existing"],
  "Trumpet - Proposed": ["rows_trumpet_proposed", "rows_lrsbTrumpet_proposed", "rows_d40Trumpet_proposed", "rows_d50Trumpet_proposed", "rows_ldf3sTrumpet_proposed"],
  "Bottom Roller Setting Front Zone - Existing": ["rows_bottomRollerFront_existing", "rows_d40BottomRollerFront_existing", "rows_d50BottomRollerFront_existing"],
  "Bottom Roller Setting Front Zone - Proposed": ["rows_bottomRollerFront_proposed", "rows_d40BottomRollerFront_proposed", "rows_d50BottomRollerFront_proposed"],
  "Bottom Roller Setting Back Zone - Existing": ["rows_bottomRollerBack_existing", "rows_d40BottomRollerBack_existing", "rows_d50BottomRollerBack_existing"],
  "Bottom Roller Setting Back Zone - Proposed": ["rows_bottomRollerBack_proposed", "rows_d40BottomRollerBack_proposed", "rows_d50BottomRollerBack_proposed"],
  "Total Draft (Formula) - Existing": ["rows_totalDraftFormula_existing"],
  "Total Draft (Formula) - Proposed": ["rows_totalDraftFormula_proposed"],
  "Total Draft from G1/G2 Combinations - Existing": ["rows_totalDraftGear_existing"],
  "Total Draft from G1/G2 Combinations - Proposed": ["rows_totalDraftGear_proposed"],
  "G1/G2 - Existing": ["rows_g1G2_existing"],
  "G1/G2 - Proposed": ["rows_g1G2_proposed"],
  "BDCP (C4) / Break Draft - Existing": ["rows_bdcp_existing"],
  "BDCP (C4) / Break Draft - Proposed": ["rows_bdcp_proposed"],
  "Web Tension (C3) / Web Tension Draft - Existing": ["rows_webTension_existing"],
  "Web Tension (C3) / Web Tension Draft - Proposed": ["rows_webTension_proposed"],
  "Total Draft Constant - Existing": ["rows_lrsbTotalDraftConstant_existing", "rows_d40TotalDraftConstant_existing"],
  "Total Draft Constant - Proposed": ["rows_lrsbTotalDraftConstant_proposed", "rows_d40TotalDraftConstant_proposed"],
  "Break Draft - Existing": ["rows_lrsbBreakDraft_existing", "rows_breakDraftValue_existing"],
  "Break Draft - Proposed": ["rows_lrsbBreakDraft_proposed", "rows_breakDraftValue_proposed"],
  "Back Roller Pulley Dia (W4) - Existing": ["rows_lrsbBackRollerPulley_existing"],
  "Back Roller Pulley Dia (W4) - Proposed": ["rows_lrsbBackRollerPulley_proposed"],
  "Middle Roller Pulley (VV) - Existing": ["rows_lrsbMiddleRollerPulley_existing"],
  "Middle Roller Pulley (VV) - Proposed": ["rows_lrsbMiddleRollerPulley_proposed"],
  "Creel Tension (W1) / Creel Draft - Existing": ["rows_lrsbCreelTensionDraft_existing", "rows_d40CreelTensionDraft_existing", "rows_d50CreelTensionDraft_existing", "rows_ldf3sCreelTensionDraft_existing"],
  "Creel Tension (W1) / Creel Draft - Proposed": ["rows_lrsbCreelTensionDraft_proposed", "rows_d40CreelTensionDraft_proposed", "rows_d50CreelTensionDraft_proposed", "rows_ldf3sCreelTensionDraft_proposed"],
  "Web Tension Wheel (W3) / Web Tension Draft - Existing": ["rows_lrsbWebTensionDraft_existing", "rows_d40WebTensionDraft_existing", "rows_d50WebTensionDraft_existing", "rows_ldf3sWebTensionDraft_existing"],
  "Web Tension Wheel (W3) / Web Tension Draft - Proposed": ["rows_lrsbWebTensionDraft_proposed", "rows_d40WebTensionDraft_proposed", "rows_d50WebTensionDraft_proposed", "rows_ldf3sWebTensionDraft_proposed"],
  "Bottom Roller Setting Front Zone / Gauge in MM - Existing": ["rows_lrsbBottomRollerFront_existing", "rows_ldf3sBottomRollerFront_existing"],
  "Bottom Roller Setting Front Zone / Gauge in MM - Proposed": ["rows_lrsbBottomRollerFront_proposed", "rows_ldf3sBottomRollerFront_proposed"],
  "Bottom Roller Setting Back Zone / Gauge in MM - Existing": ["rows_lrsbBottomRollerBack_existing", "rows_ldf3sBottomRollerBack_existing"],
  "Bottom Roller Setting Back Zone / Gauge in MM - Proposed": ["rows_lrsbBottomRollerBack_proposed", "rows_ldf3sBottomRollerBack_proposed"],
  "Scanning Roller in mm - Existing": ["rows_lrsbScanningRoller_existing", "rows_d40ScanningRoller_existing", "rows_d50ScanningRoller_existing", "rows_ldf3sScanningRoller_existing"],
  "Scanning Roller in mm - Proposed": ["rows_lrsbScanningRoller_proposed", "rows_d40ScanningRoller_proposed", "rows_d50ScanningRoller_proposed", "rows_ldf3sScanningRoller_proposed"],
  "Scanning Roller Load (kg) - Existing": ["rows_lrsbScanningRollerLower_existing"],
  "Scanning Roller Load (kg) - Proposed": ["rows_lrsbScanningRollerLower_proposed"],
  "Sliver Funnel - Existing": ["rows_lrsbSilverFunnel_existing"],
  "Sliver Funnel - Proposed": ["rows_lrsbSilverFunnel_proposed"],
  "Web Guide Tube Dia - Existing": ["rows_lrsbWebGuideTube_existing"],
  "Web Guide Tube Dia - Proposed": ["rows_lrsbWebGuideTube_proposed"],
  "Insert Bore Dia - Existing": ["rows_lrsbSliverWireSize_existing"],
  "Insert Bore Dia - Proposed": ["rows_lrsbSliverWireSize_proposed"],
  "Break Draft Wheel (W4) / Break Draft (VV) - Existing": ["rows_d40BreakDraft_existing"],
  "Break Draft Wheel (W4) / Break Draft (VV) - Proposed": ["rows_d40BreakDraft_proposed"],
  "Break Draft Wheel (W4) / Break Draft - Existing": ["rows_d50BreakDraft_existing"],
  "Break Draft Wheel (W4) / Break Draft - Proposed": ["rows_d50BreakDraft_proposed"],
  "Feed Tension Wheel (W8) / Feed Tension Draft - Existing": ["rows_d40WebTensionPulley_existing", "rows_d50FeedTensionDraft_existing", "rows_ldf3sFeedTensionDraft_existing"],
  "Feed Tension Wheel (W8) / Feed Tension Draft - Proposed": ["rows_d40WebTensionPulley_proposed", "rows_d50FeedTensionDraft_proposed", "rows_ldf3sFeedTensionDraft_proposed"],
  "Break Draft Wheel / Break Draft - Existing": ["rows_ldf3sBreakDraft_existing"],
  "Break Draft Wheel / Break Draft - Proposed": ["rows_ldf3sBreakDraft_proposed"],
  "SMX No.": ["sap_no", "machine_no"],
  "SMX No. (Proposed)": ["proposed_sap_no"],
  "Mixing / Process - Existing": ["rows_mixing_existing"],
  "Mixing / Process - Proposed": ["rows_mixing_proposed"],
  "Blend - Existing": ["rows_blendPercent_existing"],
  "Blend - Proposed": ["rows_blendPercent_proposed"],
  "Feed - Hank - Existing": ["rows_feedHank_existing"],
  "Feed - Hank - Proposed": ["rows_feedHank_proposed"],
  "Delivery - Hank - Existing": ["rows_delHank_existing"],
  "Delivery - Hank - Proposed": ["rows_delHank_proposed"],
  "CP - Existing": ["rows_cp_existing"],
  "CP - Proposed": ["rows_cp_proposed"],
  "SMXID - Existing": ["rows_smxid_existing"],
  "SMXID - Proposed": ["rows_smxid_proposed"],
  "Break Draft (CP) - Existing": ["rows_breakDraft_existing"],
  "Break Draft (CP) - Proposed": ["rows_breakDraft_proposed"],
  "Front Roller Dia - Existing": ["rows_md1_existing"],
  "Front Roller Dia - Proposed": ["rows_md1_proposed"],
  "TW - Existing": ["rows_md2_existing"],
  "TW - Proposed": ["rows_md2_proposed"],
  "TCW [G] - Existing": ["rows_tw0_existing"],
  "TCW [G] - Proposed": ["rows_tw0_proposed"],
  "TCW [H] - Existing": ["rows_tw1_existing"],
  "TCW [H] - Proposed": ["rows_tw1_proposed"],
  "TPI - Existing": ["rows_tf_existing"],
  "TPI - Proposed": ["rows_tf_proposed"],
  "TM - Existing": ["rows_tm_existing"],
  "TM - Proposed": ["rows_tm_proposed"],
  "LW - Existing": ["rows_lm_existing"],
  "LW - Proposed": ["rows_lm_proposed"],
  "LCW [E] - Existing": ["rows_lcw0_existing"],
  "LCW [E] - Proposed": ["rows_lcw0_proposed"],
  "LCW [F] - Existing": ["rows_lcw1_existing"],
  "LCW [F] - Proposed": ["rows_lcw1_proposed"],
  "Bottom Roller Setting - Existing": ["rows_bottomRollerSetting_existing"],
  "Bottom Roller Setting - Proposed": ["rows_bottomRollerSetting_proposed"],
  "Top Arm Setting - Existing": ["rows_topArmSetting_existing"],
  "Top Arm Setting - Proposed": ["rows_topArmSetting_proposed"],
  "Top Arm Load - Existing": ["rows_topArmLoad_existing"],
  "Top Arm Load - Proposed": ["rows_topArmLoad_proposed"],
  "Floating Condenser - Existing": ["rows_floatingCondensor_existing"],
  "Floating Condenser - Proposed": ["rows_floatingCondensor_proposed"],
  "Spacer - Existing": ["rows_spacer_existing"],
  "Spacer - Proposed": ["rows_spacer_proposed"],
  "Tension - Existing": ["rows_tension_existing"],
  "Tension - Proposed": ["rows_tension_proposed"],
  "Creel Draft Change (WE) - Existing": ["rows_creelDraftChange_existing"],
  "Creel Draft Change (WE) - Proposed": ["rows_creelDraftChange_proposed"],
  "Creel Draft - Existing": ["rows_creelDraft_existing"],
  "Creel Draft - Proposed": ["rows_creelDraft_proposed"],
  "Bobbin Colour - Existing": ["rows_bobbinColour_existing"],
  "Bobbin Colour - Proposed": ["rows_bobbinColour_proposed"],
  "Simplex No.": ["s_no"],
  "Total Spindles": ["total_spdl"],
  "Running Spindles": ["other_field_values_running_spdl"],
  "Sider Name": ["operator_name", "s_name", "other_field_values_sider_name"],
  Hank: ["other_field_values_hank"],
  "Break Category": ["item_name"],
  "Break Counts (0-200, 201-400, 401-600, 601-800, 801-1000, 1001-1200, 1201-1400, 1401-1600, 1601-1800, 1801-2000, 2001-2200, 2201-2400, 2401-2600)": ["status_value"],
  "R/F No.": ["fm_no", "fr_no", "machine_no"],
  "Ramp - Existing": ["ramp_existing", "range_existing"],
  "Ramp - Proposed": ["ramp_proposed", "range_proposed"],
  "Offset On/Off - Existing": ["offset_existing", "offset_on_off_existing"],
  "Offset On/Off - Proposed": ["offset_proposed", "offset_on_off_proposed"],
  "Cop or Cone Condition - Existing": ["core_condition_existing", "cop_core_condition_existing"],
  "Cop or Cone Condition - Proposed": ["core_condition_proposed", "cop_core_condition_proposed"],
  "Product Qty (Kgs) - Existing": ["production_existing", "product_qty_existing"],
  "Product Qty (Kgs) - Proposed": ["production_proposed", "product_qty_proposed"],
  "Raving Hank - Existing": ["roving_hank_existing"],
  "Raving Hank - Proposed": ["roving_hank_proposed"],
  "BDW - Existing": ["eow_existing", "edw_existing", "bdw_existing"],
  "BDW - Proposed": ["eow_proposed", "edw_proposed", "bdw_proposed"],
  "BD - Existing": ["epi_existing", "ed_existing", "bd_existing"],
  "BD - Proposed": ["epi_proposed", "ed_proposed", "bd_proposed"],
  "DFF - Existing": ["dfc_existing"],
  "DFF - Proposed": ["dfc_proposed"],
  "TPI/TM - Existing": ["tpm_existing", "tpi_tpm_existing", "tpi_tm_existing"],
  "TPI/TM - Proposed": ["tpm_proposed", "tpi_tpm_proposed", "tpi_tm_proposed"],
  "Winding length in meters - Existing": ["winding_length_meters_existing", "winding_length_existing"],
  "Winding length in meters - Proposed": ["winding_length_meters_proposed", "winding_length_proposed"],
  "Travellers No. - Existing": ["travelers_no_existing"],
  "Travellers No. - Proposed": ["travelers_no_proposed"],
  "Cop Weight (Grms) - Existing": ["cop_weight_existing"],
  "Cop Weight (Grms) - Proposed": ["cop_weight_proposed"],
  "Speed Initial (RPM) - Existing": ["speed_front_existing", "speed_spindle_existing", "speed_initial_existing"],
  "Speed Initial (RPM) - Proposed": ["speed_front_proposed", "speed_spindle_proposed", "speed_initial_proposed"],
  "Speed Max (RPM) - Existing": ["speed_rpm_existing", "speed_main_existing", "speed_max_existing"],
  "Speed Max (RPM) - Proposed": ["speed_rpm_proposed", "speed_main_proposed", "speed_max_proposed"],
  "Empties Colour - Existing": ["empires_colour_existing", "empties_colour_existing"],
  "Empties Colour - Proposed": ["empires_colour_proposed", "empties_colour_proposed"],
  "Production (Kgs) - Existing": ["production_existing"],
  "Production (Kgs) - Proposed": ["production_proposed"],
  "Speed Front (RPM) - Existing": ["speed_front_existing"],
  "Speed Front (RPM) - Proposed": ["speed_front_proposed"],
  "Mergen Number": ["merge_no"],
  "Grand Total": ["total_cops"],
  "Release Add Tension": ["t_release_add_tension"],
  "% Fault": ["percent_fault"],
  "Break / 1 Million Meter": ["break_per_million_meter"],
  "Gross Wt. (Std)": ["gross_weight_std"],
  "Gross Wt. (Act)": ["gross_weight_actual"],
  "Fibre Weight": ["fabric_weight"],
  CVT: ["cvd"],
  I1: ["l1"],
  I2: ["l2"],
  "1Mtr CV": ["cv_1m"],
  "3Mtr CV": ["cv_3m"],
  "10Mtr CV": ["cv_10m"],
  "Count CV": ["count_cv", "cv1"],
  "Strength CV": ["strength_cv", "cv2"],
  CV1: ["cv1", "count_cv"],
  CV2: ["cv2", "strength_cv"],
  "Parent Yarn Strength": ["parent_yarn"],
};

const getCanonicalReportFieldKey = (field) => {
  const fieldKey = String(field?.key || field?.label || "").trim();
  const matchedAlias = Object.entries(reportFieldAliases).find(([label, aliases]) =>
    [label, ...aliases].some((candidate) => normalizeLookupKey(candidate) === normalizeLookupKey(fieldKey))
  );
  return matchedAlias ? normalizeLookupKey(matchedAlias[0]) : normalizeLookupKey(fieldKey);
};

const getReportFieldValue = (row, field) => {
  // Explicit aliases go first: they were added precisely because the plain label/key either
  // doesn't exist on the row or fuzzy-matches the WRONG field (e.g. "Process Parameter ID" can
  // substring-match an unrelated "process_parameter" type field before ever trying its real
  // "entry_id" alias) — an alias should always win over a blind fuzzy guess on the label itself.
  const keys = [
    ...(reportFieldAliases[field?.label] || []),
    ...(reportFieldAliases[field?.key] || []),
    field?.key,
    field?.label,
  ].filter(Boolean);

  const rowKeyDenylist = new Set(["id", "_id"]);

  for (const key of keys) {
    if (row?.[key] !== null && typeof row?.[key] !== "undefined" && row?.[key] !== "") return row[key];
    const target = normalizeLookupKey(key);
    const rowKeys = Object.keys(row || {});
    const exactMatch = rowKeys.find((rowKey) => normalizeLookupKey(rowKey) === target && !rowKeyDenylist.has(rowKey));
    const fuzzyMatch = rowKeys.find((rowKey) => {
      if (rowKeyDenylist.has(rowKey)) return false;
      const normalizedRowKey = normalizeLookupKey(rowKey);
      return normalizedRowKey.includes(target) || target.includes(normalizedRowKey);
    });
    const matchedKey = exactMatch || fuzzyMatch;
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

// Any field recognized as "a date" (by its raw backend key or its display label) gets rendered
// through formatDate as day-month-year — including backend-supplied generic fields like
// "CREATED_AT" that arrive as a raw ISO timestamp with a time component.
const DATE_FIELD_NORMALIZED_KEYS = new Set(
  [
    "inspection_date",
    "creation_date",
    "invoice_date",
    "entry_date",
    "created_date",
    "created_at",
    "createdat",
    "updated_at",
    "updatedat",
  ].map(normalizeLookupKey)
);

const getCellValue = (row, field, operatorByEntryKey = {}) => {
  if (field.key === OPERATOR_FIELD_KEY) {
    const entryKey = getRowEntryKey(row);
    return (entryKey && operatorByEntryKey[entryKey]) || "-";
  }

  if (DATE_FIELD_NORMALIZED_KEYS.has(normalizeLookupKey(field.key)) || DATE_FIELD_NORMALIZED_KEYS.has(normalizeLookupKey(field.label))) {
    return formatDate(getReportFieldValue(row, field) || getRowDate(row));
  }

  // A field like "Sample 3 - N" or "Weight (Max) - N-1" only exists inside the A% notebook's
  // nested rows array, not as a real key on the row — if it doesn't resolve there, show "-"
  // instead of falling through to the generic fallback below, which would otherwise return
  // some unrelated value scraped from elsewhere in the row (the exact "all fields show the
  // same value" bug this guarded against).
  if (parseAPercentFieldLabel(field.label || field.key)) {
    const aPercentValue = getAPercentTableValue(row, field.label || field.key);
    return aPercentValue !== null && typeof aPercentValue !== "undefined" && aPercentValue !== ""
      ? String(aPercentValue)
      : "-";
  }

  // Same reasoning as the A% guard above, for SMXCots Change's `items` array.
  if (SMX_COTS_CHANGE_ITEM_LABELS.includes(field.label || field.key)) {
    const itemValue = getSmxCotsChangeItemValue(row, field.label || field.key);
    return itemValue !== null && typeof itemValue !== "undefined" && itemValue !== "" ? String(itemValue) : "-";
  }

  // Same reasoning as the A% guard above, for SMX Breaks Study Report's `items` array.
  if (parseSmxBreaksStudyFieldLabel(field.label || field.key)) {
    const cellValue = getSmxBreaksStudyCellValue(row, field.label || field.key);
    return cellValue !== null && typeof cellValue !== "undefined" && cellValue !== "" ? String(cellValue) : "-";
  }

  // Same reasoning as the A% guard above, for Stretch %'s `tables` array.
  if (parseStretchFieldLabel(field.label || field.key)) {
    const stretchValue = getStretchTableValue(row, field.label || field.key);
    return stretchValue !== null && typeof stretchValue !== "undefined" && stretchValue !== "" ? String(stretchValue) : "-";
  }

  if (DRUM_WISE_APPEARANCE_FIELD_KEYS[field.label || field.key]) {
    const appearanceCount = getDrumWiseAppearanceCount(row, field.label || field.key);
    return typeof appearanceCount !== "undefined" ? String(appearanceCount) : "-";
  }

  const value = getReportFieldValue(row, field);
  if (value === null || typeof value === "undefined" || value === "") return "-";
  // Several forms (e.g. Cone Packing Audit's Yes/No radio fields) save these as real booleans —
  // show them the same way the form does ("Yes"/"No") instead of the raw "true"/"false".
  if (typeof value === "boolean") return value ? "Yes" : "No";
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
  const [operatorByEntryKey, setOperatorByEntryKey] = useState({});
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
    const inferredFields = inferFields(rows);
    const inferredKeys = new Set(inferredFields.map(getCanonicalReportFieldKey));
    const backendFields = uniqueOptions(builderOptions.input_fields).map(toReportField).filter(Boolean);
    const rawCatalogFields = uniqueOptions(getThresholdFieldsForScreen(reportType, subDepartment)).map(toReportField).filter(Boolean);
    // getThresholdFieldsForScreen is keyed by type name only, and a few names (e.g. "Process
    // Parameter") are reused across unrelated departments with different field sets — for those,
    // only keep catalog fields that actually exist on the rows fetched for this dept/type. Names
    // unique to one department are trusted outright, so fields still show before any rows load.
    // If nothing in the catalog matches the fetched rows (no rows loaded yet, or this dept/type's
    // field set genuinely equals the shared catalog entry), fall back to the full catalog rather
    // than showing no fields at all.
    const matchedCatalogFields = rawCatalogFields.filter((field) => inferredKeys.has(getCanonicalReportFieldKey(field)));
    const catalogFields = isAmbiguousReportType(reportType) && matchedCatalogFields.length
      ? matchedCatalogFields
      : rawCatalogFields;
    // "Date" is excluded for the Wrapping OCR notebook types (Carding/Drawing/Simplex sub-types,
    // where it duplicates the separate "Report Date" column) and for every report type under the
    // "Simplex" sub-department — other screens (e.g. Draw Frame's U% Data Entry) genuinely use
    // "Date" as one of their own form fields and should show it.
    const screenExcludedReportFields =
      (subDepartment === "Wrapping" && ["Carding", "Drawing", "Simplex"].includes(reportType)) ||
      subDepartment === "Simplex"
        ? globallyExcludedReportFields
        : globallyExcludedReportFields.filter((label) => label !== "Date");
    const excludedFieldKeys = new Set(
      screenExcludedReportFields.map((label) => getCanonicalReportFieldKey({ key: label }))
    );
    const definedFields = [...backendFields, ...catalogFields].filter(
      (field, index, list) =>
        field?.key &&
        !excludedFieldKeys.has(getCanonicalReportFieldKey(field)) &&
        index === list.findIndex((item) => getCanonicalReportFieldKey(item) === getCanonicalReportFieldKey(field))
    );
    // When this notebook type has a defined field set, show only those fields — no extra
    // columns pulled in from the raw row shape (ids, internal/meta keys, etc). Only fall back
    // to inferring fields from the rows when nothing is defined for this screen at all.
    const sourceFields = definedFields.length ? definedFields : inferredFields;
    // Every notebook type has an entry id, whether or not the catalog for that
    // screen happens to list it — surface it everywhere unless already present.
    const hasEntryIdField = sourceFields.some(
      (field) => getCanonicalReportFieldKey(field) === getCanonicalReportFieldKey(ENTRY_ID_FIELD)
    );
    const withEntryId = hasEntryIdField ? sourceFields : [...sourceFields, ENTRY_ID_FIELD];
    // Every notebook type entry is submitted by someone — surface who, resolved against the
    // submitted-notebooks record for that entry id, regardless of dept/type.
    const withOperator = isTeamPerformanceReport ? withEntryId : [...withEntryId, OPERATOR_FIELD];
    const selectedKeys = new Set(selectedFields.map((field) => field.key));
    return withOperator.filter((field) => !selectedKeys.has(field.key));
  }, [builderOptions.input_fields, isTeamPerformanceReport, reportType, rows, selectedFields, subDepartment]);

  const filteredRows = useMemo(() => {
    if (isInvoiceDataReport) return rows;
    if (!dateFilterActive) return rows;

    const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;

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
    const loadOperators = async () => {
      try {
        // The backend paginates /submitted-notebooks like every other list endpoint — fetching
        // without page/limit only returns the first page, so most entries had no match and
        // showed "-". Page through all of it so every entry id can resolve an operator.
        const notebookRows = await fetchAllReportRows(
          fetchSubmittedNotebooksApi,
          {},
          extractSubmittedNotebookRows
        );
        if (!isMounted) return;
        setOperatorByEntryKey(buildOperatorByEntryKey(notebookRows));
      } catch {
        if (isMounted) setOperatorByEntryKey({});
      }
    };
    loadOperators();
    return () => {
      isMounted = false;
    };
  }, []);

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
    setError("");

    if (!department || !subDepartment || !reportType) {
      setRows([]);
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
        // Draw Frame's "A%" notebook and Simplex's "SMXCots Change Data Entry"/"SMX Breaks Study
        // Report"/"Stretch %" all store one entry's per-item breakdown as a nested array
        // (rows/manual_json/ocr_json, `items`, or `tables`) describing a single record, not
        // multiple physical entries — skip the generic nested-array row expansion for these
        // screens (unlike Wrapping's OCR notebooks, where each nested row really is its own
        // separate entry).
        const skipsNestedRowExpansion =
          (subDepartment === "Draw Frame" && reportType === "A%") ||
          (subDepartment === "Simplex" &&
            ["SMXCots Change Data Entry", "SMX Breaks Study Report", "Stretch %"].includes(reportType)) ||
          (subDepartment === "Spinning" && ["Count Change", "Ring Frame Log Book"].includes(reportType)) ||
          (subDepartment === "Autoconer" &&
            ["Lycra % Checking", "Splice Strength", "Drum wise Appearance"].includes(reportType));
        const extractRows = skipsNestedRowExpansion ? extractResponseRows : normalizeRows;

        let nextRows = [];
        if (reportFetcher) {
          try {
            nextRows = await fetchAllReportRows(reportFetcher, baseReportParams, extractRows);
          } catch (directError) {
            nextRows = await fetchAllReportRows(generalReportFetcher, baseReportParams, extractRows);
          }
        } else {
          nextRows = await fetchAllReportRows(generalReportFetcher, baseReportParams, extractRows);
        }

        if (isActive && requestIdRef.current === requestId) {
          setRows(nextRows);
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
    setSelectedFields([]);
  }, [department, reportType, selectedReportSource, subDepartment]);

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
          record[field.label] = getCellValue(row, field, operatorByEntryKey);
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
          .map((field) => `"${getCellValue(row, field, operatorByEntryKey).replace(/"/g, '""')}"`)
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
          sheet.addRow(fields.map((field) => getCellValue(row, field, operatorByEntryKey)));
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
                  `<tr>${selectedFields.map((field) => `<td>${escapeHtmlText(getCellValue(row, field, operatorByEntryKey))}</td>`).join("")}</tr>`
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
                              <td key={field.key}>{getCellValue(row, field, operatorByEntryKey)}</td>
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
