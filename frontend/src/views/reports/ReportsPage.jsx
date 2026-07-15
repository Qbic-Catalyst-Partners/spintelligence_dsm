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
  fetchCardWasteStudyEntries,
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
  fetchDrawFrameWheelChangeBreakerType1Entries,
  fetchDrawFrameWheelChangeBreakerType2Entries,
  fetchDrawFrameWheelChangeBreakerType3Entries,
  fetchDrawFrameWheelChangeFinisherType1Entries,
  fetchDrawFrameWheelChangeFinisherType2Entries,
  fetchDrawFrameWheelChangeFinisherType3Entries,
  fetchDrawFrameWheelChangeFinisherType4Entries,
} from "@/apis/drawFrameWheelChange";
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
      "BR Waste Study Entry Type 1": { fetcher: fetchEndpointRows.bind(null, "/blowroom/br-waste-study") },
      "BR Waste Study Entry Type 2": { fetcher: fetchEndpointRows.bind(null, "/blowroom/br-waste-study") },
      "BR Waste Study Entry Type 3": { fetcher: fetchEndpointRows.bind(null, "/blowroom/br-waste-study") },
      "Drop Test Data Entry": { fetcher: fetchEndpointRows.bind(null, "/blowroom/drop-test") },
      "B/R CV1M Data Entry Within Lap": { endpoint: "/blowroom/within-lap-cv" },
      "B/R Between Lap CV%": { endpoint: "/blowroom/between-lap-cv" },
    },
    Carding: {
      "Process Parameter": { fetcher: getCardingProcessParameterEntries },
      "Between & Within Data Entry - Within": { endpoint: "/carding/between-within-card" },
      "Between & Within Data Entry - Between": { endpoint: "/carding/between-within-card" },
    "Thick place & CV": { endpoint: "/carding/card-thick-place" },
      "Carding NRE%": { endpoint: "/carding/nre" },
      "Nati Data Entry": { endpoint: "/carding/nati-data-entry" },
      "U% Data Entry": { fetcher: fetchCardingUqcEntries },
      "Card DFK Data": { fetcher: fetchCardingDfkPressureEntries },
      WheelChange: { fetcher: fetchCardingChangeControlEntries },
      "Individual Card Waste Study Type 1": { fetcher: fetchCardWasteStudyEntries },
      "Individual Card Waste Study Type 2": { fetcher: fetchCardWasteStudyEntries },
      "Individual Card Waste Study Type 3": { fetcher: fetchCardWasteStudyEntries },
    },
    "Individual Card Performance": {
      // trials.js is mounted at plain /trials (backend/server.js), never under /carding — this
      // wrong path meant Custom Report could never fetch this screen's data at all.
      "Individual Card performance Data": { endpoint: "/trials" },
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
      "Draw Frame Cots Data Entry - Breaker": { fetcher: fetchDrawFrameCotsEntries },
      "Draw Frame Cots Data Entry - Finisher": { fetcher: fetchDrawFrameCotsEntries },
      "U% Data Entry": { fetcher: fetchDrawFrameUqcEntries },
      "A%": { endpoint: "/drawframe/a-percent" },
      "PP - Breaker Drawing": { fetcher: fetchDrawFrameBreakerProcessParameterEntries },
      "PP - Finisher Drawing": { fetcher: fetchDrawFrameFinisherProcessParameterEntries },
      "Wheel Change - Breaker Type 1": { fetcher: fetchDrawFrameWheelChangeBreakerType1Entries },
      "Wheel Change - Breaker Type 2": { fetcher: fetchDrawFrameWheelChangeBreakerType2Entries },
      "Wheel Change - Breaker Type 3": { fetcher: fetchDrawFrameWheelChangeBreakerType3Entries },
      "Wheel Change - Finisher Type 1": { fetcher: fetchDrawFrameWheelChangeFinisherType1Entries },
      "Wheel Change - Finisher Type 2": { fetcher: fetchDrawFrameWheelChangeFinisherType2Entries },
      "Wheel Change - Finisher Type 3": { fetcher: fetchDrawFrameWheelChangeFinisherType3Entries },
      "Wheel Change - Finisher Type 4": { fetcher: fetchDrawFrameWheelChangeFinisherType4Entries },
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
      "Wheel Change Type 1": { endpoint: "/spinning/wheel-change/type1" },
      "Wheel Change Type 2": { endpoint: "/spinning/wheel-change/type2" },
      "Wheel Change Type 3": { endpoint: "/spinning/wheel-change/type3" },
      "Wheel Change Type 4": { endpoint: "/spinning/wheel-change/type4" },
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

// Blow Room's "BR Waste Study Entry" saves one of 3 study types (each with its own set of speed/
// setting columns) into the same table/endpoint — Custom Report exposes them as 3 separate report
// types ("BR Waste Study Entry Type 1/2/3") sharing one fetcher, so each only offers its own
// relevant fields.
const BR_WASTE_STUDY_TYPE_BY_REPORT_TYPE = {
  "BR Waste Study Entry Type 1": "Type 1",
  "BR Waste Study Entry Type 2": "Type 2",
  "BR Waste Study Entry Type 3": "Type 3",
};

// Carding's "Individual Card Waste Study" shares the exact same form component (BrWasteStudyEntry)
// and payload shape (study_type/type_rows/waste_rows) as Blow Room's BR Waste Study — split into 3
// report types the same way, reusing normalizeBrWasteStudyRows/buildBrWasteTypeColumns unchanged.
const CARD_WASTE_STUDY_TYPE_BY_REPORT_TYPE = {
  "Individual Card Waste Study Type 1": "Type 1",
  "Individual Card Waste Study Type 2": "Type 2",
  "Individual Card Waste Study Type 3": "Type 3",
};

// One study can record any number of waste-type readings (user-chosen "Number of Waste Types",
// up to 25) — each needs its own numbered column ("Waste Type 1", "Waste KGs Value 1", "Waste
// KGs % 1", "Waste Type 2", ...) rather than being exploded into separate report rows, so users
// can see every reading for a study side by side. The speed/setting columns (Cylinder Speed etc.)
// are a separate breakdown (type_rows) and still get one report row each, same as before; the
// waste-type columns are repeated identically across every one of a study's rows.
const BR_WASTE_STUDY_MAX_WASTE_TYPES = 25;

const buildBrWasteTypeColumns = (wasteRows) => {
  const columns = { no_of_waste_types: wasteRows.length };
  wasteRows.slice(0, BR_WASTE_STUDY_MAX_WASTE_TYPES).forEach((wasteRow, index) => {
    const n = index + 1;
    columns[`waste_type_${n}`] = wasteRow?.waste_type ?? null;
    columns[`waste_kgs_value_${n}`] = wasteRow?.waste_kgs_value ?? null;
    columns[`waste_kgs_${n}`] = wasteRow?.waste_kgs_percent ?? null;
  });
  return columns;
};

const normalizeBrWasteStudyRows = (studyType) => (response) =>
  extractResponseRows(response)
    .filter(
      (study) => String(study?.study_type ?? "").trim().toLowerCase() === studyType.toLowerCase()
    )
    .flatMap((study) => {
      if (!isRecordObject(study)) return [];
      const typeRows = Array.isArray(study.type_rows) ? study.type_rows : [];
      const wasteRows = Array.isArray(study.waste_rows) ? study.waste_rows : [];
      const { type_rows, waste_rows, ...studyFields } = study;
      const flatStudyFields = flattenRecord(studyFields);
      const wasteColumns = buildBrWasteTypeColumns(wasteRows);

      if (!typeRows.length) {
        return [{ ...flatStudyFields, ...wasteColumns }];
      }

      return typeRows.map((typeRow) => ({
        ...flatStudyFields,
        ...flattenRecord(typeRow, { includeArrays: true }),
        ...wasteColumns,
      }));
    });

// Blow Room's "Drop Test Data Entry" submits one form as N separate physical rows — one per tuft
// — sharing a common `drop_id` (the parent Entry ID reserved for the whole submission; each tuft's
// OWN `entry_id` is that same id with a "-01"/"-02" suffix). The GET endpoint returns them flat,
// one tuft per row. For Custom Report, group tufts back into a single row per submission with a
// numbered column set per tuft ("Tuft 1 - Variety", "Tuft 1 - Display Wt.", "Tuft 2 - Variety",
// ...) — a submission with only 1 tuft shows "-" for every Tuft 2+ column instead of those columns
// not existing at all, and the row's own Entry ID becomes the shared `drop_id` so it matches what
// was recorded in submitted_notebooks (fixing Operator resolution, which was previously failing
// because each tuft's own suffixed entry_id never matched the notebook recorded under the parent id).
const DROP_TEST_MAX_TUFTS = 20;

const buildDropTestTuftColumns = (tuftRows) => {
  const columns = { no_of_tufts: tuftRows.length };
  tuftRows.slice(0, DROP_TEST_MAX_TUFTS).forEach((tuftRow, index) => {
    const n = index + 1;
    columns[`tuft_variety_${n}`] = tuftRow?.tuft_variety ?? null;
    columns[`display_weight_${n}`] = tuftRow?.display_weight ?? null;
    columns[`actual_weight_${n}`] = tuftRow?.actual_weight ?? null;
    columns[`difference_${n}`] = tuftRow?.difference ?? null;
    columns[`ratio_percent_${n}`] = tuftRow?.ratio_percent ?? null;
  });
  return columns;
};

// Prefer the real `drop_id` column the backend returns, but fall back to deriving it from the
// tuft's own suffixed entry_id (stripping the trailing "-01"/"-02") — mirrors
// getDropTestParentId's logic on the backend, so grouping/Operator matching still works even
// against a stale API response that hasn't started including `drop_id` yet.
const deriveDropTestParentId = (row) => {
  const explicitDropId = String(row?.drop_id ?? "").trim();
  if (explicitDropId) return explicitDropId;
  const ownEntryId = String(row?.entry_id ?? "").trim();
  return ownEntryId ? ownEntryId.replace(/-\d{1,2}$/, "") : "";
};

const normalizeDropTestRows = (response) => {
  const groups = new Map();
  extractResponseRows(response).forEach((row) => {
    if (!isRecordObject(row)) return;
    const groupId = deriveDropTestParentId(row) || `__ungrouped_${groups.size}`;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(row);
  });

  return Array.from(groups.entries()).map(([groupId, tuftRows]) => {
    const sortedTuftRows = [...tuftRows].sort(
      (a, b) => (Number(a?.tuft_no) || 0) - (Number(b?.tuft_no) || 0)
    );
    const first = sortedTuftRows[0] || {};
    return {
      ...first,
      entry_id: groupId,
      ...buildDropTestTuftColumns(sortedTuftRows),
    };
  });
};

// Blow Room's "B/R CV1M Data Entry Within Lap" / "B/R Between Lap CV%" both have a user-editable
// "Number of Sample Entries" count — not fixed at 5 — but the table originally only stored 5
// discrete sample_1..sample_5 columns, silently dropping anything past the 5th reading. New
// submissions now also store the full array in a `samples` jsonb column; prefer that (whatever
// length it actually is) and only fall back to the discrete columns for legacy rows saved before
// that column existed.
const getLapCvSamplesArray = (row) => {
  if (Array.isArray(row?.samples)) return row.samples;
  if (typeof row?.samples === "string") {
    try {
      const parsed = JSON.parse(row.samples);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to the legacy discrete columns below
    }
  }
  return [row?.sample_1, row?.sample_2, row?.sample_3, row?.sample_4, row?.sample_5].filter(
    (value) => value !== null && typeof value !== "undefined" && value !== ""
  );
};

const normalizeLapCvRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const samplesArray = getLapCvSamplesArray(row);
    const sampleColumns = { no_of_samples: samplesArray.length };
    samplesArray.forEach((value, index) => {
      sampleColumns[`sample_${index + 1}`] = value;
    });
    return { ...row, ...sampleColumns };
  });

// Comber's "Ribbon Lap CV1M Data Entry" stores however many numbered samples the user's own
// "Number of Sample Entries" produced, same reasoning as Blow Room's Lap CV screens above — but
// the GET response nests them as `samples: [{ sample_no, value }]` rather than a plain number
// array/legacy discrete columns, so it needs its own extraction before reusing the same
// `sample_N` column-naming convention.
const normalizeComberLapCvRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const samplesArray = Array.isArray(row.samples)
      ? [...row.samples]
          .sort((a, b) => (a?.sample_no ?? 0) - (b?.sample_no ?? 0))
          .map((sample) => sample?.value ?? null)
      : [];
    const { samples: _samples, ...headerFields } = row;
    const sampleColumns = { no_of_samples: samplesArray.length };
    samplesArray.forEach((value, index) => {
      sampleColumns[`sample_${index + 1}`] = value;
    });
    return { ...headerFields, ...sampleColumns };
  });

// Carding's "Between & Within Card Data Entry" saves one `inspection_type` ("Within" or
// "Between") per submission into the same table/endpoint, with the per-entry Sample Weight/Hank
// readings coming back as plain `sample_weights`/`hanks` arrays (any length, up to the form's own
// 100-entry cap) rather than fixed columns. Custom Report exposes this as two separate report
// types sharing one fetcher — filter to the matching inspection_type and expand each array into
// numbered "Sample Weight N"/"Hank N" columns, same reasoning as the other numbered-column fixes.
const BETWEEN_WITHIN_CARD_TYPE_BY_REPORT_TYPE = {
  "Between & Within Data Entry - Within": "Within",
  "Between & Within Data Entry - Between": "Between",
};

const normalizeBetweenWithinCardRows = (inspectionType) => (response) =>
  extractResponseRows(response)
    .filter(
      (row) => String(row?.inspection_type ?? "").trim().toLowerCase() === inspectionType.toLowerCase()
    )
    .map((row) => {
      if (!isRecordObject(row)) return row;
      const sampleWeights = Array.isArray(row.sample_weights) ? row.sample_weights : [];
      const hanks = Array.isArray(row.hanks) ? row.hanks : [];
      const entryColumns = { no_of_entries: row.num_entries ?? Math.max(sampleWeights.length, hanks.length) };
      sampleWeights.forEach((value, index) => {
        entryColumns[`sample_weight_${index + 1}`] = value;
      });
      hanks.forEach((value, index) => {
        entryColumns[`hank_${index + 1}`] = value;
      });
      return { ...row, ...entryColumns };
    });

// Carding's "Thick place & CV" submits one reading per machine (CDG-01, CDG-02, ... however many
// the master machine list has) in a single form — the GET response nests them as one `entries`
// array per submission (each { machine, cv_value, cv_5m_value }). Rather than exploding into one
// report row per machine (which the generic nested-array expansion would otherwise do), keep one
// row per submission and expose each machine's own pair of columns by name, e.g.
// "CDG-01 - Card Thick Place Value" / "CDG-01 - 5m CV", so every machine actually entered on that
// submission shows up side by side.
// Keeps non-alphanumeric runs as a single underscore (rather than stripping them entirely) so the
// original machine name/label can be reconstructed later purely from the column key — see
// machineSlugToLabel below.
const slugifyMachineName = (machine) => String(machine ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
const machineSlugToLabel = (slug) => String(slug ?? "").toUpperCase().replace(/_/g, "-");

const normalizeCardThickPlaceRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const entries = Array.isArray(row.entries) ? row.entries : [];
    const { entries: _entries, ...headerFields } = row;
    const machineColumns = {};
    entries.forEach((entry) => {
      const machineSlug = slugifyMachineName(entry?.machine);
      if (!machineSlug) return;
      machineColumns[`card_thick_place_${machineSlug}`] = entry?.cv_value ?? null;
      machineColumns[`five_m_cv_${machineSlug}`] = entry?.cv_5m_value ?? null;
    });
    return { ...headerFields, ...machineColumns };
  });

// Carding's "Nati Data Entry" submits a user-editable "Number of Neps Entries" (up to 10) in one
// form — the GET response nests them as one `entries` array per submission (each { mc_no,
// ratio_size_1, ratio_size_07, ratio_size_05 }). Keep one row per submission and expose each
// entry's own numbered columns ("Entry 1 - MC No", "Entry 1 - Ratio 1.0", ...) based on how many
// entries that submission actually has, same reasoning as the other numbered-column fixes.
// (Note: "Nati Data Entry" is also a report type name under Comber, with a different shape —
// this only runs for the Carding one.)
const normalizeCardingNatiRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const entries = Array.isArray(row.entries) ? row.entries : [];
    const { entries: _entries, ...headerFields } = row;
    const entryColumns = { no_of_neps_entries: entries.length };
    entries.forEach((entry, index) => {
      const n = index + 1;
      entryColumns[`nati_mc_no_${n}`] = entry?.mc_no ?? null;
      entryColumns[`nati_ratio_size_1_${n}`] = entry?.ratio_size_1 ?? null;
      entryColumns[`nati_ratio_size_07_${n}`] = entry?.ratio_size_07 ?? null;
      entryColumns[`nati_ratio_size_05_${n}`] = entry?.ratio_size_05 ?? null;
    });
    return { ...headerFields, ...entryColumns };
  });

// Comber's "Nati Data Entry" has the exact same shape as Carding's (a user-editable "Number of
// Neps Entries" nested `entries` array per submission), but is a distinct report type with its
// own field keys (`comber_nati_*`) so it never collides with Carding's Nati columns above.
const normalizeComberNatiRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const entries = Array.isArray(row.entries) ? row.entries : [];
    const { entries: _entries, ...headerFields } = row;
    const entryColumns = { comber_no_of_neps_entries: entries.length };
    entries.forEach((entry, index) => {
      const n = index + 1;
      entryColumns[`comber_nati_mc_no_${n}`] = entry?.mc_no ?? null;
      entryColumns[`comber_nati_ratio_size_1_${n}`] = entry?.ratio_size_1 ?? null;
      entryColumns[`comber_nati_ratio_size_07_${n}`] = entry?.ratio_size_07 ?? null;
      entryColumns[`comber_nati_ratio_size_05_${n}`] = entry?.ratio_size_05 ?? null;
    });
    return { ...headerFields, ...entryColumns };
  });

// Draw Frame's "1 Yard / Half Yard CV Entry" collects however many individual 1 Yard/1/2 Yard
// readings the user enters (N, not fixed) to compute the avg/hank/sd/cv summary stats — only the
// summary was ever saved before, so Custom Report could never show the individual readings
// themselves. The GET response nests them as `readings: { one_yard: [...], half_yard: [...] }`.
const normalizeDrawFrameYarnCvRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const readings = isRecordObject(row.readings) ? row.readings : {};
    const oneYard = Array.isArray(readings.one_yard) ? readings.one_yard : [];
    const halfYard = Array.isArray(readings.half_yard) ? readings.half_yard : [];
    const { readings: _readings, ...headerFields } = row;
    const count = Math.max(oneYard.length, halfYard.length);
    const readingColumns = { no_of_readings_entered: count };
    for (let index = 0; index < count; index += 1) {
      const n = index + 1;
      readingColumns[`yarn_cv_reading_${n}_one_yard`] = oneYard[index] ?? null;
      readingColumns[`yarn_cv_reading_${n}_half_yard`] = halfYard[index] ?? null;
    }
    return { ...headerFields, ...readingColumns };
  });

// Spinning's "Count Change" collects however many individual readings the user enters (N, not
// fixed) — the GET route already joins them into a `readings` array per submission (each shaped
// { reading_no, reading_value, count, cv_percent, strength, mean, cv_percent_2, csp }), but
// Custom Report never had a normalizer to expose them as numbered columns, so they always fell
// through to the generic fallback. A submission with zero matching child rows comes back from
// the LEFT JOIN as a single `{ reading_no: null, ... }` placeholder — filter that out.
const SPINNING_COUNT_CHANGE_METRIC_KEYS = [
  "reading_value", "count", "cv_percent", "strength", "mean", "cv_percent_2", "csp",
];
const SPINNING_COUNT_CHANGE_METRIC_LABELS = {
  reading_value: "Reading Value",
  count: "Count",
  cv_percent: "CV%",
  strength: "Strength",
  mean: "Mean",
  cv_percent_2: "CV% 2",
  csp: "CSP",
};

const normalizeSpinningCountChangeRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const readings = (Array.isArray(row.readings) ? row.readings : []).filter(
      (reading) => reading && reading.reading_no !== null && typeof reading.reading_no !== "undefined"
    );
    const { readings: _readings, ...headerFields } = row;
    const readingColumns = { no_of_readings_entered: readings.length };
    readings.forEach((reading, index) => {
      const n = reading?.reading_no ?? index + 1;
      SPINNING_COUNT_CHANGE_METRIC_KEYS.forEach((metric) => {
        readingColumns[`count_change_reading_${n}_${metric}`] = reading?.[metric] ?? null;
      });
    });
    return { ...headerFields, ...readingColumns };
  });

// Spinning's "Ring Frame Log Book" always submits a fixed 24 machine rows (spinning.js's
// createRingFrameRows()/RING_FRAME_RF_TOTAL — machine numbers 1-24, unlike Count Change/Yarn CV's
// genuinely variable reading count) plus one summary block per submission. The GET route already
// joins both back as a `rows` array (mc_no, lycra, bobbin_color, bobbin_checked,
// spindle_1..6, guide_roll_lapping, lycra_missing, others, total) and a `summary` object
// (out_of_center[_ac/_rf], fault_cops[_ac/_rf], total_cops[_ac/_rf], comments), but Custom Report
// never had a normalizer to flatten either — both stayed nested objects, invisible to inferFields'
// top-level-only key scan. Flatten `rows` into numbered `ring_frame_row_<N>_<field>` columns (same
// reasoning/guard pattern as Count Change's readings above) and hoist `summary`'s fields to the top
// level. The bottom-of-form "Guide Roll"/"Lycra Missing"/"Others" totals are never actually sent in
// the payload (spinning.js computes them client-side for the confirmation preview only, with no DB
// column backing them) — recompute them here from the same row data so Custom Report can still show
// them correctly instead of leaving them blank.
// Labels below are copied verbatim from the notebook's own table header text
// (frontend/src/views/spinning.js's Ring Frame Log Book <thead>: "Mc.No", "Lycra", "Bobbin",
// "1".."6", "Guide Roll Lapping", "Lycra Missing", "Others", "Total") rather than invented names,
// so Custom Report reads exactly like the form the user filled in. `bobbin_checked` is left out —
// the notebook's single "Bobbin" column is actually the `bobbin_color` swatch choice; the payload
// never sends `bobbin_checked` at all (it's a leftover column from an older form variant), so
// surfacing it here would just be a second, always-empty field with the same name.
const RING_FRAME_ROW_METRIC_KEYS = [
  "mc_no", "lycra", "bobbin_color",
  "spindle_1", "spindle_2", "spindle_3", "spindle_4", "spindle_5", "spindle_6",
  "guide_roll_lapping", "lycra_missing", "others", "total",
];
const RING_FRAME_ROW_METRIC_LABELS = {
  mc_no: "Mc.No",
  lycra: "Lycra",
  bobbin_color: "Bobbin",
  spindle_1: "1",
  spindle_2: "2",
  spindle_3: "3",
  spindle_4: "4",
  spindle_5: "5",
  spindle_6: "6",
  guide_roll_lapping: "Guide Roll Lapping",
  lycra_missing: "Lycra Missing",
  others: "Others",
  total: "Total",
};
const toRingFrameNumericOrZero = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeRingFrameLogBookRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const machineRows = (Array.isArray(row.rows) ? row.rows : []).filter(
      (machineRow) => machineRow && machineRow.mc_no !== null && String(machineRow.mc_no ?? "").trim() !== ""
    );
    const summary = isRecordObject(row.summary) ? row.summary : {};
    const { rows: _rows, summary: _summary, ...headerFields } = row;

    const rowColumns = { no_of_machine_rows_entered: machineRows.length };
    machineRows.forEach((machineRow, index) => {
      const n = index + 1;
      RING_FRAME_ROW_METRIC_KEYS.forEach((metric) => {
        rowColumns[`ring_frame_row_${n}_${metric}`] = machineRow?.[metric] ?? null;
      });
    });

    const guideRollTotal = machineRows.reduce((total, r) => total + toRingFrameNumericOrZero(r?.guide_roll_lapping), 0);
    const lycraMissingRowTotal = machineRows.reduce((total, r) => total + toRingFrameNumericOrZero(r?.lycra_missing), 0);
    const othersTotal = machineRows.reduce((total, r) => total + toRingFrameNumericOrZero(r?.others), 0);

    return {
      ...headerFields,
      ...rowColumns,
      out_of_center: summary.out_of_center ?? null,
      out_of_center_ac: summary.out_of_center_ac ?? null,
      out_of_center_rf: summary.out_of_center_rf ?? null,
      fault_cops: summary.fault_cops ?? null,
      fault_cops_ac: summary.fault_cops_ac ?? null,
      fault_cops_rf: summary.fault_cops_rf ?? null,
      total_cops: summary.total_cops ?? null,
      total_cops_ac: summary.total_cops_ac ?? null,
      total_cops_rf: summary.total_cops_rf ?? null,
      guide_roll_total: guideRollTotal,
      lycra_missing_total: lycraMissingRowTotal,
      others_total: othersTotal,
      comments: summary.comments ?? null,
    };
  });

// Autoconer's "Rewinding Study" collects however many drum readings the user adds (starts with 1
// blank row, more can be added) — the GET route (/autoconer/inspection-data-entry, the endpoint
// this screen's fetcher actually calls) already joins them into a `readings` array per submission
// (each shaped { drum_no, no_of_cones, fault_name, no_of_faults, percent_fault, weight,
// length_meters }), but Custom Report never had a normalizer to expose them as numbered columns,
// so they always fell through to the generic fallback. A submission with zero matching child rows
// comes back from the LEFT JOIN as a single `{ drum_no: null, ... }` placeholder — filter that out.
const AUTOCONER_REWINDING_STUDY_METRIC_KEYS = [
  "drum_no", "no_of_cones", "fault_name", "no_of_faults", "percent_fault", "weight", "length_meters",
];
// Labels copied verbatim from the notebook's own table header text (frontend/src/views/autoconer/
// RewindingStudy.jsx's <thead>: "DRUM NO.", "NO. OF CONES", "FAULT NAME", "NO. OF FAULTS",
// "% FAULT", "WEIGHT (Kgs)", "LENGTH (meters)").
const AUTOCONER_REWINDING_STUDY_METRIC_LABELS = {
  drum_no: "Drum No.",
  no_of_cones: "No. of Cones",
  fault_name: "Fault Name",
  no_of_faults: "No. of Faults",
  percent_fault: "% Fault",
  weight: "Weight (Kgs)",
  length_meters: "Length (meters)",
};

const normalizeAutoconerRewindingStudyRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const readings = (Array.isArray(row.readings) ? row.readings : []).filter(
      (reading) => reading && reading.drum_no !== null && typeof reading.drum_no !== "undefined"
    );
    const { readings: _readings, drum_inspections: _drumInspections, ...headerFields } = row;
    const readingColumns = { no_of_readings_entered: readings.length };
    readings.forEach((reading, index) => {
      const n = index + 1;
      AUTOCONER_REWINDING_STUDY_METRIC_KEYS.forEach((metric) => {
        readingColumns[`rewinding_study_reading_${n}_${metric}`] = reading?.[metric] ?? null;
      });
    });
    return { ...headerFields, ...readingColumns };
  });

// Autoconer's "Cone Density" generates one reading row per drum in the user's chosen Drum
// From/To range (frontend/src/views/autoconer/ConeDensity.jsx's createReadingRows(drumFrom,
// drumTo)) — so the count is whatever range the user picked, not a fixed cap. The
// /cone-density-notebook GET route joins them into a `drums` array per submission (each shaped
// { drum_no, base_dia_e_d1, nose_dia_e_d2, base_dia_i_d3, nose_dia_i_d4, slant_height_b1,
// vertical_height_b2, cone_weight_gms, volume_cm3, density_gms_cm3, gms_litre,
// winding_speed_m_min, cn_tension, tensioner_rpm, tensioner_force, n_cradle_pressure, remarks }),
// same reasoning/guard pattern as Rewinding Study's readings above.
const AUTOCONER_CONE_DENSITY_METRIC_KEYS = [
  "drum_no", "base_dia_e_d1", "nose_dia_e_d2", "base_dia_i_d3", "nose_dia_i_d4",
  "slant_height_b1", "vertical_height_b2", "cone_weight_gms", "volume_cm3", "density_gms_cm3",
  "gms_litre", "winding_speed_m_min", "cn_tension", "tensioner_rpm", "tensioner_force",
  "n_cradle_pressure", "remarks",
];
// Labels copied verbatim from the notebook's own field labels (ConeDensity.jsx's readingFields).
const AUTOCONER_CONE_DENSITY_METRIC_LABELS = {
  drum_no: "Drum No.",
  base_dia_e_d1: "Base Dia (E) (D1)",
  nose_dia_e_d2: "Nose Dia (E) (D2)",
  base_dia_i_d3: "Base Dia (I) (D3)",
  nose_dia_i_d4: "Nose Dia (I) (D4)",
  slant_height_b1: "Slant Height (B1)",
  vertical_height_b2: "Vertical Height (B2)",
  cone_weight_gms: "Cone Weight (Gms)",
  volume_cm3: "Volume (Cm3)",
  density_gms_cm3: "Density (Gms / Cm3)",
  gms_litre: "Gms / Litre",
  winding_speed_m_min: "W.Speed (m/Min)",
  cn_tension: "cN Tension",
  tensioner_rpm: "Tensioner RPM",
  tensioner_force: "Tensioner Force",
  n_cradle_pressure: "N Cradle Pressure",
  remarks: "Remarks",
};

// The notebook's own confirmation preview shows Average/Minimum/Maximum/Range across all drums
// for Volume, Density, and Gms/Litre — computed client-side only (never sent in the payload, no
// DB column backs them). Recompute them here from the same per-drum values, same reasoning as
// Ring Frame Log Book's Guide Roll/Lycra Missing/Others totals above.
const summarizeConeDensityMetric = (drums, metric) => {
  const values = drums.map((drum) => Number(drum?.[metric])).filter((value) => Number.isFinite(value));
  if (!values.length) return { average_value: null, minimum_value: null, maximum_value: null, range: null };
  const sum = values.reduce((total, value) => total + value, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    average_value: Number((sum / values.length).toFixed(2)),
    minimum_value: Number(min.toFixed(2)),
    maximum_value: Number(max.toFixed(2)),
    range: Number((max - min).toFixed(2)),
  };
};

const normalizeAutoconerConeDensityRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const drums = (Array.isArray(row.drums) ? row.drums : []).filter(
      (drum) => drum && drum.drum_no !== null && typeof drum.drum_no !== "undefined"
    );
    const { drums: _drums, ...headerFields } = row;
    const drumColumns = { no_of_drums_entered: drums.length };
    drums.forEach((drum, index) => {
      const n = index + 1;
      AUTOCONER_CONE_DENSITY_METRIC_KEYS.forEach((metric) => {
        drumColumns[`cone_density_drum_${n}_${metric}`] = drum?.[metric] ?? null;
      });
    });
    const volumeStats = summarizeConeDensityMetric(drums, "volume_cm3");
    const densityStats = summarizeConeDensityMetric(drums, "density_gms_cm3");
    const gmsLitreStats = summarizeConeDensityMetric(drums, "gms_litre");
    return {
      ...headerFields,
      ...drumColumns,
      volume_average_value: volumeStats.average_value,
      volume_minimum_value: volumeStats.minimum_value,
      volume_maximum_value: volumeStats.maximum_value,
      volume_range: volumeStats.range,
      density_average_value: densityStats.average_value,
      density_minimum_value: densityStats.minimum_value,
      density_maximum_value: densityStats.maximum_value,
      density_range: densityStats.range,
      gms_litre_average_value: gmsLitreStats.average_value,
      gms_litre_minimum_value: gmsLitreStats.minimum_value,
      gms_litre_maximum_value: gmsLitreStats.maximum_value,
      gms_litre_range: gmsLitreStats.range,
    };
  });

// Autoconer's "Lycra % Checking" collects however many readings the user generates (the "No. of
// Readings" field, then a Generate button builds that many rows) — the GET route already joins
// them into a `readings` array per submission, but each reading only ever varies by
// `length_mm` (the notebook's own table just has "READING NO." / "READINGS (LENGTH in mm)"
// columns); lycra_weight/fabric_weight/total_weight/lycra_percent are repeated header values on
// every reading row, not distinct per-reading data, so only Length is exposed per numbered
// reading — the rest are already available as the header's own fields. Custom Report never had a
// normalizer to expose readings at all, so they always fell through to the generic fallback.
const normalizeAutoconerLycraCheckingRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const readings = (Array.isArray(row.readings) ? row.readings : []).filter(
      (reading) => reading && reading.reading_no !== null && typeof reading.reading_no !== "undefined"
    );
    const summary = isRecordObject(row.summary) ? row.summary : {};
    const { readings: _readings, summary: _summary, ...headerFields } = row;
    const readingColumns = { no_of_readings_entered: readings.length };
    readings.forEach((reading, index) => {
      const n = reading?.reading_no ?? index + 1;
      readingColumns[`lycra_checking_reading_${n}_length_mm`] = reading?.length_mm ?? null;
    });
    return {
      ...headerFields,
      ...readingColumns,
      avg_length: summary.avg_length ?? null,
    };
  });

// Autoconer's "Splice Strength" generates one reading row per drum in the user's chosen Drum
// From/To range PLUS however many readings the user takes per drum (frontend/src/views/autoconer/
// SpliceStrength.jsx's "No. of Readings" + Generate button) — the GET route already joins them
// into a `drum_readings` array per submission (each shaped { drum_no, reading_number,
// splice_strength, parent_yarn, percent_yarn }); the avg_splice_strength/avg_parent_yarn/
// avg_percent_yarn/total_readings fields are already flat top-level columns from the join (no
// nested summary object to unpack here, unlike Ring Frame/Lycra Checking). Labels copied verbatim
// from the notebook's own table headers ("DRUM NO.", "READING NUMBER", "SPLICE STRENGTH", "PARENT
// YARN STRENGTH", "PERCENT YARN").
const AUTOCONER_SPLICE_STRENGTH_METRIC_KEYS = [
  "drum_no", "reading_number", "splice_strength", "parent_yarn", "percent_yarn",
];
const AUTOCONER_SPLICE_STRENGTH_METRIC_LABELS = {
  drum_no: "Drum No.",
  reading_number: "Reading Number",
  splice_strength: "Splice Strength",
  parent_yarn: "Parent Yarn Strength",
  percent_yarn: "Percent Yarn",
};

const normalizeAutoconerSpliceStrengthRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const readings = (Array.isArray(row.drum_readings) ? row.drum_readings : []).filter(
      (reading) => reading && reading.reading_number !== null && typeof reading.reading_number !== "undefined"
    );
    const { drum_readings: _drumReadings, ...headerFields } = row;
    const readingColumns = { no_of_readings_entered: readings.length };
    readings.forEach((reading, index) => {
      const n = index + 1;
      AUTOCONER_SPLICE_STRENGTH_METRIC_KEYS.forEach((metric) => {
        readingColumns[`splice_strength_reading_${n}_${metric}`] = reading?.[metric] ?? null;
      });
    });
    return { ...headerFields, ...readingColumns };
  });

// Draw Frame's "Draw Frame Cots Data Entry" submits a variable-length `machines` array (one
// entry per machine actually filled in, each shaped differently depending on whether Process Type
// is Breaker or Finisher) — the GET response nests them as one `machines` array per submission.
// Custom Report exposes this as two separate report types sharing one fetcher (mirroring Carding's
// Between & Within Card pattern), filtered by the submission's own `sub_type` field, so each type
// only ever shows the fields that Process Type's form actually has. Keep one row per submission
// and expose each machine's own metric columns by name (e.g. "BR-1 - Fan Waste"), same reasoning
// as Carding's Thick place & CV/Card DFK Data per-machine columns. Column keys are
// `cots_<machine slug>_<metric>` (slug first) so the metric name — itself full of underscores
// (e.g. "stripper_w", "silver_worn") — can be reliably stripped back off by suffix match when
// discovering which machines are present.
const DRAWFRAME_COTS_SUB_TYPE_BY_REPORT_TYPE = {
  "Draw Frame Cots Data Entry - Breaker": "Breaker",
  "Draw Frame Cots Data Entry - Finisher": "Finisher",
};
const DRAWFRAME_COTS_METRIC_KEYS = [
  "fan_waste", "cot_change", "stripper_w", "thick_place", "auto_level", "silver_worn", "main_tin", "scanning",
];
// Breaker's own form only ever shows Fan Waste/Cot Change/Stripper Waste — "thick_place" is a
// leftover DB column the payload always sends as 0 (no UI control for it exists on the Breaker
// form at all). Finisher's form never has Breaker's 3 fields' counterparts under those names
// either (it has its own Auto Leveller/Sliver Monitor/Mass Thick Place/Scanning Roller Area).
// Restrict each report type's selectable Available Fields to only the metrics that Process
// Type's form actually renders, instead of offering fields that can never hold real data.
const DRAWFRAME_COTS_METRIC_KEYS_BY_SUB_TYPE = {
  Breaker: ["fan_waste", "cot_change", "stripper_w"],
  Finisher: ["fan_waste", "cot_change", "stripper_w", "auto_level", "silver_worn", "main_tin", "scanning"],
};
const DRAWFRAME_COTS_METRIC_LABELS = {
  fan_waste: "Fan Waste",
  cot_change: "Cot Change",
  stripper_w: "Stripper Waste",
  thick_place: "Thick Place",
  auto_level: "Auto Leveller",
  silver_worn: "Sliver Monitor",
  main_tin: "Mass Thick Place",
  scanning: "Scanning Roller Area",
};

const normalizeDrawFrameCotsRows = (subType) => (response) =>
  extractResponseRows(response)
    .filter((row) => !subType || String(row?.sub_type ?? "").trim() === subType)
    .map((row) => {
      if (!isRecordObject(row)) return row;
      const machines = Array.isArray(row.machines) ? row.machines : [];
      const { machines: _machines, ...headerFields } = row;
      const machineColumns = { no_of_machines: machines.length };
      machines.forEach((machine) => {
        const slug = slugifyMachineName(machine?.mc_name);
        if (!slug) return;
        DRAWFRAME_COTS_METRIC_KEYS.forEach((metric) => {
          if (typeof machine?.[metric] === "undefined") return;
          machineColumns[`cots_${slug}_${metric}`] = machine[metric] ?? null;
        });
      });
      return { ...headerFields, ...machineColumns };
    });

// Comber's "Comber Nolis %" is submitted through the generic PDF-OCR table pipeline shared with
// Draw Frame's A%/Simplex's Stretch % — the backend's own `sample_rows`/`summary_rows`/`meta`
// JSONB columns end up empty due to a payload key-name mismatch in the shared OCR payload builder
// (it sends `samples`/`summaries`/an array `meta`; the backend reads `sample_rows`/`summary_rows`/
// an object `meta`), so the only column that reliably holds what was actually submitted is the
// flat `rows` array — each entry tagged with its own "Row Type" ("Meta"/"Sample"/"Summary").
// Flatten that into one row per submission with named/numbered columns, same reasoning as Card
// DFK Data/Nati Data Entry's per-row expansion.
const COMBER_NOIL_SUMMARY_LABELS = ["Average Weight", "Weight (Max)", "Weight (Min)", "Range", "SD", "CV"];
const COMBER_NOIL_SUMMARY_LABEL_TO_SLUG = {
  "Average Weight": "average_weight",
  "Weight (Max)": "weight_max",
  "Weight (Min)": "weight_min",
  Range: "range",
  SD: "sd",
  CV: "cv",
};

const getComberNoilOcrRowsArray = (row) => {
  const candidates = [row?.rows, row?.manual_json, row?.ocr_json];
  return candidates.find((list) => Array.isArray(list) && list.length) || [];
};

const normalizeComberNoilRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const ocrRows = getComberNoilOcrRowsArray(row);
    const rowType = (item) => String(item?.["Row Type"] || "").trim().toLowerCase();
    const metaRow = ocrRows.find((item) => rowType(item) === "meta") || {};
    const sampleRows = ocrRows.filter((item) => rowType(item) === "sample");
    const summaryRows = ocrRows.filter((item) => rowType(item) === "summary");

    const columns = {
      test_id: metaRow["Test ID"] ?? null,
      machine_id: metaRow["Machine ID"] ?? null,
      total_test: metaRow["Total Test"] ?? null,
      number_of_entries_n: metaRow["Number of Entries (N)"] ?? null,
      tester: metaRow["Tester"] ?? null,
      std_noils_percent: metaRow["Std. Noils %"] ?? null,
      noils_percent: metaRow["Noils %"] ?? null,
      no_of_samples: sampleRows.length,
    };

    sampleRows.forEach((sampleRow, index) => {
      const n = index + 1;
      columns[`sample_${n}_sliver_wt`] = sampleRow["Sliver Wt"] ?? null;
      columns[`sample_${n}_noils_wt`] = sampleRow["Noils Wt"] ?? null;
      columns[`sample_${n}_noils_percent`] = sampleRow["Noils %"] ?? null;
    });

    summaryRows.forEach((summaryRow) => {
      const slug = COMBER_NOIL_SUMMARY_LABEL_TO_SLUG[String(summaryRow?.Label || "").trim()];
      if (!slug) return;
      columns[`summary_${slug}_sliver_wt`] = summaryRow["Sliver Wt"] ?? null;
      columns[`summary_${slug}_noils_wt`] = summaryRow["Noils Wt"] ?? null;
      columns[`summary_${slug}_noils_percent`] = summaryRow["Noils %"] ?? null;
    });

    return { ...row, ...columns };
  });

// Carding's "Card DFK Data" backend stores one flat row PER MACHINE per submission (up to 27
// machines), all sharing the same entry_id — unlike Thick place & CV/Nati Data Entry, the GET
// endpoint never nests these into an `entries` array, it just returns every machine's row as its
// own separate record. Group them back into one row per submission (by entry_id) and expose each
// machine's own 10 metric columns by name (e.g. "CDG-01 - DFK", "CDG-01 - CCD", ...), same
// reasoning as Thick place & CV's per-machine columns.
const CARD_DFK_METRIC_KEYS = [
  "dfk", "ccd", "icfd_1", "lt", "cds", "silver_draft", "icfd_2", "idf_in", "idf_out", "al_on",
];
// The form always covers this fixed machine set regardless of what's actually been submitted so
// far — used so Available Fields lists every machine's columns even before any Card DFK Data
// row exists yet (dynamic discovery from `rows` alone would show nothing on an empty table).
const CARD_DFK_MACHINE_SLUGS = Array.from({ length: 27 }, (_, index) =>
  slugifyMachineName(`CDG-${String(index + 1).padStart(2, "0")}`)
);
const CARD_DFK_METRIC_LABELS = {
  dfk: "DFK",
  ccd: "CCD",
  icfd_1: "ICFD (1)",
  lt: "LT",
  cds: "CDS",
  silver_draft: "SILVER DRAFT",
  icfd_2: "ICFD (2)",
  idf_in: "IDF IN",
  idf_out: "IDF OUT",
  al_on: "AL ON",
};

const normalizeCardingDfkRows = (response) => {
  const groups = new Map();
  extractResponseRows(response).forEach((row) => {
    if (!isRecordObject(row)) return;
    const groupId = String(row?.entry_id ?? "").trim() || `__ungrouped_${groups.size}`;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(row);
  });

  return Array.from(groups.values()).map((machineRows) => {
    const first = machineRows[0] || {};
    const machineColumns = {};
    machineRows.forEach((machineRow) => {
      const machineSlug = slugifyMachineName(machineRow?.machine_name);
      if (!machineSlug) return;
      CARD_DFK_METRIC_KEYS.forEach((metric) => {
        machineColumns[`${metric}_${machineSlug}`] = machineRow?.[metric] ?? null;
      });
    });
    return { ...first, ...machineColumns };
  });
};

// Mixing's "Openness Data Entry" collects however many entries the user generates (the "No. of
// Entries (N)" field — 5, 6, or any count, split into stages of up to 5 rows each). The GET route
// returns one wrapper per inspection shaped as { inspection, entries: [...], stage_stats: [...],
// overall }. Keep one row per submission (matching every other variable-count screen's Custom
// Report convention this session — Count Change, Splice Strength, Rewinding Study, etc.) and
// expose each entry's own fields as numbered columns, so a submission with 5 entries offers
// "Entry 1".."Entry 5" and one with 6 offers "Entry 1".."Entry 6".
const OPENNESS_ENTRY_METRIC_KEYS = [
  "machine_name", "beater_type", "beater_speed_rpm", "weight", "volume_1", "volume_2",
  "average_volume", "apparent_specific_volume", "actual_op_value",
];
// Labels copied verbatim from the notebook's own field labels (opennessDataEntry.jsx).
const OPENNESS_ENTRY_METRIC_LABELS = {
  machine_name: "Machine Name",
  beater_type: "Beater Type",
  beater_speed_rpm: "Beater Speed (RPM)",
  weight: "Weight (M)",
  volume_1: "Volume 1",
  volume_2: "Volume 2",
  average_volume: "Average Volume (V)",
  apparent_specific_volume: "Apparent Specific Vol (A=V/M)",
  actual_op_value: "Actual Op. Value (AOV)",
};

const normalizeOpennessRows = (response) =>
  extractResponseRows(response).map((wrapper) => {
    if (!isRecordObject(wrapper)) return wrapper;
    const inspection = isRecordObject(wrapper.inspection) ? wrapper.inspection : {};
    const overall = isRecordObject(wrapper.overall) ? wrapper.overall : {};
    const entries = (Array.isArray(wrapper.entries) ? wrapper.entries : []).filter(
      (entry) => entry && entry.entry_no !== null && typeof entry.entry_no !== "undefined"
    );

    const entryColumns = { no_of_entries_entered: entries.length };
    const perEntryAverageVolumes = [];
    entries.forEach((entry, index) => {
      const n = entry?.entry_no ?? index + 1;
      // "Average Volume (V)" is computed by the notebook's own preview from volume_1/volume_2 —
      // it's never actually sent in the submitted payload, so recompute it the same way here
      // rather than leaving it blank.
      const volume1 = Number(entry?.volume_1);
      const volume2 = Number(entry?.volume_2);
      const averageVolume =
        Number.isFinite(volume1) && Number.isFinite(volume2) ? Number(((volume1 + volume2) / 2).toFixed(2)) : null;
      if (averageVolume !== null) perEntryAverageVolumes.push(averageVolume);
      OPENNESS_ENTRY_METRIC_KEYS.forEach((metric) => {
        entryColumns[`openness_entry_${n}_${metric}`] =
          metric === "average_volume" ? averageVolume : (entry?.[metric] ?? null);
      });
    });

    // "Avg. Weight (M)"/"Avg. Volume (V)" have no backing column anywhere in the GET response
    // (only avg_apparent_specific_volume/avg_actual_op_value are tracked server-side) — the
    // notebook only ever showed them as a per-stage, never-submitted preview value. Compute the
    // inspection-wide average from the entries actually submitted so these aren't left blank.
    const weights = entries.map((entry) => Number(entry?.weight)).filter((value) => Number.isFinite(value));
    const avgWeight = weights.length ? Number((weights.reduce((sum, value) => sum + value, 0) / weights.length).toFixed(2)) : null;
    const avgVolume = perEntryAverageVolumes.length
      ? Number((perEntryAverageVolumes.reduce((sum, value) => sum + value, 0) / perEntryAverageVolumes.length).toFixed(2))
      : null;

    return {
      ...inspection,
      ...entryColumns,
      ...overall,
      avg_weight: avgWeight,
      avg_volume: avgVolume,
    };
  });

// Mixing's "Process Parameter" screen collects however many "blend" rows the user adds (no fixed
// count) — the GET /mixing/qc response nests them as a `blends: [...]` array per submission
// (json_agg'd from mixing.mixing_qc_blends). Custom Report previously only ever showed a single
// "Blend-1" column (aliased to whichever blend happened to match first), silently dropping every
// blend past the first — same class of bug as Openness Data Entry before it got numbered columns.
// Expose each blend's own fields as numbered columns instead, so a submission with 4 blends offers
// "Blend 1".."Blend 4" and one with 2 offers "Blend 1".."Blend 2".
const MIXING_BLEND_METRIC_KEYS = ["lot_no", "percentage", "cut_length", "tenacity", "elongation", "merge_no"];
const MIXING_BLEND_METRIC_LABELS = {
  lot_no: "Lot No.",
  percentage: "Blend %",
  cut_length: "Cut Length",
  tenacity: "Tenacity",
  elongation: "Elongation",
  merge_no: "Merge No.",
};

const normalizeMixingProcessParameterRows = (response) =>
  extractResponseRows(response).map((row) => {
    if (!isRecordObject(row)) return row;
    const blends = Array.isArray(row.blends) ? row.blends : [];
    const blendColumns = { no_of_blends_entered: blends.length };
    blends.forEach((blend, index) => {
      const n = blend?.blend_no ?? index + 1;
      MIXING_BLEND_METRIC_KEYS.forEach((metric) => {
        blendColumns[`blend_${n}_${metric}`] = blend?.[metric] ?? null;
      });
    });
    const { blends: _blends, ...rest } = row;
    return { ...rest, ...blendColumns };
  });

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
const CREATED_AT_FIELD = { key: "Created At", label: "Created At" };

const normalizeEntryKey = (value) => String(value ?? "").trim().toLowerCase();

// Priority order: try each candidate key (case/format-insensitive) in turn, and only move on to
// the next if the found value is missing/empty — an empty `entry_id` shouldn't block falling
// back to a distinct, non-empty `id` field (an empty string is not nullish, so `??` chaining
// alone would get stuck on it).
const ENTRY_KEY_CANDIDATES = ["entry_id", "entryid", "lot_no", "lotno", "id"];

// A handful of legacy rows (saved before entry_id was reliably persisted per screen) ended up with
// a raw timestamp string sitting in their entry_id column instead of a real form-generated ID —
// that's never a legitimate entry_id, so treat it the same as "missing" and keep looking at the
// next candidate (lot_no/id) rather than displaying the timestamp as if it were the ID.
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const isUsableEntryIdValue = (value) => {
  if (value === null || typeof value === "undefined" || value === "") return false;
  if (value instanceof Date) return false;
  return !ISO_TIMESTAMP_PATTERN.test(String(value));
};

const getRowEntryKey = (row) => {
  const rowKeys = Object.keys(row || {});
  for (const candidate of ENTRY_KEY_CANDIDATES) {
    const matchKey = rowKeys.find((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === candidate);
    if (!matchKey) continue;
    const value = row[matchKey];
    if (isUsableEntryIdValue(value)) return normalizeEntryKey(value);
  }
  return "";
};

// The "Entry ID" column must show exactly the ID the form itself submitted — never substitute a
// different field (lot_no, the row's numeric db id, a date, etc.) just because entry_id is
// missing/bad on that row. Only checks entry_id/entryId, and stops at "-" instead of falling
// through to getReportFieldValue's blind "first non-empty value on the row" fallback, which for a
// row with no entry_id would otherwise surface an unrelated column value as if it were the ID.
const ENTRY_ID_ONLY_CANDIDATES = ["entry_id", "entryid"];
const getRowEntryIdDisplayValue = (row) => {
  const rowKeys = Object.keys(row || {});
  for (const candidate of ENTRY_ID_ONLY_CANDIDATES) {
    const matchKey = rowKeys.find((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === candidate);
    if (!matchKey) continue;
    const value = row[matchKey];
    if (isUsableEntryIdValue(value)) return value;
  }
  return "-";
};

// Some forms (e.g. Simplex's Breaks Study) bake the operator's name straight into their own row
// instead of relying on the submitted_notebooks entry_id join — checked as a fallback so a single
// "Operator" field resolves correctly everywhere instead of needing a separate per-form field.
const ROW_OPERATOR_NAME_CANDIDATES = ["operator_name", "operatorname", "operator", "s_name", "sname", "sider_name", "sidername", "employeename", "checker_name", "checkername", "user_id", "userid"];

// Any raw/catalog field that is really just the operator's name under a different label (per-form
// column names) gets collapsed into the single canonical "Operator" field below, instead of also
// showing up as its own separate selectable field (e.g. "Operator Name", "Sider Name", "Submitted By").
const OPERATOR_LIKE_FIELD_KEYS = new Set(
  [
    "operator",
    "operator_name",
    "operatorname",
    "s_name",
    "sname",
    "sider_name",
    "sidername",
    "submitted_by",
    "submittedby",
    "submitted_by_name",
    "submittedbyname",
  ].map((key) => key.replace(/[^a-z0-9]+/g, ""))
);
const isOperatorLikeField = (field) => OPERATOR_LIKE_FIELD_KEYS.has(getCanonicalReportFieldKey(field));

// "Process Parameter ID" (Mixing/Blow Room/Carding/Simplex/Spinning's Process Parameter catalog
// entries) is just the row's own entry_id under a different label — collapse it into the single
// canonical "Entry ID" field instead of also showing up as its own separate selectable column.
const ENTRY_ID_LIKE_FIELD_KEYS = new Set(
  ["process_parameter_id"].map((key) => key.replace(/[^a-z0-9]+/g, ""))
);
const isEntryIdLikeField = (field) => ENTRY_ID_LIKE_FIELD_KEYS.has(getCanonicalReportFieldKey(field));

const getRowOperatorName = (row) => {
  const rowKeys = Object.keys(row || {});
  for (const candidate of ROW_OPERATOR_NAME_CANDIDATES) {
    const matchKey = rowKeys.find((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === candidate);
    if (!matchKey) continue;
    const value = row[matchKey];
    if (value !== null && typeof value !== "undefined" && value !== "") return String(value).trim();
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
  // Ring Frame Log Book's summary block calls its combined AC+RF figure "total_cops" on the row,
  // but the form itself labels that same value "Grand Total" — alias it so the catalog entry
  // resolves instead of falling through to the blind fallback. The bottom-of-form "Guide
  // Roll"/"Lycra Missing"/"Others" totals are computed in the ReportsPage normalizer as
  // guide_roll_total/lycra_missing_total/others_total (the form never submits them under their own
  // name — see normalizeRingFrameLogBookRows) and use the notebook's own bare label text.
  "Grand Total": ["total_cops"],
  "Guide Roll": ["guide_roll_total"],
  "Lycra Missing": ["lycra_missing_total"],
  "Others": ["others_total"],
  // Spinning Wheel Change Type 1/2 name their machine reference column "fm_no", Type 3 names it
  // "fr_no" — the form itself labels all three "R/F No." identically.
  "R/F No.": ["fm_no", "fr_no"],
  // Autoconer Rewinding Study's header column is just "count_name" (no _from/_to split, unlike
  // Spinning's Count Change), but the form itself labels it "Count Name (From)".
  "Count Name (From)": ["count_name"],
  // Autoconer Drum wise Appearance stores its machine field as "machine_code" (plain text the form
  // sends directly), not "auto_coner_no" like Rewinding Study/Cone Density/Splice Strength — this
  // alias only ever matches on screens that actually have a machine_code column; screens with their
  // own auto_coner_no column fall through to matching that directly, unaffected.
  "Auto Coner No.": ["machine_code"],
  // Mixing's AFIS-6 Cotton/MMF notebooks use scientific notation in their own field labels
  // (SCF vs the column's "sfc", %/units embedded in the label) that the generic canonical-key
  // matcher can't bridge on its own — each of these needed an explicit alias to its real column.
  "L(W)": ["l_w_mm"],
  "SCF(W)<12.70mm": ["sfc_w_percent"],
  "UQL(w)": ["uql_w_mm"],
  "L(n)": ["l_n_mm"],
  "L(n)CV": ["l_n_cv_percent"],
  "SCF(n)<12.70mm": ["sfc_n_percent"],
  "5%L(n)": ["five_pct_l_n_mm"],
  "Total Nep Mean Size µm": ["total_nep_mean_size_um"],
  "L(n) CV %": ["l_n_cv_percent"],
  "SFC(n) <12.70 mm %": ["sfc_n_percent"],
  "5% L(n) mm": ["five_pct_l_n_mm"],
  "Fineness CV %": ["fineness_cv_percent"],
  "Long Fiber >46.80 mm %": ["long_fiber_gt_46_80_percent"],
  "Long Fiber Count > 46.80 mm": ["long_fiber_count_gt_46_80"],
  // Mixing screens' "Created Date" catalog field means the real submission timestamp, but
  // "createddate" doesn't fuzzy-match the row's actual "created_at" column (no shared substring),
  // so this always fell through to the generic blind fallback before.
  "Created Date": ["created_at"],
  // Openness Data Entry's own submitted field is "br_line" (matches the form's brLine state) —
  // "br_line_no" is a separate, always-null legacy column the form never writes to, but the
  // catalog label "B/R Line No" happens to exact-canonical-match that dead column instead of the
  // real one. Alias it to the real column so it wins.
  "B/R Line No": ["br_line"],
  // Openness Data Entry's aggregate labels say "Average of X" but the backend/normalizer's own
  // field names are "avg_x" — "average" vs "avg" don't share enough of a substring for the
  // generic fuzzy fallback to bridge them.
  "Average of Apparent Specific Vol (A=V/M)": ["avg_apparent_specific_volume"],
  "Average of Actual Op. Value (AOV)": ["avg_actual_op_value"],
  // Individual Card Performance Data (trials.trials) — several catalog labels use business
  // notation (±, %, "I" for a column actually named "l"/"1") that don't share enough of a
  // substring with the real column name for the generic fuzzy fallback to bridge.
  "Carding Machine No.": ["mc_no"],
  "Short Cuts": ["shorts_cuts"],
  "U%": ["u_percent"],
  "Thin -50%": ["thin_minus_50"],
  "Thick +50%": ["thick_plus_50"],
  "Neps +200%": ["neps_plus_200"],
  "Thin -40%": ["thin_minus_40"],
  "Thick +35%": ["thick_plus_35"],
  "Neps +140%": ["neps_plus_140"],
  "Thin -30%": ["thin_minus_30"],
  "1mCV": ["cvm_1m", "im_cvm", "1m_cvm", "one_m_cvm"],
  "3mCV": ["cvm_3m", "m3_cvm", "3m_cvm", "three_m_cvm"],
  "A% (N-1)": ["a_percent_n_minus_1"],
  "A% (N+1)": ["a_percent_n_plus_1"],
  "LHS (Spindle Number)": ["lhs_value"],
  "Number of Readings (N)": ["num_readings"],
  "Number of Rows (N)": ["number_of_entries"],
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
  "B/R Line No": ["br_line"],
  "Merge No.": ["merge_no"],
  "Process Parameter ID": ["entry_id", "param_id", "paramId"],
  "Break Draft": ["breaker_draft", "break_draft"],
  "Scanning Roll Size": ["scanning_rolls_size", "scanning_roll_size"],
  "MC Name": ["machine_name", "mc_name"],
  "Mc. Name": ["mc_name"],
  // Carding's "Between & Within Card Data Entry" — the aggregate stats block for each of Sample
  // Weight/Hank comes back under short "sw_"/"h_" prefixed keys, which don't fuzzy-match their
  // much longer catalog labels at all (so they fell through to the blind fallback and showed
  // whatever unrelated field happened to be first on the row).
  "Sample Weight Calculations - Avg": ["sw_avg"],
  "Sample Weight Calculations - Max": ["sw_max"],
  "Sample Weight Calculations - Min": ["sw_min"],
  "Sample Weight Calculations - Range": ["sw_range"],
  "Sample Weight Calculations - SD": ["sw_sd"],
  "Sample Weight Calculations - CV": ["sw_cv"],
  "Hank Calculations - Avg": ["h_avg"],
  "Hank Calculations - Max": ["h_max"],
  "Hank Calculations - Min": ["h_min"],
  "Hank Calculations - Range": ["h_range"],
  "Hank Calculations - SD": ["h_sd"],
  "Hank Calculations - CV": ["h_cv"],
  "Number of Entries (N)": ["num_entries"],
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
  "1st Lickerin Speed": ["first_lickerin_speed"],
  "2nd Lickerin Speed": ["second_lickerin_speed"],
  "3rd Lickerin Speed": ["third_lickerin_speed"],
  // BR Waste Study rows carry BOTH a study-level total ("waste_percent"/"waste_kg", one value
  // for the whole study) and a per-waste-type breakdown ("waste_kgs_percent"/"waste_kgs_value",
  // via the nested waste_rows array, flattened with a "waste_rows_" prefix). Alias the per-row
  // breakdown fields straight to their exact flattened key so they never accidentally resolve to
  // the study-level total just because it happens to be present (and unprefixed) on every row.
  "Waste Type": ["waste_rows_waste_type"],
  "Waste KGs Value": ["waste_rows_waste_kgs_value"],
  "Waste KGs %": ["waste_rows_waste_kgs_percent"],
  "Total Waste KGs Value": ["waste_kg"],
  "Total Waste KGs %": ["waste_percent"],
  "Overall Waste %": ["overall_percent"],
  "Display Wt.": ["display_weight"],
  "Actual Wt.": ["actual_weight"],
  "Diff (Actual Wt. - Display Wt.)": ["difference"],
  "Ratio (Average Wt. / Total) * 100": ["ratio_percent"],
  "Number of Tufts (N)": ["no_of_tufts"],
  // Carding's Nati Data Entry normalizer stores this count as "no_of_neps_entries", Comber's
  // (same-shaped but distinct report type) stores it as "comber_no_of_neps_entries" — both need to
  // resolve against this one shared catalog label.
  "Number of Neps Entries": ["no_of_neps_entries", "comber_no_of_neps_entries"],
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
  "Fibre Nep / Gms in Silver": ["fibre_nep_gms_silver"],
  Draft: ["draft_speed"],
  "Card Thick Place Value": ["cv_value"],
  "5m CV": ["cv_5m"],
  "Feed in mm / Nep": ["feed_mm_per_nep"],
  "50% span length in LAP": ["span_length_50_lap"],
  "50% span length in Sliver": ["span_length_50_sliver"],
  "Combing Efficiency": ["combining_efficiency_formula"],
  // Comber Nolis %'s overall meta-level "Noils %" — checked as a direct/exact alias so it can
  // never accidentally resolve to one of the per-sample/per-summary "Noils %" columns instead
  // (those are distinct fields with their own numbered/labeled names, but all normalize to a key
  // containing "noils", so leaving this to fuzzy substring matching alone would be fragile).
  "Noils %": ["noils_percent"],
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

  for (const key of keys) {
    if (row?.[key] !== null && typeof row?.[key] !== "undefined" && row?.[key] !== "") return row[key];
    const target = normalizeLookupKey(key);
    const rowKeys = Object.keys(row || {});
    // Prefer an exact (case/format-insensitive) key match before falling back to substring
    // matches — otherwise a field like "Date" can incorrectly pick up "Report Date"'s value
    // just because "reportdate" contains "date". Among fuzzy matches, prefer keys coming from
    // the user-edited "rows"/"manual_json" source over the raw "ocr_json" source, since the
    // former reflects what was actually entered/saved in the form.
    const exactKey = rowKeys.find((rowKey) => normalizeLookupKey(rowKey) === target);
    const preferredFuzzyKey = rowKeys.find((rowKey) => {
      const normalizedRowKey = normalizeLookupKey(rowKey);
      return (
        (normalizedRowKey.includes(target) || target.includes(normalizedRowKey)) &&
        /^(rows|manual_json)/i.test(rowKey)
      );
    });
    const fallbackFuzzyKey = rowKeys.find((rowKey) => {
      const normalizedRowKey = normalizeLookupKey(rowKey);
      return normalizedRowKey.includes(target) || target.includes(normalizedRowKey);
    });
    const matchedKey = exactKey || preferredFuzzyKey || fallbackFuzzyKey;
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

// Matches the literal computed keys used for numbered/keyed per-reading columns: BR Waste Study's
// waste_type_N/waste_kgs_value_N/waste_kgs_N, Drop Test's tuft_variety_N/display_weight_N/
// actual_weight_N/difference_N/ratio_percent_N, the Lap CV screens' sample_N, Carding's Between &
// Within Card sample_weight_N/hank_N, Carding's Thick place & CV card_thick_place_<machine>/
// five_m_cv_<machine>, Carding's Nati Data Entry nati_mc_no_N/nati_ratio_size_1_N/
// nati_ratio_size_07_N/nati_ratio_size_05_N, and Carding's Card DFK Data
// dfk_<machine>/ccd_<machine>/icfd_1_<machine>/lt_<machine>/cds_<machine>/silver_draft_<machine>/
// icfd_2_<machine>/idf_in_<machine>/idf_out_<machine>/al_on_<machine> (see buildBrWasteTypeColumns/
// buildDropTestTuftColumns/normalizeLapCvRows/normalizeBetweenWithinCardRows/
// normalizeCardThickPlaceRows/normalizeCardingNatiRows/normalizeCardingDfkRows).
const DYNAMIC_INDEXED_FIELD_KEY_PATTERN =
  /^(waste_type|waste_kgs_value|waste_kgs|tuft_variety|display_weight|actual_weight|difference|ratio_percent|sample|sample_weight|hank|nati_mc_no|nati_ratio_size_1|nati_ratio_size_07|nati_ratio_size_05)_\d+$|^(card_thick_place|five_m_cv|dfk|ccd|icfd_1|icfd_2|lt|cds|silver_draft|idf_in|idf_out|al_on)_[a-z0-9_]+$/;

// Carding's "WheelChange" screen only ever wants the Proposed column shown in Custom Report (the
// Existing column is just read-only context inside the form itself) — but several of its parameter
// labels ("Mixing", "Cylinder Speed", "SFL", "SFD", ...) are reused verbatim by other Carding
// catalog entries (Process Parameter, etc.) with completely different raw column names, so a
// global reportFieldAliases entry would silently hijack those other screens' fields too. Scope the
// resolution to this screen specifically instead, keyed by field label straight to the row's own
// "<field>_proposed" column.
const WHEEL_CHANGE_PROPOSED_KEY_BY_LABEL = {
  Mixing: "mixing_proposed",
  "Blend %": "blend_percent_proposed",
  "Del-Hank": "del_hank_proposed",
  "Feed Weight": "feed_weight_proposed",
  "Licker-in Speed 1": "licker_in_speed_1_proposed",
  "Licker-in Speed 2": "licker_in_speed_2_proposed",
  "Cylinder Speed": "cylinder_speed_proposed",
  "Flats Speed in mm/min": "flats_speed_mm_min_proposed",
  "Feed Plate to Licker-in": "feed_plate_to_licker_in_proposed",
  SFL: "sfl_proposed",
  SFD: "sfd_proposed",
  "Cylinder to Flats": "cylinder_to_flats_proposed",
  "Cylinder to Doffer": "cylinder_in_doffer_proposed",
  "Web Speed Draft MW(V4)": "web_speed_draft_mw_v4_proposed",
  "LC-Wing Setting": "lc_wing_setting_proposed",
  "BR-RK Beater Speed": "rr_rk_beater_speed_proposed",
};

// Spinning's Wheel Change is split into 3 selectable report types (Type 1/2/3 — each backed by
// its own table: wheel_change_inspection/wheel_change_v2/wheel_change, with its own distinct
// column set), same reasoning as Carding's WheelChange above — only the Proposed value is ever
// wanted, plain label with no "(Proposed)" suffix. Unlike Carding, the SAME label can mean a
// different raw column depending on the type (e.g. "BD" is epi_proposed on Type 1, ed_proposed on
// Type 2, bd_proposed on Type 3), so each type needs its own map rather than one flat one.
const SPINNING_WHEEL_CHANGE_PROPOSED_KEY_BY_LABEL = {
  "Wheel Change Type 1": {
    "Count From": "count_from_proposed",
    "Lycra Type": "lycra_type_proposed",
    "Lycra Draft": "lycra_draft_proposed",
    "Slub Code": "slub_code_proposed",
    Ramp: "range_proposed",
    "Offset On/Off": "offset_proposed",
    "Cop or Cone Condition": "core_condition_proposed",
    "Product Qty (Kgs)": "production_proposed",
    "Roving Hank": "roving_hank_proposed",
    BDW: "eow_proposed",
    BD: "epi_proposed",
    DCA: "dca_proposed",
    DCB: "dcb_proposed",
    DFC: "dfc_proposed",
    DC: "dc_proposed",
    TCW: "tcw_proposed",
    TW: "tw_proposed",
    "TPI/TM": "tpm_proposed",
    "Travellers No.": "travelers_no_proposed",
    Spacer: "spacer_proposed",
    "Cop Weight (Grms)": "cop_weight_proposed",
    "Speed Initial (RPM)": "speed_front_proposed",
    "Speed Max (RPM)": "speed_rpm_proposed",
    "Empties Colour": "empires_colour_proposed",
    "Total Draft": "total_draft_proposed",
  },
  "Wheel Change Type 2": {
    "Count From": "count_from_proposed",
    "Lycra Type": "lycra_type_proposed",
    "Lycra Draft": "lycra_draft_proposed",
    "Slub Code": "slub_code_proposed",
    Ramp: "ramp_proposed",
    "Offset On/Off": "offset_proposed",
    "Cop or Cone Condition": "core_condition_proposed",
    "Product Qty (Kgs)": "production_proposed",
    "Raving Hank": "roving_hank_proposed",
    "Back Roll Wheel": "back_roll_wheel_proposed",
    "Change Pinion": "change_pinion_proposed",
    BDW: "edw_proposed",
    BD: "ed_proposed",
    B: "b_proposed",
    A: "a_proposed",
    D: "d_proposed",
    C: "c_proposed",
    "TPI/TM": "tpi_tpm_proposed",
    "Winding length in meters": "winding_kf_proposed",
    "Ratchet Wheel": "ratchet_wheel_proposed",
    "Travellers No.": "travelers_no_proposed",
    Spacer: "spacer_proposed",
    "Speed Initial (RPM)": "speed_spindle_proposed",
    "Speed Max (RPM)": "speed_main_proposed",
    "Empties Colour": "empires_colour_proposed",
    "Total Draft": "total_draft_proposed",
  },
  "Wheel Change Type 3": {
    "Count From": "count_from_proposed",
    "Lycra Type": "lycra_type_proposed",
    "Lycra Draft": "lycra_draft_proposed",
    "Slub Code": "slub_code_proposed",
    Ramp: "ramp_proposed",
    "Offset On/Off": "offset_on_off_proposed",
    "Cop or Cone Condition": "cop_core_condition_proposed",
    "Product Qty (Kgs)": "product_qty_proposed",
    "Raving Hank": "roving_hank_proposed",
    BDW: "bdw_proposed",
    BD: "bd_proposed",
    DCA: "dca_proposed",
    DCB: "dcb_proposed",
    DFF: "dfc_proposed",
    DC: "dc_proposed",
    TCW: "tcw_proposed",
    TW: "tw_proposed",
    "TPI/TM": "tpi_tm_proposed",
    "Travellers No.": "travelers_no_proposed",
    Spacer: "spacer_proposed",
    "Cop Weight": "cop_weight_proposed",
    "Speed Initial (RPM)": "speed_initial_proposed",
    "Speed Max (RPM)": "speed_max_proposed",
    "Empties Colour": "empties_colour_proposed",
    "Total Draft": "total_draft_proposed",
  },
  "Wheel Change Type 4": {
    "Count From": "count_from_proposed",
    "Lycra Type": "lycra_type_proposed",
    "Lycra Draft": "lycra_draft_proposed",
    "Slub Code": "slub_code_proposed",
    Range: "range_proposed",
    "Offset On/Off": "offset_proposed",
    "Core Condition": "core_condition_proposed",
    "Production (Kgs)": "production_proposed",
    "Roving Hank": "roving_hank_proposed",
    EOW: "eow_proposed",
    EPI: "epi_proposed",
    DCA: "dca_proposed",
    DCB: "dcb_proposed",
    DFC: "dfc_proposed",
    DC: "dc_proposed",
    TCW: "tcw_proposed",
    TW: "tw_proposed",
    TPM: "tpm_proposed",
    "Travellers No.": "travelers_no_proposed",
    Spacer: "spacer_proposed",
    "Cop Weight": "cop_weight_proposed",
    "Speed Front (RPM)": "speed_front_proposed",
    "Speed (RPM)": "speed_rpm_proposed",
    "Empties Colour": "empires_colour_proposed",
    "Total Draft": "total_draft_proposed",
    BDW: "bdw_proposed",
    BD: "bd_proposed",
    "Winding length in meters": "winding_length_proposed",
  },
};

// Draw Frame's Wheel Change screen is split into 7 selectable report types (Breaker Type 1-3,
// Finisher Type 1-4 — each sub-type's form has a completely different field set), and Simplex's
// own "Wheel Change" screen shares the identical row shape — both only ever want the Proposed
// value shown (never Existing), with a plain field label (no "(Proposed)" suffix) — same
// reasoning as Carding's WheelChange above. Unlike Carding, both store their parameters as an
// array of { key, label, existing, proposed } (see each screen's `WheelChange.jsx`
// `getPayload`/backend's `parameters` column), so one generic label-based lookup covers every
// sub-type/department without needing a per-type column-name map.
const PARAMETERS_ARRAY_WHEEL_CHANGE_REPORT_TYPES = {
  "Draw Frame": new Set([
    "Wheel Change - Breaker Type 1",
    "Wheel Change - Breaker Type 2",
    "Wheel Change - Breaker Type 3",
    "Wheel Change - Finisher Type 1",
    "Wheel Change - Finisher Type 2",
    "Wheel Change - Finisher Type 3",
    "Wheel Change - Finisher Type 4",
  ]),
  Simplex: new Set(["Wheel Change"]),
};

const isParametersArrayWheelChangeReport = (subDepartment, reportType) =>
  Boolean(PARAMETERS_ARRAY_WHEEL_CHANGE_REPORT_TYPES[subDepartment]?.has(reportType));

const getParametersArrayProposedValue = (row, fieldLabel) => {
  const parameters = Array.isArray(row?.parameters) ? row.parameters : [];
  const match = parameters.find((parameter) => parameter?.label === fieldLabel);
  return match ? match.proposed : undefined;
};

const getCellValue = (row, field, operatorByEntryKey = {}, context = {}) => {
  if (field.key === OPERATOR_FIELD_KEY) {
    const entryKey = getRowEntryKey(row);
    const joinedOperatorName = entryKey && operatorByEntryKey[entryKey];
    return joinedOperatorName || getRowOperatorName(row) || "-";
  }

  if (getCanonicalReportFieldKey(field) === getCanonicalReportFieldKey(ENTRY_ID_FIELD)) {
    return getRowEntryIdDisplayValue(row);
  }

  // "Individual Card performance Data" (trials.trials) has both a "Count Name" field (count_name)
  // and its own separate "Count" field (yarn_count, the notebook's own label) — the shared global
  // "Count": ["count_name"] alias (added for Count Wise Cuts Record's own "Count" field) would
  // otherwise win here since count_name genuinely exists on this row too, silently showing the
  // wrong value. Resolve this screen's "Count" directly before the generic alias lookup runs.
  if (context.reportType === "Individual Card performance Data" && (field.label || field.key) === "Count") {
    const yarnCount = row?.yarn_count;
    return yarnCount !== null && typeof yarnCount !== "undefined" && String(yarnCount).trim() !== ""
      ? String(yarnCount)
      : "-";
  }

  if (context.subDepartment === "Carding" && context.reportType === "WheelChange") {
    const proposedKey = WHEEL_CHANGE_PROPOSED_KEY_BY_LABEL[field.label || field.key];
    if (proposedKey) {
      const proposedValue = row?.[proposedKey];
      if (Array.isArray(proposedValue)) return proposedValue.length ? proposedValue.join(", ") : "-";
      return proposedValue !== null && typeof proposedValue !== "undefined" && String(proposedValue).trim() !== ""
        ? String(proposedValue)
        : "-";
    }
    if (field.label === "CDG No. (Proposed)") {
      const cdgProposed = row?.cdg_no_proposed;
      if (Array.isArray(cdgProposed)) return cdgProposed.length ? cdgProposed.join(", ") : "-";
      return cdgProposed !== null && typeof cdgProposed !== "undefined" && String(cdgProposed).trim() !== ""
        ? String(cdgProposed)
        : "-";
    }
  }

  if (context.subDepartment === "Spinning" && SPINNING_WHEEL_CHANGE_PROPOSED_KEY_BY_LABEL[context.reportType]) {
    const proposedKey = SPINNING_WHEEL_CHANGE_PROPOSED_KEY_BY_LABEL[context.reportType][field.label || field.key];
    if (proposedKey) {
      const proposedValue = row?.[proposedKey];
      return proposedValue !== null && typeof proposedValue !== "undefined" && String(proposedValue).trim() !== ""
        ? String(proposedValue)
        : "-";
    }
  }

  if (isParametersArrayWheelChangeReport(context.subDepartment, context.reportType)) {
    const proposedValue = getParametersArrayProposedValue(row, field.label || field.key);
    if (typeof proposedValue !== "undefined") {
      return proposedValue !== null && String(proposedValue).trim() !== "" ? String(proposedValue) : "-";
    }
  }

  // "Created At" must reflect the row's own real submission timestamp or nothing at all — checked
  // ahead of the generic date-field branch below, which would otherwise resolve it through
  // getReportFieldValue's blind "first non-empty value on the row" fallback whenever this column
  // is missing, and then misformat some unrelated small-number field (e.g. a reading count) as if
  // it were milliseconds-since-epoch — producing a bogus "01-01-1970" on every row.
  if (normalizeLookupKey(field.key) === "createdat" || normalizeLookupKey(field.label) === "createdat") {
    // Some Spinning tables (speed_checking, cots_checking, lycra_missing, bottom_apron_checking,
    // lycra_centering, rsm_and_lycrasensor_cheking_online/offline) name this column literally
    // "createdat" (no separator at all) rather than "created_at".
    const createdAtValue = row?.created_at ?? row?.createdAt ?? row?.CreatedAt ?? row?.createdat;
    return createdAtValue !== null && typeof createdAtValue !== "undefined" && String(createdAtValue).trim() !== ""
      ? formatDate(createdAtValue)
      : "-";
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

  // "Remarks" is a genuinely optional field on most forms — when it's blank, the row's own
  // `remarks` key still exists (just null/empty), so getReportFieldValue's generic lookup finds
  // no non-empty match under that key and falls through to its last-resort "first non-empty value
  // anywhere on the row" fallback, which ends up showing some unrelated field's value instead of a
  // clean "-". Resolve "Remarks" directly against the row's own key and stop there.
  if (normalizeLookupKey(field.key).startsWith("remarks") || normalizeLookupKey(field.label).startsWith("remarks")) {
    const remarksValue = row?.remarks ?? row?.remark ?? row?.Remarks ?? row?.Remark;
    return remarksValue !== null && typeof remarksValue !== "undefined" && String(remarksValue).trim() !== ""
      ? String(remarksValue)
      : "-";
  }

  // Numbered per-reading columns (BR Waste Study's "Waste Type N"/"Waste KGs Value N"/"Waste KGs
  // N" and Drop Test's "Tuft N - ..." fields) only exist on a row up to however many readings that
  // specific submission actually had — e.g. a 1-tuft submission has no `tuft_variety_2` key at all.
  // Resolve these directly against the row's own key (never falling through to the generic blind
  // fallback), so a reading beyond what that row has shows a clean "-" instead of some unrelated
  // field's value.
  if (DYNAMIC_INDEXED_FIELD_KEY_PATTERN.test(field.key)) {
    const indexedValue = row?.[field.key];
    return indexedValue !== null && typeof indexedValue !== "undefined" && String(indexedValue).trim() !== ""
      ? String(indexedValue)
      : "-";
  }

  // Same reasoning as the DYNAMIC_INDEXED_FIELD_KEY_PATTERN guard above — Draw Frame Cots Data
  // Entry's per-machine columns (`cots_<machine slug>_<metric>`) only exist on a row for the
  // machines that submission actually had, and their values are exactly what was submitted (a
  // Yes/No or Clean/Unclean radio choice, or a plain number) — never fall through to the generic
  // blind fallback below, which would otherwise substitute some unrelated numeric field (e.g.
  // `id`, `no_of_machines`) whenever the exact key match happened to miss.
  if (field.key.startsWith("cots_")) {
    const cotsValue = row?.[field.key];
    return cotsValue !== null && typeof cotsValue !== "undefined" && String(cotsValue).trim() !== ""
      ? String(cotsValue)
      : "-";
  }

  // Same reasoning as the cots_ guard above — Spinning's Count Change per-reading columns
  // (`count_change_reading_<N>_<metric>`) only exist on a row up to however many readings that
  // submission actually had.
  if (field.key.startsWith("count_change_reading_")) {
    const countChangeValue = row?.[field.key];
    return countChangeValue !== null && typeof countChangeValue !== "undefined" && String(countChangeValue).trim() !== ""
      ? String(countChangeValue)
      : "-";
  }

  // Same reasoning as the cots_/count_change_reading_ guards above — Ring Frame Log Book's
  // per-machine-row columns (`ring_frame_row_<N>_<metric>`) only exist on a row up to however many
  // machines that submission actually filled in.
  if (field.key.startsWith("ring_frame_row_")) {
    const ringFrameRowValue = row?.[field.key];
    return ringFrameRowValue !== null && typeof ringFrameRowValue !== "undefined" && String(ringFrameRowValue).trim() !== ""
      ? String(ringFrameRowValue)
      : "-";
  }

  // Same reasoning as the ring_frame_row_ guard above — Autoconer Rewinding Study's per-reading
  // columns (`rewinding_study_reading_<N>_<metric>`) only exist on a row up to however many drum
  // readings that submission actually had.
  if (field.key.startsWith("rewinding_study_reading_")) {
    const rewindingStudyValue = row?.[field.key];
    return rewindingStudyValue !== null && typeof rewindingStudyValue !== "undefined" && String(rewindingStudyValue).trim() !== ""
      ? String(rewindingStudyValue)
      : "-";
  }

  // Same reasoning as the rewinding_study_reading_ guard above — Autoconer Cone Density's
  // per-drum columns (`cone_density_drum_<N>_<metric>`) only exist on a row up to however many
  // drums that submission's Drum From/To range actually covered.
  if (field.key.startsWith("cone_density_drum_")) {
    const coneDensityValue = row?.[field.key];
    return coneDensityValue !== null && typeof coneDensityValue !== "undefined" && String(coneDensityValue).trim() !== ""
      ? String(coneDensityValue)
      : "-";
  }

  // Same reasoning as the cone_density_drum_ guard above — Autoconer Lycra % Checking's
  // per-reading columns (`lycra_checking_reading_<N>_length_mm`) only exist on a row up to
  // however many readings that submission's "No. of Readings" actually generated.
  if (field.key.startsWith("lycra_checking_reading_")) {
    const lycraCheckingValue = row?.[field.key];
    return lycraCheckingValue !== null && typeof lycraCheckingValue !== "undefined" && String(lycraCheckingValue).trim() !== ""
      ? String(lycraCheckingValue)
      : "-";
  }

  // Same reasoning as the lycra_checking_reading_ guard above — Autoconer Splice Strength's
  // per-reading columns (`splice_strength_reading_<N>_<metric>`) only exist on a row up to however
  // many readings that submission actually generated.
  if (field.key.startsWith("splice_strength_reading_")) {
    const spliceStrengthValue = row?.[field.key];
    return spliceStrengthValue !== null && typeof spliceStrengthValue !== "undefined" && String(spliceStrengthValue).trim() !== ""
      ? String(spliceStrengthValue)
      : "-";
  }

  // Same reasoning as the splice_strength_reading_ guard above — Mixing's Openness Data Entry
  // per-entry columns (`openness_entry_<N>_<metric>`) only exist on a row up to however many
  // entries that submission's "No. of Entries (N)" actually generated.
  if (field.key.startsWith("openness_entry_")) {
    const opennessEntryValue = row?.[field.key];
    return opennessEntryValue !== null && typeof opennessEntryValue !== "undefined" && String(opennessEntryValue).trim() !== ""
      ? String(opennessEntryValue)
      : "-";
  }

  // Same reasoning as the openness_entry_ guard above — Mixing's Process Parameter per-blend
  // columns (`blend_<N>_<metric>`) only exist on a row up to however many blends that submission
  // actually had.
  if (field.key.startsWith("blend_")) {
    const blendValue = row?.[field.key];
    return blendValue !== null && typeof blendValue !== "undefined" && String(blendValue).trim() !== ""
      ? String(blendValue)
      : "-";
  }

  // Same reasoning as the openness_entry_/blend_ guards above — Carding's and Comber's Nati Data
  // Entry per-entry columns (`nati_*_<N>` / `comber_nati_*_<N>`) are now offered for all 10 slots
  // regardless of how many entries any given row actually has (see natiEntryColumnCount /
  // comberNatiEntryColumnCount above), so most rows won't have most of these keys at all. Without
  // this guard, a missing key would fall through getReportFieldValue's blind whole-row fallback
  // and incorrectly display some unrelated field's value instead of a blank cell.
  if (field.key.startsWith("nati_") || field.key.startsWith("comber_nati_")) {
    const natiEntryValue = row?.[field.key];
    return natiEntryValue !== null && typeof natiEntryValue !== "undefined" && String(natiEntryValue).trim() !== ""
      ? String(natiEntryValue)
      : "-";
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
    // WheelChange-style screens (Draw Frame's 7 sub-types, Simplex's own) store every parameter
    // as one row inside a `parameters: [{ key, label, existing, proposed }]` array rather than as
    // flat top-level columns — inferFields only looks at top-level keys, so none of those labels
    // were ever considered "present" here. Since "Wheel Change" is also used by Spinning
    // (isAmbiguousReportType), any trivial top-level match (e.g. "Remarks") was enough to narrow
    // the catalog down to JUST that handful of matched fields, silently dropping every parameter
    // field from Available Fields even though getCellValue resolves them correctly. Fold each
    // row's parameter labels into inferredKeys too so they're recognized as present.
    rows.forEach((row) => {
      if (Array.isArray(row?.parameters)) {
        row.parameters.forEach((parameter) => {
          if (parameter?.label) inferredKeys.add(getCanonicalReportFieldKey({ key: parameter.label }));
        });
      }
    });
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
    // where it duplicates the separate "Report Date" column), for every report type under the
    // "Simplex" sub-department, and for every Draw Frame screen (which now shows "Created At"
    // instead) — other screens still genuinely use "Date" as one of their own form fields and
    // should show it. Draw Frame's PP - Breaker/Finisher Drawing use "Creation Date" for the same
    // field instead of "Date", so it needs its own scoped exclusion (kept out of the shared
    // globally-excluded list since other departments use "Creation Date" legitimately).
    // "Inspection Type" and "Checking Type" are dropped for every Spinning report type (per user
    // request — both are a fixed/constant value on these screens, not something the operator
    // actually chose, so neither is useful in Custom Report). Ring Frame Log Book additionally
    // drops "Entry Date" (also per user request), since "Created At" already surfaces the real
    // submission date/time.
    const screenExcludedReportFields =
      (subDepartment === "Wrapping" && ["Carding", "Drawing", "Simplex"].includes(reportType)) ||
      subDepartment === "Simplex"
        ? globallyExcludedReportFields
        : subDepartment === "Draw Frame"
          ? [...globallyExcludedReportFields, "Creation Date"]
          : subDepartment === "Spinning"
            ? [
                ...globallyExcludedReportFields.filter((label) => label !== "Date"),
                "Inspection Type",
                "Checking Type",
                ...(reportType === "Ring Frame Log Book" ? ["Entry Date"] : []),
              ]
            : globallyExcludedReportFields.filter((label) => label !== "Date");
    const excludedFieldKeys = new Set(
      screenExcludedReportFields.map((label) => getCanonicalReportFieldKey({ key: label }))
    );
    // Thick place & CV's backend-suggested fields (builderOptions.input_fields) include the raw,
    // un-keyed "five_m_cv"/"card_thick_place"/"machine" columns from the child readings table —
    // title-cased into ugly labels like "Five M Cv" — alongside the properly per-machine-labeled
    // columns ("CDG-01 - 5m CV") generated dynamically below. Drop the raw ones for this screen so
    // only the per-machine columns show. Also drop the header's own "Entry Code"/"Entry
    // Date"/"Entry Time"/"Remarks" columns for this screen specifically (per user request) —
    // "Entry ID" is deliberately kept, since Operator matching depends on it.
    const isCardThickPlaceScreen = subDepartment === "Carding" && reportType === "Thick place & CV";
    const CARD_THICK_PLACE_EXCLUDED_KEYS = new Set(["entrycode", "entrydate", "entrytime", "remarks"]);
    const isRawCardThickPlaceField = (field) => {
      if (!isCardThickPlaceScreen) return false;
      const key = getCanonicalReportFieldKey(field);
      return (
        key === "machine" ||
        key.includes("fivemcv") ||
        key.includes("cardthickplace") ||
        CARD_THICK_PLACE_EXCLUDED_KEYS.has(key)
      );
    };
    // Card DFK Data's backend-suggested fields include the header's own raw "inspection_type" and
    // "entry_date" columns — drop them for this screen specifically (per user request): Operator
    // and "Created At" (the row's real submission timestamp) are kept instead.
    const isCardingDfkScreen = subDepartment === "Carding" && reportType === "Card DFK Data";
    const CARD_DFK_EXCLUDED_KEYS = new Set(["inspectiontype", "entrydate"]);
    const isRawCardDfkField = (field) => {
      if (!isCardingDfkScreen) return false;
      return CARD_DFK_EXCLUDED_KEYS.has(getCanonicalReportFieldKey(field));
    };
    const definedFields = [...backendFields, ...catalogFields].filter(
      (field, index, list) =>
        field?.key &&
        !excludedFieldKeys.has(getCanonicalReportFieldKey(field)) &&
        !isOperatorLikeField(field) &&
        !isEntryIdLikeField(field) &&
        !isRawCardThickPlaceField(field) &&
        !isRawCardDfkField(field) &&
        index === list.findIndex((item) => getCanonicalReportFieldKey(item) === getCanonicalReportFieldKey(field))
    );
    // When this notebook type has a defined field set, show only those fields — no extra
    // columns pulled in from the raw row shape (ids, internal/meta keys, etc). Only fall back
    // to inferring fields from the rows when nothing is defined for this screen at all.
    const sourceFields = (definedFields.length ? definedFields : inferredFields).filter(
      (field) => !isOperatorLikeField(field) && !isEntryIdLikeField(field) && !isRawCardThickPlaceField(field) && !isRawCardDfkField(field)
    );
    // Every notebook type has an entry id, whether or not the catalog for that
    // screen happens to list it — surface it everywhere unless already present.
    const hasEntryIdField = sourceFields.some(
      (field) => getCanonicalReportFieldKey(field) === getCanonicalReportFieldKey(ENTRY_ID_FIELD)
    );
    const withEntryId = hasEntryIdField ? sourceFields : [...sourceFields, ENTRY_ID_FIELD];
    // Every notebook type entry is submitted by someone — surface who, resolved against the
    // submitted-notebooks record for that entry id, regardless of dept/type.
    const withOperator = isTeamPerformanceReport ? withEntryId : [...withEntryId, OPERATOR_FIELD];
    // Blow Room and Carding screens want to see when the form was actually submitted
    // (created_at), in addition to the form's own "inspection/creation date" field.
    const hasCreatedAtField = withOperator.some(
      (field) => getCanonicalReportFieldKey(field) === getCanonicalReportFieldKey(CREATED_AT_FIELD)
    );
    const withCreatedAt =
      ["Blow Room", "Carding", "Comber", "Draw Frame", "Simplex", "Spinning", "Autoconer", "Mixing", "Individual Card Performance"].includes(subDepartment) &&
      !hasCreatedAtField
        ? [...withOperator, CREATED_AT_FIELD]
        : withOperator;
    // BR Waste Study rows carry however many numbered waste-type readings the user entered on
    // that submission (waste_type_1/waste_kgs_value_1/waste_kgs_1, waste_type_2, ...) — surface
    // exactly as many numbered field sets as the highest count seen across the currently loaded
    // rows, so e.g. a study with 5 readings offers "Waste Type 1".."5" rather than a fixed cap.
    const brWasteStudyType =
      subDepartment === "Blow Room"
        ? BR_WASTE_STUDY_TYPE_BY_REPORT_TYPE[reportType]
        : subDepartment === "Carding"
          ? CARD_WASTE_STUDY_TYPE_BY_REPORT_TYPE[reportType]
          : null;
    const wasteTypeColumnCount = brWasteStudyType
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `waste_type_${count + 1}`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const wasteTypeFields = Array.from({ length: wasteTypeColumnCount }, (_, index) => {
      const n = index + 1;
      return [
        { key: `waste_type_${n}`, label: `Waste Type ${n}` },
        { key: `waste_kgs_value_${n}`, label: `Waste KGs Value ${n}` },
        { key: `waste_kgs_${n}`, label: `Waste KGs % ${n}` },
      ];
    }).flat();
    const withWasteTypeColumns = wasteTypeFields.length
      ? [...withCreatedAt, ...wasteTypeFields]
      : withCreatedAt;
    // Drop Test rows carry however many numbered tuft readings that submission had — same
    // reasoning as the waste-type columns above: a submission with 1 tuft only offers "Tuft 1"
    // columns, one with 5 tufts offers "Tuft 1".."5", based on what's actually in the loaded rows.
    const isDropTestReport = subDepartment === "Blow Room" && reportType === "Drop Test Data Entry";
    const tuftColumnCount = isDropTestReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `tuft_variety_${count + 1}`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const tuftFields = Array.from({ length: tuftColumnCount }, (_, index) => {
      const n = index + 1;
      return [
        { key: `tuft_variety_${n}`, label: `Tuft ${n} - Variety` },
        { key: `display_weight_${n}`, label: `Tuft ${n} - Display Wt.` },
        { key: `actual_weight_${n}`, label: `Tuft ${n} - Actual Wt.` },
        { key: `difference_${n}`, label: `Tuft ${n} - Diff (Actual Wt. - Display Wt.)` },
        { key: `ratio_percent_${n}`, label: `Tuft ${n} - Ratio (Average Wt. / Total) * 100` },
      ];
    }).flat();
    const withTuftColumns = tuftFields.length ? [...withWasteTypeColumns, ...tuftFields] : withWasteTypeColumns;
    // Lap CV rows carry however many numbered samples that submission's own "Number of Sample
    // Entries" produced — same reasoning as tufts/waste types above.
    const isLapCvReport =
      subDepartment === "Blow Room" &&
      ["B/R CV1M Data Entry Within Lap", "B/R Between Lap CV%"].includes(reportType);
    const isComberLapCvReport =
      subDepartment === "Comber" && reportType === "Ribbon Lap CV1M Data Entry";
    const sampleColumnCount = isLapCvReport || isComberLapCvReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `sample_${count + 1}`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const sampleFields = Array.from({ length: sampleColumnCount }, (_, index) => {
      const n = index + 1;
      return { key: `sample_${n}`, label: `Sample ${n}` };
    });
    const withSampleColumns = sampleFields.length ? [...withTuftColumns, ...sampleFields] : withTuftColumns;
    // Carding's Between & Within Card rows carry however many numbered Sample Weight/Hank
    // readings that submission's own "Number of Entries (N)" produced — same reasoning as the
    // tuft/waste-type/sample columns above.
    const isBetweenWithinCardReport =
      subDepartment === "Carding" && Boolean(BETWEEN_WITHIN_CARD_TYPE_BY_REPORT_TYPE[reportType]);
    const bwcEntryColumnCount = isBetweenWithinCardReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `sample_weight_${count + 1}`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const bwcEntryFields = Array.from({ length: bwcEntryColumnCount }, (_, index) => {
      const n = index + 1;
      return [
        { key: `sample_weight_${n}`, label: `Sample Weight ${n}` },
        { key: `hank_${n}`, label: `Hank ${n}` },
      ];
    }).flat();
    const withBwcEntryColumns = bwcEntryFields.length
      ? [...withSampleColumns, ...bwcEntryFields]
      : withSampleColumns;
    // Thick place & CV rows carry one pair of columns per machine actually present in the loaded
    // data (CDG-01, CDG-02, ... however many the master machine list has) rather than a fixed
    // count — collect every distinct machine slug seen and offer both its columns.
    const isCardThickPlaceReport = subDepartment === "Carding" && reportType === "Thick place & CV";
    const machineSlugs = isCardThickPlaceReport
      ? Array.from(
          new Set(
            rows.flatMap((row) =>
              Object.keys(row || {})
                .filter((key) => key.startsWith("card_thick_place_"))
                .map((key) => key.slice("card_thick_place_".length))
            )
          )
        ).sort()
      : [];
    const machineFields = machineSlugs.flatMap((slug) => {
      const label = machineSlugToLabel(slug);
      return [
        { key: `card_thick_place_${slug}`, label: `${label} - Card Thick Place Value` },
        { key: `five_m_cv_${slug}`, label: `${label} - 5m CV` },
      ];
    });
    const withMachineColumns = machineFields.length
      ? [...withBwcEntryColumns, ...machineFields]
      : withBwcEntryColumns;
    // Carding's Nati Data Entry rows carry however many numbered neps entries that submission's
    // own "Number of Neps Entries" produced — same reasoning as the tuft/waste-type/sample columns.
    // The form caps "Number of Neps Entries" at 10 (natiDataEntry.jsx), so always offer all 10
    // slots as selectable fields rather than only however many happen to appear in currently
    // loaded rows — otherwise Available Fields shows none of them until a submission with that
    // many entries has actually been made (or is within the current date filter).
    const isCardingNatiReport = subDepartment === "Carding" && reportType === "Nati Data Entry";
    const natiEntryColumnCount = isCardingNatiReport
      ? Math.max(
          10,
          rows.reduce((max, row) => {
            let count = 0;
            while (Object.prototype.hasOwnProperty.call(row || {}, `nati_mc_no_${count + 1}`)) {
              count += 1;
            }
            return Math.max(max, count);
          }, 0)
        )
      : 0;
    const natiEntryFields = Array.from({ length: natiEntryColumnCount }, (_, index) => {
      const n = index + 1;
      return [
        { key: `nati_mc_no_${n}`, label: `Entry ${n} - MC No` },
        { key: `nati_ratio_size_1_${n}`, label: `Entry ${n} - Ratio into size-1.0` },
        { key: `nati_ratio_size_07_${n}`, label: `Entry ${n} - Ratio into size-0.7` },
        { key: `nati_ratio_size_05_${n}`, label: `Entry ${n} - Ratio into size-0.5` },
      ];
    }).flat();
    const withNatiEntryColumns = natiEntryFields.length
      ? [...withMachineColumns, ...natiEntryFields]
      : withMachineColumns;
    // Comber's Nati Data Entry rows carry the same shape as Carding's above, but keyed under
    // `comber_nati_*` so the two report types' dynamic columns never collide. Same "always offer
    // all 10 slots" reasoning as Carding's above (Comber's natiDataEntry.jsx also caps at 10).
    const isComberNatiReport = subDepartment === "Comber" && reportType === "Nati Data Entry";
    const comberNatiEntryColumnCount = isComberNatiReport
      ? Math.max(
          10,
          rows.reduce((max, row) => {
            let count = 0;
            while (Object.prototype.hasOwnProperty.call(row || {}, `comber_nati_mc_no_${count + 1}`)) {
              count += 1;
            }
            return Math.max(max, count);
          }, 0)
        )
      : 0;
    const comberNatiEntryFields = Array.from({ length: comberNatiEntryColumnCount }, (_, index) => {
      const n = index + 1;
      return [
        { key: `comber_nati_mc_no_${n}`, label: `Entry ${n} - MC No` },
        { key: `comber_nati_ratio_size_1_${n}`, label: `Entry ${n} - Ratio into size-1.0` },
        { key: `comber_nati_ratio_size_07_${n}`, label: `Entry ${n} - Ratio into size-0.7` },
        { key: `comber_nati_ratio_size_05_${n}`, label: `Entry ${n} - Ratio into size-0.5` },
      ];
    }).flat();
    const withComberNatiEntryColumns = comberNatiEntryFields.length
      ? [...withNatiEntryColumns, ...comberNatiEntryFields]
      : withNatiEntryColumns;
    // Card DFK Data rows carry one set of 10 metric columns per machine actually present in the
    // loaded data (up to CDG-27), same reasoning as Thick place & CV's per-machine columns above.
    const isCardingDfkReport = subDepartment === "Carding" && reportType === "Card DFK Data";
    const dfkMachineSlugs = isCardingDfkReport
      ? Array.from(
          new Set([
            ...CARD_DFK_MACHINE_SLUGS,
            ...rows.flatMap((row) =>
              Object.keys(row || {})
                .filter((key) => key.startsWith("dfk_"))
                .map((key) => key.slice("dfk_".length))
            ),
          ])
        ).sort()
      : [];
    const dfkMachineFields = dfkMachineSlugs.flatMap((slug) => {
      const label = machineSlugToLabel(slug);
      return CARD_DFK_METRIC_KEYS.map((metric) => ({
        key: `${metric}_${slug}`,
        label: `${label} - ${CARD_DFK_METRIC_LABELS[metric]}`,
      }));
    });
    const withDfkColumns = dfkMachineFields.length
      ? [...withComberNatiEntryColumns, ...dfkMachineFields]
      : withComberNatiEntryColumns;
    // Comber Nolis % rows carry however many numbered Sample readings that submission's own
    // "Number of Entries (N)" produced, plus a fixed 6-label Summary section (Average Weight,
    // Weight (Max), Weight (Min), Range, SD, CV) — same reasoning as the tuft/waste-type/sample
    // columns above.
    const isComberNoilReport = subDepartment === "Comber" && reportType === "Comber Nolis %";
    const comberNoilSampleColumnCount = isComberNoilReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `sample_${count + 1}_sliver_wt`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const comberNoilSampleFields = Array.from({ length: comberNoilSampleColumnCount }, (_, index) => {
      const n = index + 1;
      return [
        { key: `sample_${n}_sliver_wt`, label: `Sample ${n} - Sliver Wt` },
        { key: `sample_${n}_noils_wt`, label: `Sample ${n} - Noils Wt` },
        { key: `sample_${n}_noils_percent`, label: `Sample ${n} - Noils %` },
      ];
    }).flat();
    const comberNoilSummaryFields = isComberNoilReport
      ? COMBER_NOIL_SUMMARY_LABELS.flatMap((label) => {
          const slug = COMBER_NOIL_SUMMARY_LABEL_TO_SLUG[label];
          return [
            { key: `summary_${slug}_sliver_wt`, label: `${label} - Sliver Wt` },
            { key: `summary_${slug}_noils_wt`, label: `${label} - Noils Wt` },
            { key: `summary_${slug}_noils_percent`, label: `${label} - Noils %` },
          ];
        })
      : [];
    const withComberNoilColumns =
      comberNoilSampleFields.length || comberNoilSummaryFields.length
        ? [...withDfkColumns, ...comberNoilSampleFields, ...comberNoilSummaryFields]
        : withDfkColumns;
    // Draw Frame Cots Data Entry rows carry one set of metric columns per machine actually
    // present in the loaded data (however many the user filled in — no fixed machine list, unlike
    // Card DFK Data), same reasoning as Thick place & CV's per-machine columns. Metrics offered
    // are restricted to whichever ones this report type's own Process Type form actually has.
    const drawFrameCotsSubTypeForFields =
      subDepartment === "Draw Frame" ? DRAWFRAME_COTS_SUB_TYPE_BY_REPORT_TYPE[reportType] : null;
    const isDrawFrameCotsReport = Boolean(drawFrameCotsSubTypeForFields);
    const cotsMetricKeys = drawFrameCotsSubTypeForFields
      ? DRAWFRAME_COTS_METRIC_KEYS_BY_SUB_TYPE[drawFrameCotsSubTypeForFields]
      : DRAWFRAME_COTS_METRIC_KEYS;
    const cotsMachineSlugs = isDrawFrameCotsReport
      ? Array.from(
          new Set(
            rows.flatMap((row) =>
              Object.keys(row || {})
                .filter((key) => key.startsWith("cots_"))
                .map((key) => {
                  const metric = cotsMetricKeys.find((m) => key.endsWith(`_${m}`));
                  return metric ? key.slice("cots_".length, key.length - metric.length - 1) : null;
                })
                .filter(Boolean)
            )
          )
        ).sort()
      : [];
    const cotsMachineFields = cotsMachineSlugs.flatMap((slug) => {
      const label = machineSlugToLabel(slug);
      return cotsMetricKeys.map((metric) => ({
        key: `cots_${slug}_${metric}`,
        label: `${label} - ${DRAWFRAME_COTS_METRIC_LABELS[metric]}`,
      }));
    });
    const withCotsColumns = cotsMachineFields.length
      ? [...withComberNoilColumns, ...cotsMachineFields]
      : withComberNoilColumns;
    // 1 Yard / Half Yard CV Entry rows carry however many numbered readings the user actually
    // entered, same reasoning as the sample/waste-type columns above.
    const isDrawFrameYarnCvReport = subDepartment === "Draw Frame" && reportType === "1 Yard / Half Yard CV Entry";
    const yarnCvReadingColumnCount = isDrawFrameYarnCvReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `yarn_cv_reading_${count + 1}_one_yard`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const yarnCvReadingFields = Array.from({ length: yarnCvReadingColumnCount }, (_, index) => {
      const n = index + 1;
      return [
        { key: `yarn_cv_reading_${n}_one_yard`, label: `Reading ${n} - 1 Yard` },
        { key: `yarn_cv_reading_${n}_half_yard`, label: `Reading ${n} - 1/2 Yard` },
      ];
    }).flat();
    const withYarnCvColumns = yarnCvReadingFields.length
      ? [...withCotsColumns, ...yarnCvReadingFields]
      : withCotsColumns;
    // Spinning's Count Change rows carry however many numbered readings the user actually
    // entered, same reasoning as Yarn CV's readings above.
    const isSpinningCountChangeReport = subDepartment === "Spinning" && reportType === "Count Change";
    const countChangeReadingCount = isSpinningCountChangeReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `count_change_reading_${count + 1}_reading_value`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const countChangeReadingFields = Array.from({ length: countChangeReadingCount }, (_, index) => {
      const n = index + 1;
      return SPINNING_COUNT_CHANGE_METRIC_KEYS.map((metric) => ({
        key: `count_change_reading_${n}_${metric}`,
        label: `Reading ${n} - ${SPINNING_COUNT_CHANGE_METRIC_LABELS[metric]}`,
      }));
    }).flat();
    const withCountChangeColumns = countChangeReadingFields.length
      ? [...withYarnCvColumns, ...countChangeReadingFields]
      : withYarnCvColumns;
    // Unlike Count Change/Yarn CV (genuinely variable N), Ring Frame Log Book's grid is a fixed
    // 24-row table every time (spinning.js's createRingFrameRows() always builds RING_FRAME_RF_TOTAL
    // = 24 rows, machine numbers 1-24, and the backend always inserts all 24 regardless of which
    // ones the user actually filled in) — so these fields must always be offered, not only once a
    // submission happens to be loaded. Deriving the count from `rows` (like the truly-variable
    // screens do) meant Available Fields showed nothing for these columns until a report with data
    // in the selected date range had actually loaded. Take the max of the fixed 24 and whatever's
    // actually on a loaded row, so a future row with more than 24 still isn't clipped.
    const isRingFrameLogBookReport = subDepartment === "Spinning" && reportType === "Ring Frame Log Book";
    const ringFrameRowCount = isRingFrameLogBookReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `ring_frame_row_${count + 1}_mc_no`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 24)
      : 0;
    const ringFrameRowFields = Array.from({ length: ringFrameRowCount }, (_, index) => {
      const n = index + 1;
      return RING_FRAME_ROW_METRIC_KEYS.map((metric) => ({
        key: `ring_frame_row_${n}_${metric}`,
        label: `Row ${n} - ${RING_FRAME_ROW_METRIC_LABELS[metric]}`,
      }));
    }).flat();
    const withRingFrameColumns = ringFrameRowFields.length
      ? [...withCountChangeColumns, ...ringFrameRowFields]
      : withCountChangeColumns;
    // Autoconer's Rewinding Study rows carry however many drum readings the user actually added,
    // same reasoning as Count Change's readings above.
    const isAutoconerRewindingStudyReport = subDepartment === "Autoconer" && reportType === "Rewinding Study";
    const rewindingStudyReadingCount = isAutoconerRewindingStudyReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `rewinding_study_reading_${count + 1}_drum_no`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const rewindingStudyReadingFields = Array.from({ length: rewindingStudyReadingCount }, (_, index) => {
      const n = index + 1;
      return AUTOCONER_REWINDING_STUDY_METRIC_KEYS.map((metric) => ({
        key: `rewinding_study_reading_${n}_${metric}`,
        label: `Reading ${n} - ${AUTOCONER_REWINDING_STUDY_METRIC_LABELS[metric]}`,
      }));
    }).flat();
    const withRewindingStudyColumns = rewindingStudyReadingFields.length
      ? [...withRingFrameColumns, ...rewindingStudyReadingFields]
      : withRingFrameColumns;
    // Autoconer's Cone Density rows carry however many drums the user's Drum From/To range
    // covered, same reasoning as Rewinding Study's readings above.
    const isAutoconerConeDensityReport = subDepartment === "Autoconer" && reportType === "Cone Density";
    const coneDensityDrumCount = isAutoconerConeDensityReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `cone_density_drum_${count + 1}_drum_no`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const coneDensityDrumFields = Array.from({ length: coneDensityDrumCount }, (_, index) => {
      const n = index + 1;
      return AUTOCONER_CONE_DENSITY_METRIC_KEYS.map((metric) => ({
        key: `cone_density_drum_${n}_${metric}`,
        label: `Drum ${n} - ${AUTOCONER_CONE_DENSITY_METRIC_LABELS[metric]}`,
      }));
    }).flat();
    const withConeDensityColumns = coneDensityDrumFields.length
      ? [...withRewindingStudyColumns, ...coneDensityDrumFields]
      : withRewindingStudyColumns;
    // Autoconer's Lycra % Checking rows carry however many readings the user generated, same
    // reasoning as Rewinding Study/Cone Density above.
    const isAutoconerLycraCheckingReport = subDepartment === "Autoconer" && reportType === "Lycra % Checking";
    const lycraCheckingReadingCount = isAutoconerLycraCheckingReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `lycra_checking_reading_${count + 1}_length_mm`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const lycraCheckingReadingFields = Array.from({ length: lycraCheckingReadingCount }, (_, index) => {
      const n = index + 1;
      return [{ key: `lycra_checking_reading_${n}_length_mm`, label: `Reading ${n} - Length (mm)` }];
    }).flat();
    const withLycraCheckingColumns = lycraCheckingReadingFields.length
      ? [...withConeDensityColumns, ...lycraCheckingReadingFields]
      : withConeDensityColumns;
    // Autoconer's Splice Strength rows carry however many readings the user generated, same
    // reasoning as Lycra % Checking/Cone Density above.
    const isAutoconerSpliceStrengthReport = subDepartment === "Autoconer" && reportType === "Splice Strength";
    const spliceStrengthReadingCount = isAutoconerSpliceStrengthReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `splice_strength_reading_${count + 1}_reading_number`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const spliceStrengthReadingFields = Array.from({ length: spliceStrengthReadingCount }, (_, index) => {
      const n = index + 1;
      return AUTOCONER_SPLICE_STRENGTH_METRIC_KEYS.map((metric) => ({
        key: `splice_strength_reading_${n}_${metric}`,
        label: `Reading ${n} - ${AUTOCONER_SPLICE_STRENGTH_METRIC_LABELS[metric]}`,
      }));
    }).flat();
    const withSpliceStrengthColumns = spliceStrengthReadingFields.length
      ? [...withLycraCheckingColumns, ...spliceStrengthReadingFields]
      : withLycraCheckingColumns;
    // Mixing's Openness Data Entry rows carry however many entries the user's "No. of Entries (N)"
    // generated, same reasoning as Splice Strength/Cone Density above.
    const isMixingOpennessReport = subDepartment === "Mixing" && reportType === "Openness Data Entry";
    const opennessEntryCount = isMixingOpennessReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `openness_entry_${count + 1}_weight`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const opennessEntryFields = Array.from({ length: opennessEntryCount }, (_, index) => {
      const n = index + 1;
      return OPENNESS_ENTRY_METRIC_KEYS.map((metric) => ({
        key: `openness_entry_${n}_${metric}`,
        label: `Entry ${n} - ${OPENNESS_ENTRY_METRIC_LABELS[metric]}`,
      }));
    }).flat();
    const withOpennessColumns = opennessEntryFields.length
      ? [...withSpliceStrengthColumns, ...opennessEntryFields]
      : withSpliceStrengthColumns;
    // Mixing's Process Parameter rows carry however many "blend" rows the user added, same
    // reasoning as Openness above.
    const isMixingProcessParameterReport = subDepartment === "Mixing" && reportType === "Process Parameter";
    const mixingBlendCount = isMixingProcessParameterReport
      ? rows.reduce((max, row) => {
          let count = 0;
          while (Object.prototype.hasOwnProperty.call(row || {}, `blend_${count + 1}_lot_no`)) {
            count += 1;
          }
          return Math.max(max, count);
        }, 0)
      : 0;
    const mixingBlendFields = Array.from({ length: mixingBlendCount }, (_, index) => {
      const n = index + 1;
      return MIXING_BLEND_METRIC_KEYS.map((metric) => ({
        key: `blend_${n}_${metric}`,
        label: `Blend ${n} - ${MIXING_BLEND_METRIC_LABELS[metric]}`,
      }));
    }).flat();
    const withBlendColumns = mixingBlendFields.length
      ? [...withOpennessColumns, ...mixingBlendFields]
      : withOpennessColumns;
    const selectedKeys = new Set(selectedFields.map((field) => field.key));
    return withBlendColumns.filter((field) => !selectedKeys.has(field.key));
  }, [builderOptions.input_fields, isTeamPerformanceReport, reportType, rows, selectedFields, subDepartment]);

  const filteredRows = useMemo(() => {
    if (isInvoiceDataReport) return rows;
    if (!dateFilterActive) return rows;

    // Compare calendar days as "YYYY-MM-DD" strings rather than exact timestamps — several
    // backend tables store their date as a naive/shifted timestamp (see this session's many
    // timezone fixes), so a row logically submitted "on" the selected day could parse to a JS
    // Date a few hours either side of local midnight. Comparing by day-string is immune to that,
    // and correctly includes the whole day when From Date and To Date are the same date.
    if (!startDate && !endDate) return rows;

    return rows.filter((row) => {
      const rawDate = getRowDate(row);
      if (!rawDate) return true;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return true;
      const rowDateKey = toInputDate(date);
      if (startDate && rowDateKey < startDate) return false;
      if (endDate && rowDateKey > endDate) return false;
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
    // Re-run on every report reload (same triggers as loadReport below), not just once on mount —
    // otherwise a user who submits a new form entry while this page is already open keeps seeing
    // "-" for that entry's Operator until they fully reload the page, since this was only ever
    // fetched once and never refreshed alongside the report data itself.
  }, [department, endDate, reportType, selectedReportSource, startDate, subDepartment]);

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
          isParametersArrayWheelChangeReport(subDepartment, reportType) ||
          (subDepartment === "Simplex" &&
            ["SMXCots Change Data Entry", "SMX Breaks Study Report", "Stretch %"].includes(reportType)) ||
          (subDepartment === "Spinning" && ["Count Change", "Ring Frame Log Book"].includes(reportType)) ||
          (subDepartment === "Autoconer" && ["Drum wise Appearance"].includes(reportType));
        const isOpennessReport = subDepartment === "Mixing" && reportType === "Openness Data Entry";
        const isMixingProcessParameterReport = subDepartment === "Mixing" && reportType === "Process Parameter";
        const brWasteStudyType =
          subDepartment === "Blow Room"
            ? BR_WASTE_STUDY_TYPE_BY_REPORT_TYPE[reportType]
            : subDepartment === "Carding"
              ? CARD_WASTE_STUDY_TYPE_BY_REPORT_TYPE[reportType]
              : null;
        const isDropTestReport = subDepartment === "Blow Room" && reportType === "Drop Test Data Entry";
        const isLapCvReport =
          subDepartment === "Blow Room" &&
          ["B/R CV1M Data Entry Within Lap", "B/R Between Lap CV%"].includes(reportType);
        const isComberLapCvReport =
          subDepartment === "Comber" && reportType === "Ribbon Lap CV1M Data Entry";
        const betweenWithinCardType =
          subDepartment === "Carding" ? BETWEEN_WITHIN_CARD_TYPE_BY_REPORT_TYPE[reportType] : null;
        const isCardThickPlaceReport = subDepartment === "Carding" && reportType === "Thick place & CV";
        const isCardingNatiReport = subDepartment === "Carding" && reportType === "Nati Data Entry";
        const isComberNatiReport = subDepartment === "Comber" && reportType === "Nati Data Entry";
        const isComberNoilReport = subDepartment === "Comber" && reportType === "Comber Nolis %";
        const isCardingDfkReport = subDepartment === "Carding" && reportType === "Card DFK Data";
        const drawFrameCotsSubType =
          subDepartment === "Draw Frame" ? DRAWFRAME_COTS_SUB_TYPE_BY_REPORT_TYPE[reportType] : null;
        const isDrawFrameYarnCvReport = subDepartment === "Draw Frame" && reportType === "1 Yard / Half Yard CV Entry";
        const isSpinningCountChangeReport = subDepartment === "Spinning" && reportType === "Count Change";
        const isRingFrameLogBookReport = subDepartment === "Spinning" && reportType === "Ring Frame Log Book";
        const isAutoconerRewindingStudyReport = subDepartment === "Autoconer" && reportType === "Rewinding Study";
        const isAutoconerConeDensityReport = subDepartment === "Autoconer" && reportType === "Cone Density";
        const isAutoconerLycraCheckingReport = subDepartment === "Autoconer" && reportType === "Lycra % Checking";
        const isAutoconerSpliceStrengthReport = subDepartment === "Autoconer" && reportType === "Splice Strength";
        const extractRows = isOpennessReport
          ? normalizeOpennessRows
          : isMixingProcessParameterReport
            ? normalizeMixingProcessParameterRows
            : brWasteStudyType
              ? normalizeBrWasteStudyRows(brWasteStudyType)
              : isDropTestReport
              ? normalizeDropTestRows
              : isLapCvReport
                ? normalizeLapCvRows
                : isComberLapCvReport
                  ? normalizeComberLapCvRows
                  : betweenWithinCardType
                    ? normalizeBetweenWithinCardRows(betweenWithinCardType)
                    : isCardThickPlaceReport
                      ? normalizeCardThickPlaceRows
                      : isCardingNatiReport
                        ? normalizeCardingNatiRows
                        : isComberNatiReport
                          ? normalizeComberNatiRows
                          : isComberNoilReport
                            ? normalizeComberNoilRows
                            : isCardingDfkReport
                              ? normalizeCardingDfkRows
                              : drawFrameCotsSubType
                                ? normalizeDrawFrameCotsRows(drawFrameCotsSubType)
                                : isDrawFrameYarnCvReport
                                  ? normalizeDrawFrameYarnCvRows
                                  : isSpinningCountChangeReport
                                    ? normalizeSpinningCountChangeRows
                                    : isRingFrameLogBookReport
                                      ? normalizeRingFrameLogBookRows
                                      : isAutoconerRewindingStudyReport
                                        ? normalizeAutoconerRewindingStudyRows
                                        : isAutoconerConeDensityReport
                                          ? normalizeAutoconerConeDensityRows
                                          : isAutoconerLycraCheckingReport
                                            ? normalizeAutoconerLycraCheckingRows
                                            : isAutoconerSpliceStrengthReport
                                              ? normalizeAutoconerSpliceStrengthRows
                                              : skipsNestedRowExpansion
                                                ? extractResponseRows
                                                : normalizeRows;

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
    if (!schedule.startDate && !schedule.endDate) return reportRows;

    // Same calendar-day-string comparison as filteredRows above — immune to rows whose stored
    // timestamp lands a few hours either side of local midnight, and correctly includes the whole
    // day when the schedule's From/To date are the same date.
    return reportRows.filter((row) => {
      const rawDate = getRowDate(row);
      if (!rawDate) return true;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return true;
      const rowDateKey = toInputDate(date);
      if (schedule.startDate && rowDateKey < schedule.startDate) return false;
      if (schedule.endDate && rowDateKey > schedule.endDate) return false;
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
          record[field.label] = getCellValue(row, field, operatorByEntryKey, {
            subDepartment: normalizedSchedule.subDepartment,
            reportType: normalizedSchedule.reportType,
          });
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
          .map((field) => `"${getCellValue(row, field, operatorByEntryKey, { subDepartment, reportType }).replace(/"/g, '""')}"`)
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
          sheet.addRow(fields.map((field) => getCellValue(row, field, operatorByEntryKey, { subDepartment, reportType })));
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
                  `<tr>${selectedFields.map((field) => `<td>${escapeHtmlText(getCellValue(row, field, operatorByEntryKey, { subDepartment, reportType }))}</td>`).join("")}</tr>`
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
                              <td key={field.key}>{getCellValue(row, field, operatorByEntryKey, { subDepartment, reportType })}</td>
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
