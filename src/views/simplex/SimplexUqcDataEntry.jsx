import React, { forwardRef } from "react";

import UqcEntryForm from "@/components/UqcEntryForm";
import { submitSimplexUqcEntry } from "@/apis/simplex";

const typeOptions = [
  { id: 1, name: "SMXCots Change Data Entry" },
  { id: 2, name: "SMX Breaks Study Report" },
  { id: 3, name: "U% Data Entry" },
];

const machineOptions = ["MC-01", "MC-02", "MC-03", "MC-04", "MC-05", "MC-06"];

const SimplexUqcDataEntry = forwardRef(function SimplexUqcDataEntry(
  { selectedTypeName, onTypeChange },
  ref
) {
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
