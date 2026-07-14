import {
  approveDrawFrameWheelChangeApproval,
  fetchApprovedDrawFrameWheelChangeApprovals,
  fetchPendingDrawFrameWheelChangeApprovals,
  rejectDrawFrameWheelChangeApproval,
} from "@/apis/drawFrameWheelChange";
import ApprovalsQueueView from "./ApprovalsQueueView";

const resolveDrawFrameDepartmentLabel = () => "Draw Frame";

function DrawFrameWheelChangeApprovals() {
  return (
    <ApprovalsQueueView
      pageTitle="Proposed Draw Frame Wheel Change Approvals"
      entityLabel="draw frame wheel change entries"
      successEntityName="Draw Frame Wheel Change"
      modalTitleId="drawframe-wheel-change-approval-title"
      resolveDepartmentLabel={resolveDrawFrameDepartmentLabel}
      fetchPending={fetchPendingDrawFrameWheelChangeApprovals}
      fetchApproved={fetchApprovedDrawFrameWheelChangeApprovals}
      approve={approveDrawFrameWheelChangeApproval}
      reject={rejectDrawFrameWheelChangeApproval}
    />
  );
}

export default DrawFrameWheelChangeApprovals;
