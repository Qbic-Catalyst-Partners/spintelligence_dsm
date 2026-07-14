import { useEffect, useState } from "react";
import { fetchMixingMasterVarieties } from "@/apis/mixing";

const useMixingMasterVarieties = () => {
  const [varietyOptions, setVarietyOptions] = useState([]);
  const [varietyOptionsError, setVarietyOptionsError] = useState("");
  const [loadingVarietyOptions, setLoadingVarietyOptions] = useState(false);

  useEffect(() => {
    let active = true;

    const loadVarieties = async () => {
      setLoadingVarietyOptions(true);
      try {
        const options = await fetchMixingMasterVarieties();
        if (!active) return;
        setVarietyOptions(Array.isArray(options) ? options : []);
        setVarietyOptionsError("");
      } catch (error) {
        if (!active) return;
        setVarietyOptions([]);
        setVarietyOptionsError(error.message || "Unable to load variety options.");
      } finally {
        if (active) {
          setLoadingVarietyOptions(false);
        }
      }
    };

    loadVarieties();

    return () => {
      active = false;
    };
  }, []);

  return { varietyOptions, varietyOptionsError, loadingVarietyOptions };
};

export default useMixingMasterVarieties;
