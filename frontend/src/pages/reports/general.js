import { useMemo, useRef, useState, useEffect } from "react";
import { FiFileText, FiChevronDown, FiCalendar } from "react-icons/fi";

import styles from "@/styles/reports.module.css";
import {
  fetchRowsForDashboardWidget,
  filterRowsByDateRange,
  getDashboardFieldValue,
} from "@/utils/dashboardWidgets";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";

const ALL_TYPES_VALUE = "__all_types__";
const today = new Date();
const padDatePart = (value) => String(value).padStart(2, "0");
const toInputDate = (date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
const toDisplayDate = (value) => {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
};

const titleCase = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());

const normalizeLookup = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const inferFields = (rows) =>
  Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .flatMap((row) => Object.keys(row || {}))
        .filter((key) => !["id", "_id", "__v", "created_at", "updated_at"].includes(key))
    )
  ).map((key) => ({ key, label: titleCase(key) }));

const toField = (fieldName) => {
  const label = String(fieldName || "").trim();
  return label ? { key: label, label } : null;
};

const REPORT_FIELD_ALIASES = {
  "Span Length (2.5%)": ["span_length", "spanLength"],
  "Invisible Loss %": ["invisible_loss_percentage", "invisible_loss_percent", "invisibleLossPercent"],
  "Trash Content %": ["trash_content_percentage", "trash_content_percent", "trashContentPercent"],
  "Yellow + B": ["yellow_b", "yellowB"],
  "TrCnt": ["trcnt", "tr_cnt", "trCnt"],
  "TrAr": ["trar", "tr_ar", "trAr"],
  "TrID": ["trid", "tr_id", "trID"],
  "Colour Grade": ["colour_grade", "color_grade", "colourGrade", "colorGrade"],
  "U%": ["u_percent", "uPercent"],
  "CV%": ["cv_percent", "cvPercent"],
};

const getCanonicalFieldKey = (field) => {
  const fieldKey = String(field?.key || field?.label || "").trim();
  const matchedAlias = Object.entries(REPORT_FIELD_ALIASES).find(([label, aliases]) =>
    [label, ...aliases].some((candidate) => normalizeLookup(candidate) === normalizeLookup(fieldKey))
  );
  return matchedAlias ? normalizeLookup(matchedAlias[0]) : normalizeLookup(fieldKey);
};

const uniqueReportFields = (fields) =>
  (Array.isArray(fields) ? fields : []).filter((field, index, list) => {
    const key = getCanonicalFieldKey(field);
    return key && index === list.findIndex((item) => getCanonicalFieldKey(item) === key);
  });

const findEntryIdLikeValue = (row) => {
  if (!row || typeof row !== "object") return null;
  const denylist = new Set(["id", "_id"]);
  const candidateKey = Object.keys(row).find((key) => {
    if (denylist.has(key)) return false;
    const normalized = normalizeLookup(key);
    return normalized.includes("entryid") || normalized.includes("entrycode") || normalized.includes("entryno");
  });
  if (!candidateKey) return null;
  const value = row[candidateKey];
  return value !== null && typeof value !== "undefined" && value !== "" ? value : null;
};

const BLEND_FIELD_PATTERN = /^blend-\d+$/i;
// By the time a row reaches here it has already been through normalizeDashboardRows, which
// flattens each mixing_qc_blends row into its own report row with plain "blend_no"/
// "percentage" keys — there is never a surviving nested "blends" array to look into, and never
// more than one blend per row. "Blend-1" (the % typed into the form) and "Blend No." (the
// blend's sequence number) are simply two different flat columns already on that row.
const BLEND_NO_FIELD_LABEL = "blend no.";

const getBlendFieldValue = (row, field) => {
  const label = String(field?.label || field?.key || "").trim();

  if (normalizeLookup(label) === normalizeLookup(BLEND_NO_FIELD_LABEL)) {
    return row?.blend_no ?? null;
  }

  if (!BLEND_FIELD_PATTERN.test(label)) return undefined;
  return row?.percentage ?? null;
};

const SAMPLE_FIELD_PATTERN = /^sample\s*(\d+)$/i;

const getSampleFieldValue = (row, field) => {
  const match = SAMPLE_FIELD_PATTERN.exec(String(field?.label || field?.key || "").trim());
  if (!match) return undefined;
  const sampleNo = Number(match[1]);
  const sampleIndex = sampleNo - 1;

  const samplesRaw = row?.samples;
  const samples = Array.isArray(samplesRaw)
    ? samplesRaw
    : typeof samplesRaw === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(samplesRaw);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : null;
  if (samples) {
    const objectSample = samples.find(
      (item) => item && typeof item === "object" && Number(item.sample_no) === sampleNo
    );
    if (objectSample) {
      const objectValue = objectSample.value ?? objectSample.sample_value;
      if (objectValue !== null && typeof objectValue !== "undefined" && objectValue !== "") return objectValue;
    } else {
      const value = samples[sampleIndex];
      if (value !== null && typeof value !== "undefined" && value !== "") return value;
    }
  }

  const directKeys = [
    `sample_${sampleNo}`,
    `sample${sampleNo}`,
    `sampleNo${sampleNo}`,
    `Sample ${sampleNo}`,
  ];
  for (const key of directKeys) {
    if (row?.[key] !== null && typeof row?.[key] !== "undefined" && row?.[key] !== "") return row[key];
  }

  return null;
};

const WASTE_ROW_FIELD_KEYS = {
  "wastekgsvalue": "waste_kgs_value",
  "wastekgspercent": "waste_kgs_percent",
  "wastetype": "waste_type",
};

const getWasteRowFieldValue = (row, field) => {
  const canonical = normalizeLookup(field?.label || field?.key || "");
  const entryKey = WASTE_ROW_FIELD_KEYS[canonical];
  if (!entryKey) return undefined;

  if (row?.[entryKey] !== null && typeof row?.[entryKey] !== "undefined" && row?.[entryKey] !== "") {
    return row[entryKey];
  }

  const wasteRows = Array.isArray(row?.waste_rows) ? row.waste_rows : [];
  const firstRow = wasteRows.find(
    (item) => item && typeof item === "object" && item[entryKey] !== null && typeof item[entryKey] !== "undefined" && item[entryKey] !== ""
  );
  return firstRow ? firstRow[entryKey] : undefined;
};

const TYPE_ROW_FIELD_KEYS = {
  "cylinderspeed": "cylinder_speed",
  "lickerinspeed": "lickerin_speed",
  "flatspeed": "flat_speed",
  "dofferspeed": "doffer_speed",
  "deliveryspeed": "delivery_speed",
  "wingsetting": "wing_setting_1",
  "wingsettling1": "wing_setting_1",
  "wingsettling2": "wing_setting_2",
  "1stlickerinspeed": "lickerin_speed_1",
  "2ndlickerinspeed": "lickerin_speed_2",
  "3rdlickerinspeed": "lickerin_speed_3",
  "mcno": "mc_no",
  "mcproduction": "mc_production",
};

const getTypeRowFieldValue = (row, field) => {
  const canonical = normalizeLookup(field?.label || field?.key || "");
  const entryKey = TYPE_ROW_FIELD_KEYS[canonical];
  if (!entryKey) return undefined;

  if (row?.[entryKey] !== null && typeof row?.[entryKey] !== "undefined" && row?.[entryKey] !== "") {
    return row[entryKey];
  }

  const typeRows = Array.isArray(row?.type_rows) ? row.type_rows : [];
  const firstRow = typeRows.find(
    (item) => item && typeof item === "object" && item[entryKey] !== null && typeof item[entryKey] !== "undefined" && item[entryKey] !== ""
  );
  return firstRow ? firstRow[entryKey] : undefined;
};

const SYNC_ENTRY_FIELD_KEYS = {
  "runtime(seconds)": "value_a",
  "idletime(seconds)": "value_b",
  "subtotaltime": "value_c",
  "syncpercentage": "sync_percentage",
};

const getSyncEntryFieldValue = (row, field) => {
  const canonical = normalizeLookup(field?.label || field?.key || "");

  if (canonical === "numberofrowsn" || canonical === "numberofnepsentries") {
    if (row?.number_of_entries !== null && typeof row?.number_of_entries !== "undefined" && row?.number_of_entries !== "") {
      return row.number_of_entries;
    }
    const entries = Array.isArray(row?.entries) ? row.entries : null;
    return entries ? entries.length : undefined;
  }

  const entryKey = SYNC_ENTRY_FIELD_KEYS[canonical];
  if (!entryKey) return undefined;

  if (row?.[entryKey] !== null && typeof row?.[entryKey] !== "undefined" && row?.[entryKey] !== "") {
    return row[entryKey];
  }

  const entries = Array.isArray(row?.entries) ? row.entries : [];
  const firstEntry = entries.find(
    (entry) => entry && typeof entry === "object" && entry[entryKey] !== null && typeof entry[entryKey] !== "undefined" && entry[entryKey] !== ""
  );
  return firstEntry ? firstEntry[entryKey] : undefined;
};

const getReportFieldValue = (row, field) => {
  const keys = [
    field?.key,
    field?.label,
    ...(REPORT_FIELD_ALIASES[field?.label] || []),
    ...(REPORT_FIELD_ALIASES[field?.key] || []),
  ].filter(Boolean);

  for (const key of keys) {
    const value = getDashboardFieldValue(row, key);
    if (value !== null && typeof value !== "undefined" && value !== "") return value;
  }

  return null;
};

const getCellValue = (row, field) => {
  const value = getReportFieldValue(row, field);
  if (value === null || typeof value === "undefined" || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const getFieldsForType = (typeName, typeRows) => {
  const catalogFields = getThresholdFieldsForScreen(typeName).map(toField).filter(Boolean);
  return uniqueReportFields(catalogFields.length ? catalogFields : inferFields(typeRows));
};

const sanitizeFilenamePart = (value) =>
  String(value || "report")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "report";

const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const downloadFile = (filename, content, type) => {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const loadExcelJS = async () => {
  const excelJSImport = await import("exceljs");
  return excelJSImport?.default || excelJSImport;
};

const getWorksheetName = (name, index, usedNames) => {
  const fallbackName = `Report ${index + 1}`;
  const baseName =
    String(name || fallbackName)
      .replace(/[:\\/?*[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || fallbackName;
  let sheetName = baseName;
  let suffix = 2;

  while (usedNames.has(sheetName)) {
    const suffixText = ` ${suffix}`;
    sheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  usedNames.add(sheetName);
  return sheetName;
};

export default function GeneralReport() {
  const [fromDate, setFromDate] = useState(toInputDate(today));
  const [toDate, setToDate] = useState(toInputDate(today));
  const fromDateInputRef = useRef(null);
  const toDateInputRef = useRef(null);

  const [selectedDept, setSelectedDept] = useState("");
  const [selectedSubDept, setSelectedSubDept] = useState("");
  const [selectedNotebook, setSelectedNotebook] = useState("");
  const [isReportGenerated, setIsReportGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [rows, setRows] = useState([]);
  const [rowsByType, setRowsByType] = useState({});
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState("");
  const departments = useMemo(() => departmentDirectory, []);
  const selectedDepartment = useMemo(
    () => departments.find((department) => department.name === selectedDept),
    [departments, selectedDept]
  );
  const subDepartments = selectedDepartment?.subDepartments || [];
  const selectedSubDepartment = useMemo(
    () => subDepartments.find((subDepartment) => subDepartment.name === selectedSubDept),
    [subDepartments, selectedSubDept]
  );
  const notebooks = useMemo(
    () => getThresholdScreensForSubDepartment(selectedDepartment?.slug, selectedSubDepartment?.slug),
    [selectedDepartment?.slug, selectedSubDepartment?.slug]
  );
  const typeOptions = useMemo(
    () => (notebooks.length ? [{ value: ALL_TYPES_VALUE, label: "All Type" }, ...notebooks.map((type) => ({ value: type, label: type }))] : []),
    [notebooks]
  );
  const isAllTypeSelected = selectedNotebook === ALL_TYPES_VALUE;
  const isInvoiceDataType = String(selectedNotebook || "").trim().toLowerCase().includes("invoice");
  const filteredRows = useMemo(
    () => (isInvoiceDataType ? rows : filterRowsByDateRange(rows, fromDate, toDate)),
    [fromDate, isInvoiceDataType, rows, toDate]
  );
  const filteredRowsByType = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rowsByType).map(([typeName, typeRows]) => [
          typeName,
          isInvoiceDataType ? typeRows : filterRowsByDateRange(typeRows, fromDate, toDate),
        ])
      ),
    [fromDate, isInvoiceDataType, rowsByType, toDate]
  );
  const reportFields = useMemo(() => {
    if (isAllTypeSelected) return [];
    return getFieldsForType(selectedNotebook, filteredRows);
  }, [filteredRows, isAllTypeSelected, selectedNotebook]);
  const reportSections = useMemo(() => {
    if (!isAllTypeSelected) {
      return [{ typeName: selectedNotebook, rows: filteredRows, fields: reportFields }];
    }

    return notebooks.map((typeName) => {
      const typeRows = filteredRowsByType[typeName] || [];
      return {
        typeName,
        rows: typeRows,
        fields: getFieldsForType(typeName, typeRows),
      };
    });
  }, [filteredRows, filteredRowsByType, isAllTypeSelected, notebooks, reportFields, selectedNotebook]);
  const totalColumns = useMemo(
    () => reportSections.reduce((total, section) => total + section.fields.length, 0),
    [reportSections]
  );
  const totalRows = useMemo(
    () => reportSections.reduce((total, section) => total + section.rows.length, 0),
    [reportSections]
  );
  const reportDateLabel = `${toDisplayDate(fromDate)}${toDate && toDate !== fromDate ? ` - ${toDisplayDate(toDate)}` : ""}`;
  const reportTimeLabel = generatedAt
    ? new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(generatedAt))
    : "-";
  const currentDateLabel = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentTimeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());

  useEffect(() => {
    if (!selectedDept && departments.length) {
      setSelectedDept(departments[0].name);
    }
  }, [departments, selectedDept]);

  useEffect(() => {
    const nextSubDepartment = subDepartments[0]?.name || "";
    if (!selectedSubDept || !subDepartments.some((subDepartment) => subDepartment.name === selectedSubDept)) {
      setSelectedSubDept(nextSubDepartment);
    }
  }, [selectedSubDept, subDepartments]);

  useEffect(() => {
    const validTypes = [ALL_TYPES_VALUE, ...notebooks];
    const nextNotebook = notebooks.length ? ALL_TYPES_VALUE : "";
    if (!selectedNotebook || !validTypes.includes(selectedNotebook)) {
      setSelectedNotebook(nextNotebook);
      setIsReportGenerated(false);
    }
  }, [notebooks, selectedNotebook]);

  useEffect(() => {
    let isActive = true;

    const loadRows = async () => {
      if (!isReportGenerated || !selectedDept || !selectedSubDept || !selectedNotebook) {
        setRows([]);
        setRowsByType({});
        return;
      }

      try {
        setLoadingRows(true);
        setRowsError("");
        if (selectedNotebook === ALL_TYPES_VALUE) {
          const results = await Promise.all(
            notebooks.map(async (typeName) => {
              const typeRows = await fetchRowsForDashboardWidget({
                department: selectedDept,
                sub_department: selectedSubDept,
                input_screen: typeName,
              });
              return [typeName, typeRows];
            })
          );
          if (isActive) {
            const nextRowsByType = Object.fromEntries(results);
            setRowsByType(nextRowsByType);
            setRows(results.flatMap(([, typeRows]) => typeRows));
          }
          return;
        }

        const nextRows = await fetchRowsForDashboardWidget({
          department: selectedDept,
          sub_department: selectedSubDept,
          input_screen: selectedNotebook,
        });
        if (isActive) {
          setRows(nextRows);
          setRowsByType({ [selectedNotebook]: nextRows });
        }
      } catch (error) {
        if (!isActive) return;
        setRows([]);
        setRowsByType({});
        setRowsError(error?.message || "Unable to load report data.");
      } finally {
        if (isActive) setLoadingRows(false);
      }
    };

    loadRows();

    return () => {
      isActive = false;
    };
  }, [isReportGenerated, notebooks, selectedDept, selectedNotebook, selectedSubDept]);

  useEffect(() => {
    setIsReportGenerated(false);
  }, [fromDate, toDate, selectedDept, selectedSubDept, selectedNotebook]);

  const openCalendarPicker = (inputRef) => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const handleGenerateReport = () => {
    if (!selectedDept || !selectedSubDept || !selectedNotebook) return;
    setIsReportGenerated(true);
    setGeneratedAt(new Date().toISOString());
  };

  const getReportFilename = (extension) =>
    [
      "general-report",
      sanitizeFilenamePart(selectedSubDept),
      sanitizeFilenamePart(isAllTypeSelected ? "all-type" : selectedNotebook),
      fromDate,
      toDate,
    ]
      .filter(Boolean)
      .join("-") + `.${extension}`;

  const handleExportCsv = () => {
    const lines = reportSections.flatMap((section) => {
      const header = section.fields.map((field) => escapeCsvValue(field.label)).join(",");
      const body = section.rows.map((row) =>
        section.fields.map((field) => escapeCsvValue(getCellValue(row, field))).join(",")
      );
      return [
        escapeCsvValue(section.typeName),
        header,
        ...(body.length ? body : [`${escapeCsvValue("No data stored for the selected date.")}`]),
        "",
      ];
    });
    downloadFile(getReportFilename("csv"), lines.join("\r\n"), "text/csv;charset=utf-8");
  };

  const handleExportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Spintelligence";
      const usedSheetNames = new Set();
      const reportDateLabel = `${toDisplayDate(fromDate)}${toDate && toDate !== fromDate ? ` - ${toDisplayDate(toDate)}` : ""}`;

      reportSections.forEach((section, index) => {
        const fields = section.fields.length ? section.fields : [{ key: "__report_data", label: "Report Data" }];
        const sheet = workbook.addWorksheet(getWorksheetName(section.typeName, index, usedSheetNames));
        sheet.addRow([
          "Department :",
          selectedDept || "-",
          "",
          "Selected Date :",
          reportDateLabel || "-",
        ]);
        sheet.addRow([
          "Sub-department :",
          selectedSubDept || "-",
          "",
          "Current Date :",
          currentDateLabel || "-",
        ]);
        sheet.addRow([
          "Notebook Type :",
          isAllTypeSelected ? "All Type" : selectedNotebook || "-",
          "",
          "Current Time :",
          currentTimeLabel || "-",
        ]);
        sheet.addRow([]);
        sheet.addRow(fields.map((field) => field.label));

        if (section.rows.length && section.fields.length) {
          section.rows.forEach((row) => {
            sheet.addRow(fields.map((field) => getCellValue(row, field)));
          });
        } else {
          sheet.addRow(["No data stored for the selected date."]);
        }

        [1, 2, 3, 5].forEach((rowNumber) => {
          sheet.getRow(rowNumber).font = { bold: true };
        });
        sheet.getRow(4).height = 4;
        sheet.columns = [
          { width: 18 },
          { width: 28 },
          { width: 6 },
          { width: 18 },
          { width: 28 },
          ...fields.map((field) => ({
            width: Math.min(Math.max(String(field.label).length + 4, 16), 36),
          })),
        ];
      });

      const buffer = await workbook.xlsx.writeBuffer();
      downloadFile(getReportFilename("xlsx"), buffer, XLSX_MIME);
    } catch (error) {
      console.error(error);
    }
  };

  const handleExportPdf = () => {
    if (typeof window === "undefined") return;

    const sectionsHtml = reportSections
      .map((section) => {
        const headerCells = section.fields.map((field) => `<th>${escapeHtml(field.label)}</th>`).join("");
        const bodyRows = section.rows.length
          ? section.rows
              .map((row) => `<tr>${section.fields.map((field) => `<td>${escapeHtml(getCellValue(row, field))}</td>`).join("")}</tr>`)
              .join("")
          : `<tr><td colspan="${Math.max(section.fields.length, 1)}">No data stored for the selected date.</td></tr>`;
        return `<h2>${escapeHtml(section.typeName)}</h2><table><thead><tr>${headerCells || "<th>Report Data</th>"}</tr></thead><tbody>${bodyRows}</tbody></table>`;
      })
      .join("");
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>General Report</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #101828; font-family: Arial, sans-serif; font-size: 10px; }
            h1 { margin: 0 0 8px; font-size: 18px; }
            h2 { margin: 16px 0 8px; font-size: 13px; break-after: avoid; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-bottom: 14px; color: #344054; font-size: 11px; }
            .meta-col { display: grid; gap: 4px; align-content: start; }
            .meta strong { color: #101828; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #d0d5dd; padding: 5px; text-align: left; vertical-align: top; word-break: break-word; }
            th { background: #f2f4f7; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>General Report</h1>
          <section class="meta">
            <div class="meta-col">
              <div><strong>Dept:</strong> ${escapeHtml(selectedDept || "-")}</div>
              <div><strong>Sub-Dept:</strong> ${escapeHtml(selectedSubDept || "-")}</div>
              <div><strong>Type:</strong> ${escapeHtml(isAllTypeSelected ? "All Type" : selectedNotebook || "-")}</div>
            </div>
            <div class="meta-col">
              <div><strong>Selected Date:</strong> ${escapeHtml(toDisplayDate(fromDate))} - ${escapeHtml(toDisplayDate(toDate))}</div>
              <div><strong>Current Date:</strong> ${escapeHtml(currentDateLabel)}</div>
              <div><strong>Current Time:</strong> ${escapeHtml(currentTimeLabel)}</div>
            </div>
          </section>
          ${sectionsHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <main className={styles.page}>
      <section className={`${styles.filterCard} ${styles.generalReportCard}`}>
        <div className={styles.generalReportHeader}>
          <span className={styles.headingIcon}>
            <FiFileText />
          </span>
          <div>
            <h1>General Report</h1>
            <p>Generate and schedule input task reports</p>
          </div>
        </div>

        <div className={styles.filterTitle} style={{ marginTop: 18 }}>
          Filter
        </div>

        <div className={styles.filterGrid}>
          <div className={styles.fieldGroup}>
            <label>Department</label>
            <select value={selectedDept} onChange={(e) => { setSelectedDept(e.target.value); setSelectedSubDept(""); setSelectedNotebook(""); }}>
              <option value="">Select Department</option>
              {departments.map((d) => (
                <option key={d.slug} value={d.name}>{d.name}</option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <div className={styles.fieldGroup}>
            <label>Sub Departments</label>
            <select value={selectedSubDept} onChange={(e) => { setSelectedSubDept(e.target.value); setSelectedNotebook(""); }}>
              <option value="">Select Sub Department</option>
              {subDepartments.map((s) => (
                <option key={s.slug} value={s.name}>{s.name}</option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <div className={styles.fieldGroup}>
            <label>Type</label>
            <select value={selectedNotebook} onChange={(e) => { setSelectedNotebook(e.target.value); }}>
              <option value="">Select Type</option>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <>
            <div className={`${styles.fieldGroup} ${styles.dateGroup}`}>
              <label>Date - From</label>
              <button type="button" className={styles.dateInputs} onClick={() => openCalendarPicker(fromDateInputRef)}>
                <span className={styles.dateDisplay}>{toDisplayDate(fromDate)}</span>
                <input
                  ref={fromDateInputRef}
                  className={styles.hiddenDateInput}
                  type="date"
                  value={fromDate}
                  tabIndex={-1}
                  onChange={(event) => setFromDate(event.target.value)}
                />
                <FiCalendar />
              </button>
            </div>

            <div className={`${styles.fieldGroup} ${styles.dateGroup}`}>
              <label>Date - To</label>
              <button type="button" className={styles.dateInputs} onClick={() => openCalendarPicker(toDateInputRef)}>
                <span className={styles.dateDisplay}>{toDisplayDate(toDate)}</span>
                <input
                  ref={toDateInputRef}
                  className={styles.hiddenDateInput}
                  type="date"
                  value={toDate}
                  tabIndex={-1}
                  onChange={(event) => setToDate(event.target.value)}
                />
                <FiCalendar />
              </button>
            </div>
          </>

          <div className={styles.generateActionGroup}>
            <button type="button" className={styles.generateReportButton} onClick={handleGenerateReport}>
              Generate Report
            </button>
          </div>
        </div>

        {isReportGenerated ? (
          <>
            <div className={styles.reportMetaBar}>
              <div className={styles.reportMetaItem}>
                <span className={styles.reportMetaLabel}>Current Time</span>
                <strong>{reportTimeLabel}</strong>
              </div>
              <div className={styles.reportMetaItem}>
                <span className={styles.reportMetaLabel}>Date</span>
                <strong>{reportDateLabel || "-"}</strong>
              </div>
            </div>

            {reportSections.map((section) => (
              <section key={section.typeName} style={{ marginTop: 18 }}>
                <h2 className={styles.reportSectionTitle}>{section.typeName}</h2>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        {section.fields.length ? (
                          section.fields.map((field) => <th key={field.key}>{field.label}</th>)
                        ) : (
                          <th>Report Data</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingRows ? (
                        <tr>
                          <td colSpan={section.fields.length || 1}>Loading report details...</td>
                        </tr>
                      ) : null}
                      {!loadingRows && rowsError ? (
                        <tr>
                          <td colSpan={section.fields.length || 1}>{rowsError}</td>
                        </tr>
                      ) : null}
                      {!loadingRows && !rowsError && section.rows.length ? (
                        section.rows.map((row, rowIndex) => (
                          <tr key={row?.id || row?.entry_id || `${section.typeName}-${rowIndex}`}>
                            {section.fields.map((field) => (
                              <td key={field.key}>{getCellValue(row, field)}</td>
                            ))}
                          </tr>
                        ))
                      ) : null}
                      {!loadingRows && !rowsError && !section.rows.length ? (
                        <tr>
                          <td colSpan={section.fields.length || 1}>No data stored for the selected date.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        ) : null}

        <div className={styles.exportBar} style={{ marginTop: 18 }}>
          <p>Select filters and generate the report to view tables.</p>

          <div className={styles.exportActions}>
            <button type="button" onClick={handleExportCsv} disabled={!isReportGenerated}>Export CSV</button>
            <button type="button" onClick={handleExportExcel} disabled={!isReportGenerated}>Export Excel</button>
            <button type="button" className={styles.primaryExport} onClick={handleExportPdf} disabled={!isReportGenerated}>Export PDF</button>
          </div>
        </div>
      </section>
    </main>
  );
}
