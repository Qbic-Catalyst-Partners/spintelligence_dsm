export const today = new Date().toISOString().split("T")[0];

export const primaryTypeOptions = [
  "Yarn CV% Calculation Form",
  "Draw Frame Cots Data Entry",
];

export const processTypeOptions = ["Breaker", "Finisher"];
export const shiftOptions = ["General", "A Shift", "B Shift", "C Shift"];
export const cvMachineOptions = ["DF-01", "DF-02", "DF-03", "DF-04"];

export const createMachineEntry = (machineName = "") => ({
  machineName,
  fanWaste: "",
  cotChange: "",
  stripperWaste: "",
  thickPlace: "",
  autoLevel: "",
  silverMon: "",
  massThick: "",
  scanningR: "",
});

export const getMachineCardDefaults = (processType) => {
  const count = processType === "Finisher" ? 6 : 4;
  return Array.from({ length: count }, (_, index) => `MC-0${index + 1}`);
};

export const formatMetric = (value) =>
  Number.isFinite(value) ? value.toFixed(2) : "";

export const emptyMetric = () => ({
  avg: "",
  hank: "",
  sd: "",
  cv: "",
});
