import { useEffect } from "react";
import { useRouter } from "next/router";

export default function GeneralReport() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/reports/custom");
  }, [router]);

  return null;
}
