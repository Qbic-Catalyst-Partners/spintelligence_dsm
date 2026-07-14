import {
  approveSimplexWheelChangeApproval,
  fetchApprovedSimplexWheelChangeApprovals,
  fetchPendingSimplexWheelChangeApprovals,
  rejectSimplexWheelChangeApproval,
} from "@/apis/simplex";
import ApprovalsQueueView from "./ApprovalsQueueView";

const resolveSimplexDepartmentLabel = () => "Simplex";

function SimplexWheelChangeApprovals() {
  return (
    <ApprovalsQueueView
      pageTitle="Proposed Simplex Wheel Change Approvals"
      entityLabel="simplex wheel change entries"
      successEntityName="Simplex Wheel Change"
      modalTitleId="simplex-wheel-change-approval-title"
      resolveDepartmentLabel={resolveSimplexDepartmentLabel}
      fetchPending={fetchPendingSimplexWheelChangeApprovals}
      fetchApproved={fetchApprovedSimplexWheelChangeApprovals}
      approve={approveSimplexWheelChangeApproval}
      reject={rejectSimplexWheelChangeApproval}
    />
  );
}

export default SimplexWheelChangeApprovals;
