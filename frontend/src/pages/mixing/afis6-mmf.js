import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Afis6MmfPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/mixing?type=AFIS-6%20MMF%20Data%20Entry");
  }, [router.isReady, router]);

  return null;
}
