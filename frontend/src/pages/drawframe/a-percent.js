import { useEffect } from "react";
import { useRouter } from "next/router";

export default function DrawFrameAPercentAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/draw-frame?type=A%25");
  }, [router]);

  return null;
}
