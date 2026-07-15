import apiConfig from "./apiConfig";

const normalizeWheelChangeType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const WHEEL_CHANGE_ENDPOINTS = {
  type1: "/drawframe/wheel-change/type1",
  type2: "/drawframe/wheel-change/type2",
  type3: "/drawframe/wheel-change/type3",
  finisher_type1_lrsb: "/drawframe/wheel-change/finisher-type1-lrsb",
  type2_d40: "/drawframe/wheel-change/type2-d40",
  type3_d50_d55: "/drawframe/wheel-change/type3-d50-d55",
  type4_ldf3s: "/drawframe/wheel-change/type4-ldf3s",
};

const getWheelChangeEndpoint = (wheelChangeType = "") => {
  const normalizedType = normalizeWheelChangeType(wheelChangeType);
  return WHEEL_CHANGE_ENDPOINTS[normalizedType] || "/drawframe/wheel-change";
};

const extractApiError = (error, fallbackMessage) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  return error?.message || fallbackMessage;
};

export const submitDrawFrameWheelChangeEntry = async (payload) => {
  try {
    const response = await apiConfig.post(
      getWheelChangeEndpoint(payload?.wheel_change_type),
      payload
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Failed to create draw frame wheel change entry"));
  }
};

export const fetchDrawFrameWheelChangeEntries = async ({
  page = 1,
  limit = 1,
  wheelChangeType = "",
  ...filters
} = {}) => {
  const normalizedType = normalizeWheelChangeType(wheelChangeType);

  try {
    const response = await apiConfig.get(
      getWheelChangeEndpoint(normalizedType),
      {
        page,
        limit,
        wheel_change_type: normalizedType || undefined,
        ...filters,
      },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Failed to fetch draw frame wheel change entries"));
  }
};

// Custom Report shows each Wheel Change sub-type as its own selectable report type (Breaker Type
// 1-3, Finisher Type 1-4) rather than one combined "Wheel Change" type, since each sub-type's form
// has a completely different field set — these thin wrappers each point at that sub-type's own
// already-dedicated backend endpoint (see WHEEL_CHANGE_ENDPOINTS above).
export const fetchDrawFrameWheelChangeBreakerType1Entries = (params) =>
  fetchDrawFrameWheelChangeEntries({ ...params, wheelChangeType: "type1" });
export const fetchDrawFrameWheelChangeBreakerType2Entries = (params) =>
  fetchDrawFrameWheelChangeEntries({ ...params, wheelChangeType: "type2" });
export const fetchDrawFrameWheelChangeBreakerType3Entries = (params) =>
  fetchDrawFrameWheelChangeEntries({ ...params, wheelChangeType: "type3" });
export const fetchDrawFrameWheelChangeFinisherType1Entries = (params) =>
  fetchDrawFrameWheelChangeEntries({ ...params, wheelChangeType: "finisher_type1_lrsb" });
export const fetchDrawFrameWheelChangeFinisherType2Entries = (params) =>
  fetchDrawFrameWheelChangeEntries({ ...params, wheelChangeType: "type2_d40" });
export const fetchDrawFrameWheelChangeFinisherType3Entries = (params) =>
  fetchDrawFrameWheelChangeEntries({ ...params, wheelChangeType: "type3_d50_d55" });
export const fetchDrawFrameWheelChangeFinisherType4Entries = (params) =>
  fetchDrawFrameWheelChangeEntries({ ...params, wheelChangeType: "type4_ldf3s" });

/*
 * Draw Frame wheel-change approval workflow — its own dedicated endpoint
 * family, NOT aliased under the shared /wheel-change/approvals root that
 * Spinning uses. Aggregates across all 7 type variants (type1, type2, type3,
 * finisher-type1-lrsb, type2-d40, type3-d50-d55, type4-ldf3s) server-side
 * since they share one table. Gated to L2 reviewers/admins.
 *
 * GET  /drawframe/wheel-change/approvals?status=pending|approved|rejected
 * POST /drawframe/wheel-change/approvals/:id/approve   (no body)
 * POST /drawframe/wheel-change/approvals/:id/reject    body: { reason }
 *   — row is kept for audit (not deleted) and gets superseded automatically
 *     the next time that machine_no is resubmitted.
 */
export const fetchPendingDrawFrameWheelChangeApprovals = async (params = {}) => {
  try {
    const response = await apiConfig.get(
      "/drawframe/wheel-change/approvals",
      { status: "pending", ...params },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to load pending draw frame wheel change approvals."));
  }
};

export const fetchApprovedDrawFrameWheelChangeApprovals = async (params = {}) => {
  try {
    const response = await apiConfig.get(
      "/drawframe/wheel-change/approvals",
      { status: "approved", ...params },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to load existing draw frame wheel change approvals."));
  }
};

export const approveDrawFrameWheelChangeApproval = async (id) => {
  try {
    const response = await apiConfig.post(
      `/drawframe/wheel-change/approvals/${encodeURIComponent(id)}/approve`,
      {},
      { skipGlobalSuccessModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to approve draw frame wheel change entry."));
  }
};

export const rejectDrawFrameWheelChangeApproval = async (id, { reason = "" } = {}) => {
  try {
    const response = await apiConfig.post(
      `/drawframe/wheel-change/approvals/${encodeURIComponent(id)}/reject`,
      { reason },
      { skipGlobalSuccessModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to reject draw frame wheel change entry."));
  }
};
