import React from "react";
import styles from "@/styles/successModal.module.css";

function SuccessModal({ open, message = "Data Submitted", onClose, typeLabel = "Type", typeValue }) {
  if (!open) return null;

  return (
    <div className={styles.overlay}>
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
