import { useEffect } from "react";
import { useRouter } from "next/router";

// PP Approval is no longer a separate config - it's part of the combined
// PP Threshold + Approval screen (per-notebook L4 Approver/Approve-Within-
// Hours). Redirect any old links/bookmarks there instead of 404ing.
export default function PpApprovalThresholdRoute() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/pp-batch-threshold");
  }, [router]);

  return null;
}
