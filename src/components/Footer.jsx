import React from "react";
import { AiOutlineSave } from "react-icons/ai";
import styles from "../styles/footer.module.css";

const Footer = ({ onBack, onClear, onSave, isMobile }) => {
  return (
    <div className={styles["footer-container"]}>
      
      {/* ✅ Hide Back button on mobile */}
      {!isMobile && (
        <div className={styles["left-actions"]}>
          <button
            className={`${styles["button-base"]} ${styles["back-btn"]}`}
            onClick={onBack}
          >
            ← Back to Dashboard
          </button>
        </div>
      )}

      <div className={styles["right-actions"]}>
        <button
          type="button"
          className={`${styles["button-base"]} ${styles["secondary-btn"]}`}
          onClick={onClear}
        >
          Clear Form
        </button>

        <button
          className={`${styles["button-base"]} ${styles["primary-btn"]}`}
          onClick={onSave}
        >
          <AiOutlineSave size={16} />
          Save Record
        </button>
      </div>
    </div>
  );
};

export default Footer;