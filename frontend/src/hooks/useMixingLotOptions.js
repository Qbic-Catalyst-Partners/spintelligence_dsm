import { useEffect, useState } from "react";
import { fetchMixingLotOptions } from "@/apis/mixing";

const useMixingLotOptions = (screenName) => {
  const [lotOptions, setLotOptions] = useState([]);
  const [lotOptionsError, setLotOptionsError] = useState("");
  const [loadingLotOptions, setLoadingLotOptions] = useState(false);

  useEffect(() => {
    if (!screenName) {
      setLotOptions([]);
      setLotOptionsError("");
      setLoadingLotOptions(false);
      return undefined;
    }

    let active = true;

    const loadLots = async () => {
      setLoadingLotOptions(true);
      try {
        const options = await fetchMixingLotOptions({ screenName });
        if (!active) return;
        setLotOptions(Array.isArray(options) ? options : []);
        setLotOptionsError("");
      } catch (error) {
        if (!active) return;
        setLotOptions([]);
        setLotOptionsError(error.message || "Unable to load lot options.");
      } finally {
        if (active) {
          setLoadingLotOptions(false);
        }
      }
    };

    loadLots();

    return () => {
      active = false;
    };
  }, [screenName]);

  return { lotOptions, lotOptionsError, loadingLotOptions };
};

export default useMixingLotOptions;
