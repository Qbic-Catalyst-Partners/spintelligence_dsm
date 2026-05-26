import { FiUpload } from "react-icons/fi";
import { useRouter } from "next/router";

export default function InputScreenUploadButton({
  className = "",
  disabled = false,
  navigateToOcr = true,
  returnTo = "",
  docType = "hvi",
}) {
  const router = useRouter();
  const handleClick = () => {
    if (disabled) return;
    if (!navigateToOcr) return;
    const q = new URLSearchParams();
    if (returnTo) q.set("returnTo", returnTo);
    if (docType) q.set("docType", docType);
    router.push(`/ocr-machine?${q.toString()}`);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`upload-btn inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#3D539F] bg-[#3D539F] px-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#2F4180] dark:border-[#3D539F] dark:bg-[#3D539F] dark:text-white dark:hover:bg-[#2F4180] disabled:cursor-not-allowed disabled:opacity-60 ${className}`.trim()}
    >
      <FiUpload aria-hidden="true" className="text-[16px]" />
      Upload
    </button>
  );
}
