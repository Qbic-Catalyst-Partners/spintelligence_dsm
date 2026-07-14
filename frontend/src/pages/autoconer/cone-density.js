import { useEffect } from "react";
import { useRouter } from "next/router";

export default function ConeDensityPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/autoconer?type=Cone%20Density");
  }, [router.isReady, router]);

  return null;
}
