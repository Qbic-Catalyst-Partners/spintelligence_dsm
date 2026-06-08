import apiConfig from "./apiConfig";

const analysisBaseCandidates = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_ANALYSIS_API_BASE,
      "/analysis",
      "/ticket-analysis",
      "/api/analysis",
    ]
      .map((value) => String(value || "").trim().replace(/\/+$/, ""))
      .filter(Boolean)
  )
);

const requestAnalysisApi = async (path, payload = {}, method = "get") => {
  let lastError = null;

  for (const base of analysisBaseCandidates) {
    try {
      const url = `${base}${path}`;
      let response;
      if (method === "post") {
        response = await apiConfig.post(url, payload, { skipGlobalErrorModal: true });
      } else if (method === "patch") {
        response = await apiConfig.patch(url, payload, { skipGlobalErrorModal: true });
      } else {
        response = await apiConfig.get(url, payload, { skipGlobalErrorModal: true });
      }
      return response?.data || {};
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Analysis API route not found");
};

export const fetchL1AnalysisApi = (params = {}) => requestAnalysisApi("/l1", params);
export const fetchL2AnalysisApi = (params = {}) => requestAnalysisApi("/l2", params);
export const fetchAnalysisRankingApi = (params = {}) => requestAnalysisApi("/ranking", params);
export const fetchTeamPerformanceAnalysisApi = (params = {}) =>
  requestAnalysisApi("/team-performance", params);
export const saveAnalysisSnapshotApi = (payload = {}) => requestAnalysisApi("/snapshot", payload, "post");
export const fetchAnalysisNotificationsApi = () => requestAnalysisApi("/notifications");
export const markAnalysisNotificationReadApi = (id) => requestAnalysisApi(`/notifications/${id}/read`, {}, "patch");
export const fetchAnalysisSubscriptionsApi = () => requestAnalysisApi("/subscriptions");
export const saveAnalysisSubscriptionApi = (payload = {}) => requestAnalysisApi("/subscriptions", payload, "post");
export const seedAnalysisSampleDataApi = (payload = {}) =>
  requestAnalysisApi("/dev/seed-sample-data", payload, "post");

const statisticsBaseCandidates = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_STATISTICS_API_BASE,
      "/dashboard",
      "/dashbuilder",
      "/builder",
      "",
    ]
      .map((value) => String(value || "").trim().replace(/\/+$/, ""))
      .filter((value, index, arr) => arr.indexOf(value) === index)
  )
);

export const fetchStatisticsAnalyticsApi = async (params = {}) => {
  let lastError = null;

  for (const base of statisticsBaseCandidates) {
    const url = `${base}/statistics-analytics`;
    try {
      const response = await apiConfig.get(url, params, {
        skipGlobalErrorModal: true,
      });
      return response?.data || {};
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Statistics analytics API route not found");
};
