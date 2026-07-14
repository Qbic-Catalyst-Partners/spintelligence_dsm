import styles from "@/styles/successModal.module.css";

function SuccessModal({
  open,
  message = "Data Submitted",
  onClose,
  scope = "page",
  closeLabel = "Close",
}) {
  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      data-success-modal="true"
      data-global-success-modal={scope === "global" ? "true" : undefined}
    >
      <div className={styles.modal}>
        <div className={styles.icon} aria-hidden="true">
          {"\u2713"}
        </div>
        <div className={styles.message}>{message}</div>

        <button type="button" className={styles.button} onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

export default SuccessModal;
