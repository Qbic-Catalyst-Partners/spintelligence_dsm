import React from "react";
import { AiOutlineSave } from "react-icons/ai";
import styles from "../styles/footer.module.css";

const Footer = ({
  onClear,
  onSecondary,
  onSave,
  variant = "default",
  secondaryLabel = "Clear Form",
  saveLabel = "Save Record",
  disabled = false,
  className = "",
}) => {
  const secondaryHandler = onSecondary || onClear;

  return (
    <div
      className={`${styles["footer-container"]} ${
        variant === "compact" ? styles["footer-container-compact"] : ""
      } ${className}`}
    >
      <div className={styles["right-actions"]}>
        {secondaryHandler && (
          <button
            type="button"
            className={`${styles["button-base"]} ${
              variant === "compact" ? styles["button-base-compact"] : ""
            } ${styles["secondary-btn"]}`}
            onClick={secondaryHandler}
          >
            {secondaryLabel}
          </button>
        )}

        <button
          type="button"
          className={`${styles["button-base"]} ${
            variant === "compact" ? styles["button-base-compact"] : ""
          } ${styles["primary-btn"]}`}
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
