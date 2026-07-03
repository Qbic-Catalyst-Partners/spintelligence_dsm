import { useEffect } from "react";
import { useRouter } from "next/router";

export default function TrialsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/carding?type=Trials%20Data%20Entry%20Form");
  }, [router.isReady, router]);

  return null;
}
