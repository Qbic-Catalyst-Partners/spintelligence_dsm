import { useEffect } from "react";
import { useRouter } from "next/router";

export default function DrawFrameHeaderAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/draw-frame?type=PP%20-%20Breaker%20Drawing&scope=breaker");
  }, [router]);

  return null;
}
