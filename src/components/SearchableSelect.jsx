import { useEffect, useMemo, useRef, useState } from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";

function SearchableSelect({
  className = "",
  value = "",
  onChange,
  options = [],
  placeholder = "",
  disabled = false,
  name,
  ariaLabel,
}) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const normalizedOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(options) ? options : [])
            .map((option) => String(option || "").trim())
            .filter(Boolean)
        )
      ),
    [options]
  );

  const filteredOptions = useMemo(() => {
    const keyword = String(searchTerm || "").trim().toLowerCase();
    if (!keyword) return normalizedOptions;
    return normalizedOptions.filter((option) => option.toLowerCase().includes(keyword));
  }, [normalizedOptions, searchTerm]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handleSelect = (option) => {
    onChange?.(option);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative w-full ${isOpen ? "z-50" : ""}`}>
      <input
        ref={inputRef}
        type="text"
        className={`${className} !text-[12px] pr-10`}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange?.(nextValue);
          setSearchTerm(nextValue);
          setIsOpen(true);
        }}
        onFocus={() => {
          setSearchTerm(value);
          setIsOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        name={name}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center text-slate-400"
        onClick={() => {
          if (disabled) return;
          setIsOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) {
              setSearchTerm("");
            }
            return nextOpen;
          });
          inputRef.current?.focus();
        }}
        tabIndex={-1}
        aria-label={isOpen ? "Close dropdown" : "Open dropdown"}
      >
        {isOpen ? <HiChevronUp className="text-[18px]" /> : <HiChevronDown className="text-[18px]" />}
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[#dbe4f0] bg-white shadow-lg">
          {filteredOptions.length ? (
            <ul className="py-1" role="listbox" aria-label={ariaLabel}>
              {filteredOptions.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    className={`flex w-full items-center px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-100 ${
                      option === value ? "bg-slate-50 font-semibold" : ""
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                  >
                    <span className="truncate">{option}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 text-[12px] text-slate-500">No matching options</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default SearchableSelect;
