import {
  approveCardingApproval,
  fetchApprovedCardingApprovals,
  fetchPendingCardingApprovals,
  rejectCardingApproval,
} from "@/apis/cardingApprovals";
import ApprovalsQueueView from "./ApprovalsQueueView";

const resolveCardingDepartmentLabel = () => "Carding";

// Carding's carding_change_request table has no parameters/rows JSONB blob —
// each parameter is its own flat `${field}_existing`/`${field}_proposed`
// column pair (see the `field` values in src/views/carding/WheelChange.jsx's
// parameterRows), plus the separate cdo_no / cdg_no_proposed wheel fields.
const CARDING_PARAMETER_FIELDS = [
  { field: "mixing", label: "Mixing" },
  { field: "blend_percent", label: "Blend %" },
  { field: "del_hank", label: "Del-Hank" },
  { field: "feed_weight", label: "Feed Weight" },
  { field: "licker_in_speed_1", label: "Licker-in Speed 1" },
  { field: "licker_in_speed_2", label: "Licker-in Speed 2" },
  { field: "cylinder_speed", label: "Cylinder Speed" },
  { field: "flats_speed_mm_min", label: "Flats Speed in mm/min" },
  { field: "feed_plate_to_licker_in", label: "Feed Plate to Licker-in" },
  { field: "sfl", label: "SFL" },
  { field: "sfd", label: "SFD" },
  { field: "cylinder_to_flats", label: "Cylinder to Flats" },
  { field: "cylinder_in_doffer", label: "Cylinder to Doffer" },
  { field: "web_speed_draft_mw_v4", label: "Web Speed Draft MW(V4)" },
  { field: "lc_wing_setting", label: "LC-Wing Setting" },
  { field: "rr_rk_beater_speed", label: "BR-RK Beater Speed" },
];

const trimValue = (value) => String(value ?? "").trim();

const extractCardingParameters = (item) => {
  const rows = [];

  const cdoProposed = Array.isArray(item?.cdg_no_proposed)
    ? item.cdg_no_proposed.map(trimValue).filter(Boolean).join(", ")
    : trimValue(item?.cdg_no_proposed);
  if (trimValue(item?.cdo_no) || cdoProposed) {
    rows.push({ key: "cdo_no", label: "CDG No.", value: cdoProposed || trimValue(item?.cdo_no) });
  }

  CARDING_PARAMETER_FIELDS.forEach(({ field, label }) => {
    const value = trimValue(item?.[`${field}_proposed`] ?? item?.[`${field}_existing`] ?? item?.[field] ?? "");
    if (value) rows.push({ key: field, label, value });
  });

  return rows;
};

function CardingChangeControlApprovals() {
  return (
    <ApprovalsQueueView
      pageTitle="Proposed Carding Change Control Approvals"
      entityLabel="carding change control entries"
      successEntityName="Carding Change Control"
      modalTitleId="carding-change-control-approval-title"
      resolveDepartmentLabel={resolveCardingDepartmentLabel}
      extractParameters={extractCardingParameters}
      fetchPending={fetchPendingCardingApprovals}
      fetchApproved={fetchApprovedCardingApprovals}
      approve={approveCardingApproval}
      reject={rejectCardingApproval}
    />
  );
}

export default CardingChangeControlApprovals;
