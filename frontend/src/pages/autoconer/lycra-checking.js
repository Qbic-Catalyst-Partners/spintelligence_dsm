import { useEffect } from "react";
import { useRouter } from "next/router";

export default function LycraCheckingPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/autoconer?type=Lycra%20Checking");
  }, [router.isReady, router]);

  return null;
}
