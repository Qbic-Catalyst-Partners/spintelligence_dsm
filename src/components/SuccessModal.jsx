import styles from "@/styles/successModal.module.css";

function SuccessModal({ open, message = "Data Submitted", onClose, scope = "page" }) {
  if (!open) return null;
  if (scope !== "global") return null;

  return (
    <div className={styles.overlay} data-success-modal="true" data-global-success-modal="true">
      <div className={styles.modal}>
        <div className={styles.icon}>✓</div>
        <div className={styles.message}>{message}</div>
        
        <button type="button" className={styles.button} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default SuccessModal;
