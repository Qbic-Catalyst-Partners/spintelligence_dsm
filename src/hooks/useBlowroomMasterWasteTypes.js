import { useEffect, useState } from "react";
import { fetchBlowroomMasterWasteTypes } from "@/apis/blowroom";

const useBlowroomMasterWasteTypes = () => {
  const [wasteTypeOptions, setWasteTypeOptions] = useState([]);
  const [wasteTypeOptionsError, setWasteTypeOptionsError] = useState("");
  const [loadingWasteTypeOptions, setLoadingWasteTypeOptions] = useState(false);

  const refreshWasteTypeOptions = async () => {
    setLoadingWasteTypeOptions(true);
    try {
      const options = await fetchBlowroomMasterWasteTypes();
      setWasteTypeOptions(Array.isArray(options) ? options : []);
      setWasteTypeOptionsError("");
      return Array.isArray(options) ? options : [];
    } catch (error) {
      setWasteTypeOptions([]);
      setWasteTypeOptionsError(error.message || "Unable to load waste type options.");
      return [];
    } finally {
      setLoadingWasteTypeOptions(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadWasteTypes = async () => {
      setLoadingWasteTypeOptions(true);
      try {
        const options = await fetchBlowroomMasterWasteTypes();
        if (!active) return;
        setWasteTypeOptions(Array.isArray(options) ? options : []);
        setWasteTypeOptionsError("");
      } catch (error) {
        if (!active) return;
        setWasteTypeOptions([]);
        setWasteTypeOptionsError(error.message || "Unable to load waste type options.");
      } finally {
        if (active) setLoadingWasteTypeOptions(false);
      }
    };

    loadWasteTypes();
    return () => {
      active = false;
    };
  }, []);

  return {
    wasteTypeOptions,
    wasteTypeOptionsError,
    loadingWasteTypeOptions,
    refreshWasteTypeOptions,
    setWasteTypeOptions,
  };
};

export default useBlowroomMasterWasteTypes;
