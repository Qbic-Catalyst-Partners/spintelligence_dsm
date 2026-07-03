import { useEffect } from "react";
import { useRouter } from "next/router";

export default function PendingQualityPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/autoconer?type=U%25%20Parameter%20Entries");
  }, [router.isReady, router]);

  return null;
}
