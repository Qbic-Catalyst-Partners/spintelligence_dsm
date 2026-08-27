import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AiOutlinePrinter } from "react-icons/ai";
import styles from "@/styles/previewModal.module.css";

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

function PreviewModal({
  open,
  title = "Preview",
  subtitle,
  items = [],
  tableColumns = [],
  tableRows = [],
  groups = [],
  compactGroups = false,
  onCancel,
  onConfirm,
  onPrint,
  confirmLabel = "Submit",
  confirmingLabel = "Submitting...",
  confirming = false,
  typeLabel = "Type",
  typeValue,
  modalClassName,
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [openGroup, setOpenGroup] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (open) setOpenGroup(0);
  }, [open]);

  if (!open || !isMounted) return null;

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    window.print();
  };

  return createPortal(
    <div className={styles.overlay}>
      <div className={`${styles.modal}${modalClassName ? ` ${modalClassName}` : ""}`}>
        <div className={styles.headerRow}>
          <div className={styles.header}>
            {subtitle ? <div className={styles.breadcrumb}>{subtitle}</div> : null}
            <h2 className={styles.title}>{title}</h2>
          </div>
          <div className={styles.headerRight}>
            {/* <button
              type="button"
              className={styles.printButton}
              onClick={handlePrint}
              aria-label="Print"
              title="Print"
            >
              <AiOutlinePrinter size={16} />
              Print
            </button> */}
            {typeValue ? (
              <div className={styles.typePill}>
                <div className={styles.typeLabel}>{typeLabel}</div>
                <div className={styles.typeValue}>{formatValue(typeValue)}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className={`${styles.grid}${compactGroups ? ` ${styles.gridCompact}` : ""}`}>
          {items.map(({ label, value, wide }, idx) => (
            <div
              key={`${label}-${idx}`}
              className={`${styles.card}${compactGroups ? ` ${styles.cardCompact}` : ""} ${wide ? styles.cardWide : ""}`}
            >
              <div className={styles.label}>{label}</div>
              <div className={styles.value}>{formatValue(value)}</div>
            </div>
          ))}
        </div>

        {groups.length > 0 ? (
          <div className={styles.accordionList}>
            {groups.map((group, groupIndex) => {
              const isOpen = openGroup === groupIndex;
              return (
                <div key={group.key || group.title || groupIndex} className={styles.accordionSection}>
                  <button
                    type="button"
                    className={styles.accordionToggle}
                    onClick={() => setOpenGroup((current) => (current === groupIndex ? -1 : groupIndex))}
                    aria-expanded={isOpen}
                  >
                    <span>{group.title}</span>
                    <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>˅</span>
                  </button>

                  {isOpen ? (
                    <div className={`${styles.tableWrap}${compactGroups ? ` ${styles.tableWrapCompact}` : ""}`}>
                      <table className={`${styles.table}${compactGroups ? ` ${styles.tableCompact}` : ""}`}>
                        <colgroup>
                          {group.columns.map((column) => (
                            <col key={column.key || column.label} style={{ width: column.width || "auto" }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            {group.columns.map((column) => (
                              <th key={column.key || column.label}>{column.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {group.columns.map((column) => (
                                <td key={column.key || column.label}>
                                  {formatValue(row?.[column.key] ?? row?.[column.label])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {tableColumns.length > 0 && tableRows.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                {tableColumns.map((column) => (
                  <col key={column.key || column.label} style={{ width: column.width || "auto" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {tableColumns.map((column) => (
                    <th key={column.key || column.label}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {tableColumns.map((column) => (
                      <td key={column.key || column.label}>
                        {formatValue(row?.[column.key] ?? row?.[column.label])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirm}
            onClick={onConfirm}
            disabled={confirming}
            aria-busy={confirming}
          >
            {confirming ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                {confirmingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PreviewModal;
