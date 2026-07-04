export const SMX_MACHINE_NAMES = [
  "SMX-01",
  "SMX-02",
  "SMX-03",
  "SMX-04",
  "SMX-05",
  "SMX-06",
  "SMX-07",
  "SMX-08",
  "SMX-09",
  "SMX-10",
  "SMX-11",
  "SMX-12",
  "SMX-13",
];

export const createSmxMachineOptions = () =>
  SMX_MACHINE_NAMES.map((name) => ({
    value: name,
    label: name,
  }));
