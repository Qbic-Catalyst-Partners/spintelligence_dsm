import { useEffect } from "react";
import { useRouter } from "next/router";

export default function DrawFrameIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/draw-frame");
  }, [router]);

  return null;
}
