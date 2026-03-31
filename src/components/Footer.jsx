import React from "react";
import { AiOutlineSave } from "react-icons/ai";
import styles from "../styles/footer.module.css";

const Footer = ({
  onBack,
  onClear,
  onSecondary,
  onSave,
  isMobile,
  secondaryLabel = "Clear Form",
  saveLabel = "Save Record",
  disabled = false,
}) => {
  const secondaryHandler = onSecondary || onClear;

  return (
    <div className={styles["footer-container"]}>
      {!isMobile && onBack && (
        <div className={styles["left-actions"]}>
          <button
            type="button"
            className={`${styles["button-base"]} ${styles["back-btn"]}`}
            onClick={onBack}
          >
            Back to Dashboard
          </button>
        </div>
      )}

      <div className={styles["right-actions"]}>
        {secondaryHandler && (
          <button
            type="button"
            className={`${styles["button-base"]} ${styles["secondary-btn"]}`}
            onClick={secondaryHandler}
          >
            {secondaryLabel}
          </button>
        )}

        <button
          type="button"
          className={`${styles["button-base"]} ${styles["primary-btn"]}`}
          onClick={onSave}
          disabled={disabled}
        >
          <AiOutlineSave size={16} />
          {saveLabel}
        </button>
      </div>
    </div>
  );
};

export default Footer;
