import {
  approveWheelChangeApproval,
  fetchApprovedWheelChangeApprovals,
  fetchPendingWheelChangeApprovals,
  rejectWheelChangeApproval,
} from "@/apis/wheelChangeApprovals";
import ApprovalsQueueView from "./ApprovalsQueueView";

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
      fetchPending={fetchPendingWheelChangeApprovals}
      fetchApproved={fetchApprovedWheelChangeApprovals}
      approve={approveWheelChangeApproval}
      reject={rejectWheelChangeApproval}
    />
  );
}

export default WheelChangeApprovals;
