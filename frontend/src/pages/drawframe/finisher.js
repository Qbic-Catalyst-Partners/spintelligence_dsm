import { useEffect } from "react";
import { useRouter } from "next/router";

export default function DrawFrameFinisherAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/draw-frame?type=PP%20-%20Finisher%20Drawing&scope=finisher");
  }, [router]);

  return null;
}
