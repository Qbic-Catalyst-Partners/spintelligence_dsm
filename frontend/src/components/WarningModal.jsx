import styles from "@/styles/warningModal.module.css";

function WarningModal({ open, message, onClose, closeLabel = "OK" }) {
  if (!open) return null;

  return (
    <div className={styles.overlay} data-warning-modal="true">
      <div className={styles.modal} role="alertdialog" aria-modal="true">
        <div className={styles.icon} aria-hidden="true">
          !
        </div>
        <div className={styles.message}>{message}</div>

        <button type="button" className={styles.button} onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

export default WarningModal;
