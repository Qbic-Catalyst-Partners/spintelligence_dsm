import { useEffect } from "react";
import { useRouter } from "next/router";

export default function UqcPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/carding?type=U%25%20Data%20Entry");
  }, [router.isReady, router]);

  return null;
}
