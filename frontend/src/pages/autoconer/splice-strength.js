import { useEffect } from "react";
import { useRouter } from "next/router";

export default function SpliceStrengthPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/autoconer?type=Splice%20Strength");
  }, [router.isReady, router]);

  return null;
}
