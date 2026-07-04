import { useEffect } from "react";
import { useRouter } from "next/router";

export default function CardWasteStudyPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/carding?type=Card%20Waste%20Study");
  }, [router.isReady, router]);

  return null;
}
