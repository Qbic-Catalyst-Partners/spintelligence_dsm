import { useEffect, useState } from "react";
import { fetchAutoconerCountMaster } from "@/apis/autoconer";

const useAutoconerCountOptions = (screen = "") => {
  const [countOptions, setCountOptions] = useState([]);
  const [countOptionsError, setCountOptionsError] = useState("");
  const [loadingCountOptions, setLoadingCountOptions] = useState(false);

  useEffect(() => {
    let active = true;

    const loadCountOptions = async () => {
      setLoadingCountOptions(true);
      try {
        const options = await fetchAutoconerCountMaster({ screen });
        if (!active) return;
        setCountOptions(Array.isArray(options) ? options : []);
        setCountOptionsError("");
      } catch (error) {
        if (!active) return;
        setCountOptions([]);
        setCountOptionsError(error.message || "Unable to load count names.");
      } finally {
        if (active) setLoadingCountOptions(false);
      }
    };

    loadCountOptions();

    return () => {
      active = false;
    };
  }, [screen]);

  return { countOptions, countOptionsError, loadingCountOptions };
};

export default useAutoconerCountOptions;
