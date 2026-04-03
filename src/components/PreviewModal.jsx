import React from "react";
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
  onCancel,
  onConfirm,
  confirmLabel = "Submit",
  typeLabel = "Type",
  typeValue,
}) {
  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.headerRow}>
          <div className={styles.header}>
            {subtitle ? <div className={styles.breadcrumb}>{subtitle}</div> : null}
            <h2 className={styles.title}>{title}</h2>
          </div>
          {typeValue ? (
            <div className={styles.typePill}>
              <div className={styles.typeLabel}>{typeLabel}</div>
              <div className={styles.typeValue}>{typeValue}</div>
            </div>
          ) : null}
        </div>

        <div className={styles.grid}>
          {items.map(({ label, value }, idx) => (
            <div key={`${label}-${idx}`} className={styles.card}>
              <div className={styles.label}>{label}</div>
              <div className={styles.value}>{formatValue(value)}</div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PreviewModal;
