import { useEffect, useState } from "react";
import { fetchEmployeeOptions } from "@/apis/employeeMaster";

const useEmployeeOptions = (module = "mixing", prefix = "") => {
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [employeeOptionsError, setEmployeeOptionsError] = useState("");
  const [loadingEmployeeOptions, setLoadingEmployeeOptions] = useState(false);

  useEffect(() => {
    let active = true;

    const loadEmployees = async () => {
      setLoadingEmployeeOptions(true);
      try {
        const options = await fetchEmployeeOptions({ module, prefix });
        if (!active) return;
        setEmployeeOptions(Array.isArray(options) ? options : []);
        setEmployeeOptionsError("");
      } catch (error) {
        if (!active) return;
        setEmployeeOptions([]);
        setEmployeeOptionsError(error.message || "Unable to load employee names.");
      } finally {
        if (active) setLoadingEmployeeOptions(false);
      }
    };

    loadEmployees();

    return () => {
      active = false;
    };
  }, [module, prefix]);

  return { employeeOptions, employeeOptionsError, loadingEmployeeOptions };
};

export default useEmployeeOptions;
