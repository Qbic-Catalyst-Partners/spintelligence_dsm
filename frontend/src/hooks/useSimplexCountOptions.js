import { useEffect, useState } from "react";
import { fetchSimplexCountOptions } from "@/apis/simplex";

const useSimplexCountOptions = (screen = "master") => {
  const [countOptions, setCountOptions] = useState([]);
  const [countOptionsError, setCountOptionsError] = useState("");
  const [loadingCountOptions, setLoadingCountOptions] = useState(false);

  useEffect(() => {
    let active = true;

    const loadCounts = async () => {
      setLoadingCountOptions(true);
      try {
        const options = await fetchSimplexCountOptions({ screen });
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

export default useSimplexCountOptions;
