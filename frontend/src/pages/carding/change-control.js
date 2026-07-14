import { useEffect } from "react";
import { useRouter } from "next/router";

export default function ChangeControlPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    router.replace("/carding?type=WheelChange");
  }, [router.isReady, router]);

  return null;
}
