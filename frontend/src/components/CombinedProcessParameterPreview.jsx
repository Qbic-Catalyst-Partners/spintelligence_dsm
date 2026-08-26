import { FaCheckCircle } from "react-icons/fa";
import { MdPrint } from "react-icons/md";
import styles from "@/styles/combinedProcessParameterPreview.module.css";

const formatValue = (value) => {
  if (value === null || value === undefined) return "0";
  const normalized = String(value).trim();
  return normalized && normalized !== "-" ? normalized : "0";
};

function CombinedProcessParameterPreview({
  open,
  ppId,
  columns,
  doneMap,
  decisionMap,
  canPrint = true,
  dataByColumn,
  onClose,
  onPrint,
}) {
  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.headerRow}>
          <h2 className={styles.title}>Process Parameter</h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.printButton}
              onClick={canPrint ? onPrint : undefined}
              disabled={!canPrint}
              aria-label="Print preview"
              title={canPrint ? "Print" : "This PP id must be Fully Approved before it can be printed"}
            >
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
            const decision = decisionMap?.[index]?.decision || null;
            const section = dataByColumn?.[column.key];
            const items = section?.items || [];
            const statusLabel = decision === "rejected" ? "Rejected" : decision === "accepted" ? "Approved" : done ? "Submitted" : "Pending";

            return (
              <div key={column.key} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>{column.label}</span>
                  <span className={styles.sectionStatusLabel}>{statusLabel}</span>
                  {decision === "rejected" ? (
                    <span className={styles.rejectedIcon} title="Rejected - reopened for correction">
                      ✕
                    </span>
                  ) : done ? (
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
