import {
  approvePpApproval,
  fetchApprovedPpApprovals,
  fetchInactivePpApprovals,
  fetchPendingPpApprovals,
  rejectPpApproval,
} from "@/apis/ppApprovals";
import { isPpApproverUser } from "@/utils/accessControl";
import { formatDateTime } from "@/utils/formatDateTime";
import ApprovalsQueueView from "./ApprovalsQueueView";

const resolveProcessParameterDepartmentLabel = () => "Process Parameter";

const trimValue = (value) => String(value ?? "").trim();

const isDateFieldKey = (key) => /(^|_)date($|_)|_at$/i.test(String(key || ""));

const humanizeKey = (key) =>
  String(key || "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const DEPARTMENT_LABELS = {
  mixing: "Mixing",
  blowroom: "Blowroom",
  carding: "Carding",
  drawframe_breaker: "Drawframe (Breaker)",
  drawframe_finisher: "Drawframe (Finisher)",
  simplex: "Simplex",
  spinning: "Spinning",
  autoconer: "Autoconer",
  autoconer_q2: "Autoconer Q2",
  autoconer_q3: "Autoconer Q3",
  autoconer_q4: "Autoconer Q4",
};

// A PP id's completion breakdown (which departments have submitted) plus,
// once department_details is populated by the backend, every field each
// department actually entered - not just whether it's done.
const extractPpParameters = (item) => {
  if (!item || typeof item !== "object") return [];

  const rows = [];

  Object.entries(item.completion || {}).forEach(([key, submitted]) => {
    const departmentRow = item.department_details?.[key];
    const groupLabel = DEPARTMENT_LABELS[key] || humanizeKey(key);

    // group/isSectionHeader/done drive ApprovalsQueueView's grouped-section
    // rendering (same section-per-department + field-tile layout as the
    // matrix's CombinedProcessParameterPreview) instead of its default flat
    // field-card list.
    rows.push({
      key,
      group: key,
      groupLabel,
      isSectionHeader: true,
      done: submitted,
      label: groupLabel,
      value: submitted ? "Submitted" : "Not submitted yet",
    });

    if (submitted && departmentRow) {
      Object.entries(departmentRow).forEach(([fieldKey, fieldValue]) => {
        // Matches the matrix's combined preview: every field shows, blank/null
        // values render as "0" rather than being hidden.
        const trimmed = trimValue(fieldValue);
        const value = trimmed && trimmed !== "-"
          ? (isDateFieldKey(fieldKey) ? formatDateTime(trimmed) : trimmed)
          : "0";
        rows.push({
          key: `${key}.${fieldKey}`,
          group: key,
          label: humanizeKey(fieldKey),
          value,
        });
      });
    }
  });

  // Operator/Machine No. already show in the modal's own header meta block
  // (selected.operator/selected.machineNumber, ApprovalsQueueView.jsx) -
  // repeating them here as rows duplicated them.
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
      showDepartmentFilter={false}
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
