import apiConfig from "./apiConfig";

/*
 * Process Parameter (PP) approval workflow.
 *
 * A PP id (PP-000N) moves through 4 stages tracked on process_parameters.master:
 *   in_progress      - created, still waiting on one or more departments
 *   pending_approval - every department has submitted; waiting on L4
 *   active           - L4 approved the whole PP id; unlocks exactly one
 *                      Wheel Change for its Count + Consignee
 *   inactive         - a Wheel Change has been saved against it (reverts to
 *                      active if that Wheel Change is later rejected)
 *
 * This is ONE approval per PP id (by L4/L5/Admin) - not per department.
 */

const extractApiError = (error, fallbackMessage) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  return error?.message || fallbackMessage;
};

const throwWithStatus = (error, fallbackMessage) => {
  const wrapped = new Error(extractApiError(error, fallbackMessage));
  wrapped.status = error?.response?.status;
  throw wrapped;
};

export const fetchPendingPpApprovals = async (params = {}) => {
  try {
    const response = await apiConfig.get(
      "/process-parameters/approvals",
      { status: "pending_approval", ...params },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throwWithStatus(error, "Unable to load pending PP approvals.");
  }
};

export const fetchApprovedPpApprovals = async (params = {}) => {
  try {
    const response = await apiConfig.get(
      "/process-parameters/approvals",
      { status: "active", ...params },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throwWithStatus(error, "Unable to load active PP ids.");
  }
};

export const fetchInactivePpApprovals = async (params = {}) => {
  try {
    const response = await apiConfig.get(
      "/process-parameters/approvals",
      { status: "inactive", ...params },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throwWithStatus(error, "Unable to load inactive PP ids.");
  }
};

export const approvePpApproval = async (entryId, { department = "" } = {}) => {
  try {
    const response = await apiConfig.post(
      `/process-parameters/${encodeURIComponent(entryId)}/approve`,
      { department },
      { skipGlobalSuccessModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to approve this PP id."));
  }
};

export const rejectPpApproval = async (entryId, { department = "", reason = "" } = {}) => {
  try {
    const response = await apiConfig.post(
      `/process-parameters/${encodeURIComponent(entryId)}/reject`,
      { department, reason },
      { skipGlobalSuccessModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to reject this PP id."));
  }
};
