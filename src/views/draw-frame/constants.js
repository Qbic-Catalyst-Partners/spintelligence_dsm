export const today = new Date().toISOString().split("T")[0];

export const primaryTypeOptions = [
  "1 Yard / Half Yard CV Entry",
  "Draw Frame Cots Data Entry",
];

export const processTypeOptions = ["Breaker", "Finisher"];
export const shiftOptions = ["General", "Day", "Half Night", "Full Night"];
export const cvMachineOptions = [
  "FR (HSR 1000-1)",
  "FR (HSR 1000-2)",
  "FR 01(D 40)",
  "FR 02(D50-1)",
  "FR 03(D50-2)",
  "FR 04(D45-1)",
  "FR 05(D 45-2)",
  "FR 06(D 45-3)",
  "FR 07(D45-4)",
  "FR 08(LRSB 581)",
  "FR 09(LDF 3)",
  "FR 10(LRSB 581)",
  "FR 11(D55-1)",
];

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
  Number.isFinite(value) ? value.toFixed(4) : "";

export const emptyMetric = () => ({
  avg: "",
  hank: "",
  sd: "",
  cv: "",
});
