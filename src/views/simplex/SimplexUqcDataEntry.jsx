import React, { forwardRef, useEffect, useState } from "react";

import UqcEntryForm from "@/components/UqcEntryForm";
import { fetchSimplexMachineMaster, submitSimplexUqcEntry } from "@/apis/simplex";

const typeOptions = [
  { id: 1, name: "SMXCots Change Data Entry" },
  { id: 2, name: "SMX Breaks Study Report" },
  { id: 3, name: "U% Data Entry" },
];

const SimplexUqcDataEntry = forwardRef(function SimplexUqcDataEntry(
  { selectedTypeName, onTypeChange },
  ref
) {
  const [machineOptions, setMachineOptions] = useState([]);

  useEffect(() => {
    let active = true;

    fetchSimplexMachineMaster({ department: "SIMPLEX" })
      .then((options) => {
        if (!active) return;
        setMachineOptions(Array.isArray(options) ? options : []);
      })
      .catch(() => {
        if (!active) return;
        setMachineOptions([]);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <UqcEntryForm
      ref={ref}
      typeOptions={typeOptions}
      selectedType={selectedTypeName}
      onTypeChange={onTypeChange}
      departmentValue="Simplex Department"
      machineOptions={machineOptions}
      submitHandler={submitSimplexUqcEntry}
    />
  );
});

export default SimplexUqcDataEntry;
