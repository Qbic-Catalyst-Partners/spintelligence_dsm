import { useEffect } from "react";
import { useRouter } from "next/router";

export default function NatiDataPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/carding?type=Nati%20Data%20Entry");
  }, [router.isReady, router]);

  return null;
}
