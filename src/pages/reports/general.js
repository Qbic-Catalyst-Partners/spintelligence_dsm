import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/router";
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
  const router = useRouter();
  const [fromDate, setFromDate] = useState(toInputDate(today));
  const [toDate, setToDate] = useState(toInputDate(today));
  const fromDateInputRef = useRef(null);
  const toDateInputRef = useRef(null);

  const [selectedDept, setSelectedDept] = useState("");
  const [selectedSubDept, setSelectedSubDept] = useState("");
  const [selectedNotebook, setSelectedNotebook] = useState("");
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
    }
  }, [notebooks, selectedNotebook]);

  useEffect(() => {
    let isActive = true;

    const loadRows = async () => {
      if (!selectedDept || !selectedSubDept || !selectedNotebook) {
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
  }, [notebooks, selectedDept, selectedNotebook, selectedSubDept]);

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

      reportSections.forEach((section, index) => {
        const fields = section.fields.length ? section.fields : [{ key: "__report_data", label: "Report Data" }];
        const sheet = workbook.addWorksheet(getWorksheetName(section.typeName, index, usedSheetNames));
        sheet.addRow(fields.map((field) => field.label));

        if (section.rows.length && section.fields.length) {
          section.rows.forEach((row) => {
            sheet.addRow(fields.map((field) => getCellValue(row, field)));
          });
        } else {
          sheet.addRow(["No data stored for the selected date."]);
        }

        sheet.getRow(1).font = { bold: true };
        sheet.columns = fields.map((field) => ({
          header: field.label,
          key: field.key,
          width: Math.min(Math.max(String(field.label).length + 4, 16), 36),
        }));
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
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 18px; margin-bottom: 14px; color: #344054; font-size: 11px; }
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
            <div><strong>Department:</strong> ${escapeHtml(selectedDept || "-")}</div>
            <div><strong>Sub Department:</strong> ${escapeHtml(selectedSubDept || "-")}</div>
            <div><strong>Type:</strong> ${escapeHtml(isAllTypeSelected ? "All Type" : selectedNotebook || "-")}</div>
            <div><strong>Date:</strong> ${escapeHtml(toDisplayDate(fromDate))} - ${escapeHtml(toDisplayDate(toDate))}</div>
            <div><strong>Rows:</strong> ${totalRows}</div>
            <div><strong>Columns:</strong> ${totalColumns}</div>
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

          <div />
        </div>

        {reportSections.map((section) => (
          <section key={section.typeName} style={{ marginTop: 18 }}>
            {isAllTypeSelected ? <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{section.typeName}</h2> : null}
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

        <div className={styles.exportBar} style={{ marginTop: 18 }}>
          <p>
            Ready to export Report with <strong>{totalColumns}</strong> columns and{" "}
            <strong>{totalRows}</strong> rows
          </p>

          <div className={styles.exportActions}>
            <button type="button" onClick={() => router.push("/reports")}>Schedule Report</button>
            <button type="button" onClick={handleExportCsv}>Export CSV</button>
            <button type="button" onClick={handleExportExcel}>Export Excel</button>
            <button type="button" className={styles.primaryExport} onClick={handleExportPdf}>Export PDF</button>
          </div>
        </div>
      </section>
    </main>
  );
}
