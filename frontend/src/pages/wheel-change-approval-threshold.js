import ApprovalThresholdPage from "@/views/thresholds/ApprovalThresholdPage";
import { fetchWheelChangeApprovalConfigAPI, saveWheelChangeApprovalConfigAPI } from "@/apis/wheelChangeApprovalConfigApi";

export default function WheelChangeApprovalThresholdRoute() {
  return (
    <ApprovalThresholdPage
      title="Wheel Change Approval Threshold"
      subtitle="Set the L4 approver and TAT for Wheel Change proposals."
      redirectHref="/departments"
      fetchConfigAPI={fetchWheelChangeApprovalConfigAPI}
      saveConfigAPI={saveWheelChangeApprovalConfigAPI}
    />
  );
}
