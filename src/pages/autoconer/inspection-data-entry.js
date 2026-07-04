import { useEffect } from "react";
import { useRouter } from "next/router";

export default function InspectionDataEntryPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/autoconer?type=Rewinding%20Study");
  }, [router.isReady, router]);

  return null;
}
