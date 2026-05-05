import { FiUpload } from "react-icons/fi";

export default function InputScreenUploadButton({ className = "" }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 ${className}`.trim()}
    >
      <FiUpload aria-hidden="true" />
      Upload
    </button>
  );
}
