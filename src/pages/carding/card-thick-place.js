import { useEffect } from "react";
import { useRouter } from "next/router";

export default function CardThickPlacePage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/carding?type=Thick%20place%20%26%20CV");
  }, [router.isReady, router]);

  return null;
}
