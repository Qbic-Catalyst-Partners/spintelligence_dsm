import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import styles from "@/styles/pagination.module.css";

// Single shared pagination control - "Previous / Page X of Y / Next" - used
// everywhere a list is paginated (Activity Logs, Approvals queues, ticketing
// dashboards, etc.) so every screen in the app behaves and looks the same
// instead of each one having its own bespoke prev/next/page-number markup.
function Pagination({ page, totalPages, onPageChange, disabled = false }) {
  if (totalPages <= 1) return null;

  return (
    <div className={styles.pagination}>
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
    </div>
  );
}

export default Pagination;
