import { useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import styles from "@/styles/pagination.module.css";

// Single shared pagination control - "Previous / Page X of Y / Next" - used
// everywhere a list is paginated (Activity Logs, Approvals queues, ticketing
// dashboards, etc.) so every screen in the app behaves and looks the same
// instead of each one having its own bespoke prev/next/page-number markup.
// pageSize/pageSizeOptions/onPageSizeChange and showPageJump are all opt-in -
// omitting them keeps every existing consumer's rendering exactly as before.
function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  showPageJump = false,
}) {
  const [jumpValue, setJumpValue] = useState("");
  const showPageSizeSelector = Array.isArray(pageSizeOptions) && pageSizeOptions.length > 0 && typeof onPageSizeChange === "function";

  if (totalPages <= 1 && !showPageSizeSelector) return null;

  const handleJumpSubmit = (event) => {
    event.preventDefault();
    const parsed = Number.parseInt(jumpValue, 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= totalPages) {
      onPageChange(parsed);
    }
    setJumpValue("");
  };

  return (
    <div className={styles.pagination}>
      {showPageSizeSelector ? (
        <label className={styles.pageSizeField}>
          <span>Rows per page</span>
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {totalPages > 1 ? (
        <>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
          >
            <FiChevronLeft aria-hidden="true" />
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= totalPages}
          >
            Next
            <FiChevronRight aria-hidden="true" />
          </button>
          {showPageJump ? (
            <form className={styles.pageJumpField} onSubmit={handleJumpSubmit}>
              <span>Go to</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpValue}
                disabled={disabled}
                placeholder={String(page)}
                onChange={(event) => setJumpValue(event.target.value)}
              />
              <button type="submit" disabled={disabled || !jumpValue}>
                Go
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default Pagination;
