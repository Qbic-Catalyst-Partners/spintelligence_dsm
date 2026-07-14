import { useEffect, useState } from "react";
import { fetchBlowroomCountOptions } from "@/apis/blowroom";

const useBlowroomCountOptions = (screen = "header") => {
  const [countOptions, setCountOptions] = useState([]);
  const [countOptionsError, setCountOptionsError] = useState("");
  const [loadingCountOptions, setLoadingCountOptions] = useState(false);

  useEffect(() => {
    let active = true;

    const loadCounts = async () => {
      setLoadingCountOptions(true);
      try {
        const options = await fetchBlowroomCountOptions({ screen });
        if (!active) return;
        setCountOptions(Array.isArray(options) ? options : []);
        setCountOptionsError("");
      } catch (error) {
        if (!active) return;
        setCountOptions([]);
        setCountOptionsError(error.message || "Unable to load count options.");
      } finally {
        if (active) setLoadingCountOptions(false);
      }
    };

    loadCounts();

    return () => {
      active = false;
    };
  }, [screen]);

  return { countOptions, countOptionsError, loadingCountOptions };
};

export default useBlowroomCountOptions;
