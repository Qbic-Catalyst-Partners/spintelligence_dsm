import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Reports() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/reports/custom");
  }, [router]);

  return null;
}
