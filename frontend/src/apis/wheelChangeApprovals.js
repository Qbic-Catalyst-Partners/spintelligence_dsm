import apiConfig from "./apiConfig";

/*
 * Wheel Change approval workflow — expected backend contract
 * ===========================================================
 * Every wheel change submission (Carding, Simplex, Spinning, Draw Frame) is
 * saved with `approval_status: "pending"` and must NOT become the "existing"
 * baseline until an L2 user approves it.
 *
 * 1. POST /carding/change-control, /simplex/notebook,
 *    /spinning/wheel-change/:type, /drawframe/wheel-change/:type
 *    - Payload now carries `approval_status: "pending"` and `department`.
 *    - Store the row with that status; do not surface it as existing data.
 *
 * 2. GET /wheel-change/approvals?status=pending
 *    - Aggregated pending list across all four department tables.
 *    - Response: { data: [ { id, department, title, operator, created_at,
 *      remarks, parameters: [{ key, label, existing, proposed }] } ] }
 *
 * 3. POST /wheel-change/approvals/:id/approve   body: { department }
 *    - Marks the row `approval_status: "approved"`. Approved rows become the
 *      auto-populate source for the entry screens.
 *
 * 3b. POST /wheel-change/approvals/:id/reject   body: { department, reason }
 *    - Marks the row `approval_status: "rejected"` and stores `reason` as
 *      `review_remarks` (plus `reviewed_by`/`reviewed_at`). The row stays in
 *      the same temp table — it is NOT deleted — so the entry screen can
 *      still show it as the pending Proposed values and surface the remarks
 *      to the operator until they resubmit (which silently overwrites it).
 *
 * 4. Existing GET list/latest endpoints accept `approval_status=approved`
 *    (plus the mixing/variety filters already sent) so the entry screens
 *    only auto-populate from approved data for the selected mixing. The same
 *    `GET /wheel-change/approvals?status=approved` list backs the reviewer's
 *    "Existing Approvals" tab.
 */

const extractApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) return error.response.data.message;
    if (error?.response?.data?.error) return error.response.data.error;
    return error?.message || fallbackMessage;
};

// Preserves the HTTP status on the thrown Error (lost otherwise) so callers
// can tell "you're not allowed to see this" (403) apart from "nothing to show".
const throwWithStatus = (error, fallbackMessage) => {
    const wrapped = new Error(extractApiError(error, fallbackMessage));
    wrapped.status = error?.response?.status;
    throw wrapped;
};

export const fetchPendingWheelChangeApprovals = async (params = {}) => {
    try {
        const response = await apiConfig.get(
            "/wheel-change/approvals",
            { status: "pending", ...params },
            { skipGlobalErrorModal: true }
        );
        return response.data;
    } catch (error) {
        throwWithStatus(error, "Unable to load pending wheel change approvals.");
    }
};

export const fetchApprovedWheelChangeApprovals = async (params = {}) => {
    try {
        const response = await apiConfig.get(
            "/wheel-change/approvals",
            { status: "approved", ...params },
            { skipGlobalErrorModal: true }
        );
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to load existing wheel change approvals."));
    }
};

export const approveWheelChangeApproval = async (id, { department = "" } = {}) => {
    try {
        const response = await apiConfig.post(
            `/wheel-change/approvals/${encodeURIComponent(id)}/approve`,
            { department },
            { skipGlobalSuccessModal: true }
        );
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to approve wheel change entry."));
    }
};

export const rejectWheelChangeApproval = async (id, { department = "", reason = "" } = {}) => {
    try {
        const response = await apiConfig.post(
            `/wheel-change/approvals/${encodeURIComponent(id)}/reject`,
            { department, reason },
            { skipGlobalSuccessModal: true }
        );
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to reject wheel change entry."));
    }
};
