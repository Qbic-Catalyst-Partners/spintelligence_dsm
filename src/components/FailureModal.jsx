import React from "react";
import styles from "@/styles/failureModal.module.css";

function FailureModal({ open, message = "Error Occured", onClose }) {
  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.iconWrap}>
          <div className={styles.icon}>x</div>
        </div>
        <div className={styles.message}>{message}</div>

        <button type="button" className={styles.button} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default FailureModal;

