import {
  approvePpApproval,
  fetchApprovedPpApprovals,
  fetchInactivePpApprovals,
  fetchPendingPpApprovals,
  rejectPpApproval,
} from "@/apis/ppApprovals";
import { isPpApproverUser } from "@/utils/accessControl";
import ApprovalsQueueView from "./ApprovalsQueueView";

const resolveProcessParameterDepartmentLabel = () => "Process Parameter";

const trimValue = (value) => String(value ?? "").trim();

// A PP id's completion breakdown (which departments have submitted) is the
// most useful thing to show while it's still in_progress/pending_approval -
// there are no per-field "parameters" to show since this is a whole PP id,
// not a single department's row.
const extractPpParameters = (item) => {
  if (!item || typeof item !== "object") return [];

  const rows = [];
  Object.entries(item.completion || {}).forEach(([key, submitted]) => {
    rows.push({
      key,
      label: key
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      value: submitted ? "Submitted" : "Not submitted yet",
    });
  });

  if (item.created_by_name) {
    rows.unshift({ key: "created_by_name", label: "Created By", value: trimValue(item.created_by_name) });
  }

  return rows;
};

function PpApprovals() {
  return (
    <ApprovalsQueueView
      pageTitle="Process Parameter (PP) Approvals"
      entityLabel="PP ids"
      successEntityName="PP ID"
      modalTitleId="pp-approval-title"
      departmentSuffix=""
      resolveDepartmentLabel={resolveProcessParameterDepartmentLabel}
      extractParameters={extractPpParameters}
      canApproveCheck={isPpApproverUser}
      accessDeniedText="Only L4, L5, or Admin can view and approve"
      tabLabels={{ pending: "Awaiting L4 Approval", approved: "Active", rejected: "Inactive" }}
      fetchPending={fetchPendingPpApprovals}
      fetchApproved={fetchApprovedPpApprovals}
      fetchRejected={fetchInactivePpApprovals}
      approve={approvePpApproval}
      reject={rejectPpApproval}
    />
  );
}

export default PpApprovals;
