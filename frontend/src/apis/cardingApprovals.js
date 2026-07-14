import apiConfig from "./apiConfig";

/*
 * Carding Change Control approval workflow.
 * ===========================================================
 * Separate endpoint family from /wheel-change/approvals (used by Spinning and
 * Draw Frame) — Carding's carding_change_request table has its own dedicated
 * approvals routes, gated by the same L2/admin check.
 *
 * GET  /carding/change-control/approvals?status=pending|approved
 * POST /carding/change-control/approvals/:id/approve   body: { department }
 * POST /carding/change-control/approvals/:id/reject    body: { department, reason }
 */

const extractApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) return error.response.data.message;
    if (error?.response?.data?.error) return error.response.data.error;
    return error?.message || fallbackMessage;
};

export const fetchPendingCardingApprovals = async (params = {}) => {
    try {
        const response = await apiConfig.get(
            "/carding/change-control/approvals",
            { status: "pending", ...params },
            { skipGlobalErrorModal: true }
        );
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to load pending carding change control approvals."));
    }
};

export const fetchApprovedCardingApprovals = async (params = {}) => {
    try {
        const response = await apiConfig.get(
            "/carding/change-control/approvals",
            { status: "approved", ...params },
            { skipGlobalErrorModal: true }
        );
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to load existing carding change control approvals."));
    }
};

export const approveCardingApproval = async (id, { department = "" } = {}) => {
    try {
        const response = await apiConfig.post(
            `/carding/change-control/approvals/${encodeURIComponent(id)}/approve`,
            { department },
            { skipGlobalSuccessModal: true }
        );
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to approve carding change control entry."));
    }
};

export const rejectCardingApproval = async (id, { department = "", reason = "" } = {}) => {
    try {
        const response = await apiConfig.post(
            `/carding/change-control/approvals/${encodeURIComponent(id)}/reject`,
            { department, reason },
            { skipGlobalSuccessModal: true }
        );
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to reject carding change control entry."));
    }
};
