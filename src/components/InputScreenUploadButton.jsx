import { FiUpload } from "react-icons/fi";

export default function InputScreenUploadButton({ className = "" }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#3f5db6] bg-[#3f5db6] px-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#3550a4] ${className}`.trim()}
    >
      <FiUpload aria-hidden="true" />
      Upload
    </button>
  );
}
