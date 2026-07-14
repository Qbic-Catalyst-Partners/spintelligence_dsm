import { useEffect } from "react";
import { useRouter } from "next/router";

export default function ConePackingAuditPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/autoconer?type=Cone%20Packing%20Audit");
  }, [router.isReady, router]);

  return null;
}
