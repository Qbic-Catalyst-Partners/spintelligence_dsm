import { useEffect } from "react";
import { useRouter } from "next/router";

export default function BetweenWithinCardPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/carding?type=Between%20%26%20Within%20Card%20Data%20Entry");
  }, [router.isReady, router]);

  return null;
}
