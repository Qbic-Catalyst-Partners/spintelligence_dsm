import {
  approveWheelChangeApproval,
  fetchApprovedWheelChangeApprovals,
  fetchPendingWheelChangeApprovals,
  rejectWheelChangeApproval,
} from "@/apis/wheelChangeApprovals";
import ApprovalsQueueView from "./ApprovalsQueueView";

const resolveSpinningDepartmentLabel = () => "Spinning";

// Known abbreviations that shouldn't go through title-case humanization
// (e.g. "bdw" -> "BDW", not "Bdw"). Anything not listed just gets
// Title Cased word-by-word.
const SPINNING_FIELD_LABEL_OVERRIDES = {
  count_from: "Count",
  bdw: "BDW", edw: "EDW", bd: "BD", ed: "ED", dca: "DCA", dcb: "DCB",
  dfc: "DFC", dc: "DC", tcw: "TCW", tw: "TW", tpm: "TPM", eow: "EOW", epi: "EPI",
  tpi_tpm: "TPI/TPM", tpi_tm: "TPI/TM", a: "A", b: "B", c: "C", d: "D",
  ramp: "Ramp", range: "Range",
  cop_core_condition: "Cop/Core Condition",
  offset_on_off: "Offset (On/Off)",
  product_qty: "Product Qty (Kgs)",
  empties_colour: "Empties Colour",
  empires_colour: "Empires Colour",
  winding_kf: "Winding KF",
};

const humanizeSpinningField = (field) =>
  SPINNING_FIELD_LABEL_OVERRIDES[field] ||
  field
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const trimValue = (value) => String(value ?? "").trim();

// Spinning's four wheel-change tables (type1-4) each store parameters as flat
// `${field}_existing`/`${field}_proposed` column pairs, not a parameters/rows
// JSONB blob - same shape as Carding (see CardingChangeControlApprovals.jsx),
// but Spinning's field names vary per type, so fields are discovered
// dynamically from whatever `${x}_proposed` columns are present on the row
// rather than hand-listing all four types' schemas.
const extractSpinningWheelChangeParameters = (item) => {
  if (!item || typeof item !== "object") return [];

  const rows = [];
  const seen = new Set();
  Object.keys(item).forEach((key) => {
    if (!key.endsWith("_proposed")) return;
    const field = key.slice(0, -"_proposed".length);
    if (seen.has(field)) return;
    seen.add(field);

    const proposed = trimValue(item[key]);
    const existing = trimValue(item[`${field}_existing`]);
    if (!proposed && !existing) return;

    rows.push({
      key: field,
      label: humanizeSpinningField(field),
      value: proposed || existing,
    });
  });

  return rows;
};

// Draw Frame is NOT aliased under this shared /wheel-change/approvals root —
// it has its own dedicated endpoint family (/drawframe/wheel-change/approvals*,
// see DrawFrameWheelChangeApprovals.jsx), so this list is Spinning-only.
function WheelChangeApprovals() {
  return (
    <ApprovalsQueueView
      pageTitle="Proposed Spinning Wheel Change Approvals"
      entityLabel="spinning wheel change entries"
      successEntityName="Wheel Change"
      modalTitleId="wheel-change-approval-title"
      resolveDepartmentLabel={resolveSpinningDepartmentLabel}
      extractParameters={extractSpinningWheelChangeParameters}
      fetchPending={fetchPendingWheelChangeApprovals}
      fetchApproved={fetchApprovedWheelChangeApprovals}
      approve={approveWheelChangeApproval}
      reject={rejectWheelChangeApproval}
    />
  );
}

export default WheelChangeApprovals;
