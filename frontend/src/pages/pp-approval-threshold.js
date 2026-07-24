import ApprovalThresholdPage from "@/views/thresholds/ApprovalThresholdPage";
import { fetchPpApprovalConfigAPI, savePpApprovalConfigAPI } from "@/apis/ppApprovalConfigApi";

export default function PpApprovalThresholdRoute() {
  return (
    <ApprovalThresholdPage
      title="PP Approval Threshold"
      subtitle="Set the L4 approver and TAT for Process Parameter approvals."
      redirectHref="/departments"
      fetchConfigAPI={fetchPpApprovalConfigAPI}
      saveConfigAPI={savePpApprovalConfigAPI}
    />
  );
}
