import { FaCheckCircle } from "react-icons/fa";
import { MdPrint } from "react-icons/md";
import styles from "@/styles/combinedProcessParameterPreview.module.css";

const formatValue = (value) => {
  if (value === null || value === undefined) return "0";
  const normalized = String(value).trim();
  return normalized && normalized !== "-" ? normalized : "0";
};

function CombinedProcessParameterPreview({ open, ppId, columns, doneMap, dataByColumn, onClose, onPrint }) {
  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.headerRow}>
          <h2 className={styles.title}>Process Parameter</h2>
          <div className={styles.headerActions}>
            <button type="button" className={styles.printButton} onClick={onPrint} aria-label="Print preview">
              <MdPrint />
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close preview">
              ×
            </button>
          </div>
        </div>

        <div className={styles.idBadge}>
          <div className={styles.idLabel}>Process Parameter ID</div>
          <div className={styles.idValue}>{ppId}</div>
        </div>

        <div className={styles.sections}>
          {columns.map((column, index) => {
            const done = Boolean(doneMap?.[index]);
            const section = dataByColumn?.[column.key];
            const items = section?.items || [];

            return (
              <div key={column.key} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>{column.label}</span>
                  {done ? (
                    <FaCheckCircle className={styles.doneIcon} />
                  ) : (
                    <span className={styles.pendingIcon} />
                  )}
                </div>

                {section?.ready ? (
                  <div className={styles.fieldGrid}>
                    {items.map((item, itemIndex) => (
                      <div key={`${column.key}-${item.label}-${itemIndex}`} className={styles.fieldTile}>
                        <div className={styles.fieldLabel}>{item.label}</div>
                        <div className={styles.fieldValue}>{formatValue(item.value)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.loadingRow}>Loading…</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CombinedProcessParameterPreview;
