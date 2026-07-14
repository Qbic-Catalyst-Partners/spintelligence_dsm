import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getAutoconerCountWiseCuts,
  saveAutoconerCountWiseCuts,
} from "@/store/slices/autoconer";
import { fetchAutoconerCountWiseCutsMasterData } from "@/apis/autoconer";
import SearchableSelect from "@/components/SearchableSelect";
import styles from "@/styles/countwise.module.css";
import { sanitizeNumericInput } from "@/utils/inputValidation";


const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const countOptions = [
  "Select Count Name",
  "30S Cotton",
  "40S Poly Cotton",
  "40s Cotton",
  "20S Blended Yarn",
];

const machineOptions = ["Select", "MC-01", "AC-01", "AC-02", "AC-03"];

const metricKeys = [
  "YF",
  "YJ",
  "N",
  "S",
  "L",
  "T",
  "CP",
  "CM",
  "CCP",
  "CCM",
  "PC",
  "FD",
  "JP",
  "JM",
  "CVT",
  "A1",
  "A2",
  "A3",
  "A4",
  "B1",
  "B2",
  "B3",
  "B4",
  "C1",
  "C2",
  "C3",
  "C4",
  "D1",
  "D2",
  "D3",
  "D4",
  "E",
  "F",
  "G",
  "H1",
  "H2",
  "I1",
  "I2",
];

const createInitialMetrics = () =>
  metricKeys.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});

const mapApiEntryToMetrics = (entry = {}) => ({
  YF: entry.yf ?? "",
  YJ: entry.yj ?? "",
  N: entry.n ?? "",
  S: entry.s ?? "",
  L: entry.l ?? "",
  T: entry.t ?? "",
  CP: entry.cp ?? "",
  CM: entry.cm ?? "",
  CCP: entry.ccp ?? "",
  CCM: entry.ccm ?? "",
  PC: entry.pc ?? "",
  FD: entry.fd ?? "",
  JP: entry.jp ?? "",
  JM: entry.jm ?? "",
  CVT: entry.cvd ?? "",
  A1: entry.a1 ?? "",
  A2: entry.a2 ?? "",
  A3: entry.a3 ?? "",
  A4: entry.a4 ?? "",
  B1: entry.b1 ?? "",
  B2: entry.b2 ?? "",
  B3: entry.b3 ?? "",
  B4: entry.b4 ?? "",
  C1: entry.c1 ?? "",
  C2: entry.c2 ?? "",
  C3: entry.c3 ?? "",
  C4: entry.c4 ?? "",
  D1: entry.d1 ?? "",
  D2: entry.d2 ?? "",
  D3: entry.d3 ?? "",
  D4: entry.d4 ?? "",
  E: entry.e ?? "",
  F: entry.f ?? "",
  G: entry.g ?? "",
  H1: entry.h1 ?? "",
  H2: entry.h2 ?? "",
  I1: entry.l1 ?? "",
  I2: entry.l2 ?? "",
});

function CoastWasteCrateRecord({ types, selectedType, onTypeChange, onRegisterActions, entryId = "" }) {
  const todayDate = getTodayDate();
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer) || {};
  const { isLoading = false } = autoconerState;
  const [date, setDate] = useState(todayDate);
  const [machineNo, setMachineNo] = useState(machineOptions[0]);
  const [count, setCount] = useState(countOptions[0]);
  const [countCode, setCountCode] = useState("");
  const [machineDropdownOptions, setMachineDropdownOptions] = useState(
    machineOptions.map((option) => ({ value: option, label: option }))
  );
  const [countDropdownOptions, setCountDropdownOptions] = useState(
    countOptions.map((option) => ({ value: option, label: option, code: "" }))
  );
  const [craneTip, setCraneTip] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [frameNo, setFrameNo] = useState("");
  const [metrics, setMetrics] = useState(createInitialMetrics());
  const [errors, setErrors] = useState({});
  const errorStyle = (flag) =>
    flag
      ? {
          borderColor: "#ef4444",
          backgroundColor: "#fff1f2",
          boxShadow: "0 0 0 1000px #fff1f2 inset",
        }
      : undefined;

  const handleMetricChange = (key, value) => {
    setMetrics((prev) => ({
      ...prev,
      [key]: sanitizeNumericInput(value, { precision: 10, scale: 2 }),
    }));
    setErrors((current) => {
      if (!current[`metric-${key}`]) return current;
      const next = { ...current };
      delete next[`metric-${key}`];
      return next;
    });
  };

  const resetForm = () => {
    setDate(todayDate);
    setMachineNo(machineDropdownOptions[0]?.value || machineOptions[0]);
    setCount(countDropdownOptions[0]?.label || countOptions[0]);
    setCountCode(countDropdownOptions[0]?.code || "");
    setCraneTip("");
    setLotNo("");
    setFrameNo("");
    setMetrics(createInitialMetrics());
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedType || "").trim()) nextErrors.type = true;
    if (!String(date || "").trim()) nextErrors.date = true;
    if (!String(machineNo || "").trim() || machineNo === machineOptions[0]) nextErrors.machineNo = true;
    if (!String(count || "").trim() || count === countOptions[0]) nextErrors.count = true;
    if (!String(craneTip || "").trim()) nextErrors.craneTip = true;
    if (!String(lotNo || "").trim()) nextErrors.lotNo = true;
    if (!String(frameNo || "").trim()) nextErrors.frameNo = true;
    metricKeys.forEach((key) => {
      if (!String(metrics[key] || "").trim()) nextErrors[`metric-${key}`] = true;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Type", value: selectedType || "-" },
    { label: "Entry ID", value: entryId || "-" },
    { label: "Machine No.", value: machineNo || "-" },
    { label: "Count", value: count || "-" },
    { label: "Cone Tip", value: craneTip || "-" },
    { label: "Lot No.", value: lotNo || "-" },
    { label: "Frame No.", value: frameNo || "-" },
    ...metricKeys.map((key) => ({ label: key, value: metrics[key] || "-" })),
  ];

  const submit = async () => {
    if (!validate()) return false;
    try {
      const payload = {
        entry_id: entryId,
        inspection_type: "Count Wise Cuts Record",
        entry_date: date,
        machine_no: machineNo,
        count_name: count,
        cone_tip: craneTip,
        lot_no: lotNo,
        frame_no: frameNo,
        yf: metrics.YF || null,
        yj: metrics.YJ || null,
        n: metrics.N || null,
        s: metrics.S || null,
        l: metrics.L || null,
        t: metrics.T || null,
        cp: metrics.CP || null,
        cm: metrics.CM || null,
        ccp: metrics.CCP || null,
        ccm: metrics.CCM || null,
        pc: metrics.PC || null,
        fd: metrics.FD || null,
        jp: metrics.JP || null,
        jm: metrics.JM || null,
        cvd: metrics.CVT || null,
        a1: metrics.A1 || null,
        a2: metrics.A2 || null,
        a3: metrics.A3 || null,
        a4: metrics.A4 || null,
        b1: metrics.B1 || null,
        b2: metrics.B2 || null,
        b3: metrics.B3 || null,
        b4: metrics.B4 || null,
        c1: metrics.C1 || null,
        c2: metrics.C2 || null,
        c3: metrics.C3 || null,
        c4: metrics.C4 || null,
        d1: metrics.D1 || null,
        d2: metrics.D2 || null,
        d3: metrics.D3 || null,
        d4: metrics.D4 || null,
        e: metrics.E || null,
        f: metrics.F || null,
        g: metrics.G || null,
        h1: metrics.H1 || null,
        h2: metrics.H2 || null,
        l1: metrics.I1 || null,
        l2: metrics.I2 || null,
      };

      await dispatch(saveAutoconerCountWiseCuts(payload)).unwrap();
      dispatch(getAutoconerCountWiseCuts());
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    dispatch(getAutoconerCountWiseCuts());
  }, [dispatch]);

  useEffect(() => {
    let isCancelled = false;
    const loadMasterData = async () => {
      const response = await fetchAutoconerCountWiseCutsMasterData();
      if (isCancelled) return;

      const countsFromObjects = Array.isArray(response?.count_options)
        ? response.count_options
            .map((item) => {
              const code = String(item?.cntcode ?? "").trim();
              const label = String(item?.cntname ?? "").trim();
              return label ? { value: code || label, label, code: code || "" } : null;
            })
            .filter(Boolean)
        : [];
      const countsFromLegacy = Array.isArray(response?.count_names)
        ? response.count_names.map((item) => String(item || "").trim()).filter(Boolean).map((label) => ({ value: label, label, code: "" }))
        : [];
      const machinesFromObjects = Array.isArray(response?.autoconer_options)
        ? response.autoconer_options
            .map((item) => {
              const value = String(item?.value ?? "").trim();
              const label = String(item?.label ?? value).trim();
              return value || label ? { value: value || label, label: label || value } : null;
            })
            .filter(Boolean)
        : [];
      const machinesFromLegacy = Array.isArray(response?.autoconer_nos)
        ? response.autoconer_nos.map((item) => String(item || "").trim()).filter(Boolean).map((label) => ({ value: label, label }))
        : [];
      const dedupe = (items) => Array.from(new Map(items.map((item) => [item.value, item])).values());
      const nextCounts = dedupe([...countsFromObjects, ...countsFromLegacy]);
      const nextMachines = dedupe([...machinesFromObjects, ...machinesFromLegacy]);
      if (nextCounts.length) {
        setCountDropdownOptions(nextCounts);
        setCount((current) => (nextCounts.some((item) => item.label === current) ? current : nextCounts[0].label));
      }
      if (nextMachines.length) {
        setMachineDropdownOptions(nextMachines);
        setMachineNo((current) => (nextMachines.some((item) => item.value === current) ? current : nextMachines[0].value));
      }
    };
    loadMasterData();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!onRegisterActions) return;

    onRegisterActions({
      validate,
      getPreviewData,
      submit,
      onClear: resetForm,
      saveLabel: "Save Record",
      disabled: isLoading,
    });
  }, [
    onRegisterActions,
    selectedType,
    date,
    machineNo,
    count,
    craneTip,
    lotNo,
    frameNo,
    metrics,
    dispatch,
    isLoading,
  ]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label>Type</label>
          <select value={selectedType} onChange={(e) => onTypeChange(e.target.value)} style={errorStyle(errors.type)}>
            {types.map((type) => {
              const optionValue =
                typeof type === "string"
                  ? type
                  : String(type?.name ?? type?.displayName ?? type?.value ?? type?.id ?? "").trim();
              const optionLabel =
                typeof type === "string"
                  ? type
                  : String(type?.displayName ?? type?.name ?? type?.label ?? type?.value ?? type?.id ?? "").trim();

              return (
                <option key={optionValue || optionLabel} value={optionValue}>
                  {optionLabel || optionValue}
                </option>
              );
            })}
          </select>
        </div>

        <div className={styles.field}>
          <label>Entry ID</label>
          <input type="text" value={entryId} readOnly disabled />
        </div>

        <div className={styles.field}>
          <label>Machine No.</label>
          <SearchableSelect
            value={machineNo}
            onChange={(value) => setMachineNo(value)}
            options={machineDropdownOptions.map((option) => option.value)}
            className={styles.select}
          />
        </div>

        <div className={styles.field}>
          <label>Count</label>
          <SearchableSelect
            value={count}
            onChange={(value) => {
              const selected = countDropdownOptions.find((option) => option.label === value || option.value === value);
              setCount(selected?.label ?? value);
              setCountCode(selected?.code ?? "");
            }}
            options={countDropdownOptions.map((option) => option.label)}
            className={styles.select}
          />
        </div>

        <div className={styles.field}>
          <label>Cone Tip</label>
          <input value={craneTip} onChange={(e) => setCraneTip(e.target.value)} style={errorStyle(errors.craneTip)} />
        </div>

        <div className={styles.field}>
          <label>Lot No.</label>
          <input value={lotNo} onChange={(e) => setLotNo(e.target.value)} style={errorStyle(errors.lotNo)} />
        </div>

        <div className={styles.field}>
          <label>Frame No.</label>
          <input value={frameNo} onChange={(e) => setFrameNo(e.target.value)} style={errorStyle(errors.frameNo)} />
        </div>
      </div>

      <div className={styles.metricGrid}>
        {metricKeys.map((key) => (
          <div className={styles.metricField} key={key}>
            <label>{key}</label>
            <input
              value={metrics[key]}
              onChange={(e) => handleMetricChange(key, e.target.value)}
              style={errorStyle(errors[`metric-${key}`])}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default CoastWasteCrateRecord;
