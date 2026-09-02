import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  dropUp = false,
  includeEmptyOption = false,
  emptyOptionLabel = "Select",
  onFocus,
}) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // The option list used to be a plain `position: absolute` sibling of the input, clipped to
  // whatever ancestor happens to set `overflow: hidden` (e.g. the rounded card wrapping the
  // Simplex screens) and stacked only within that ancestor's own paint order - on Sider Name
  // (the field sitting right above the break-matrix table on SMX Breaks Study Report) that made
  // the list either render clipped/invisible behind the table or, when opened upward instead,
  // get hidden the same way by a different ancestor. Portaling it to `document.body` with
  // `position: fixed` computed from the input's own on-screen rect sidesteps every ancestor's
  // overflow/stacking context - the list can never be clipped or buried again, on any screen that
  // uses this component.
  const [menuRect, setMenuRect] = useState(null);

  const normalizedOptions = useMemo(
    () => {
      const seen = new Set();
      const baseOptions = (Array.isArray(options) ? options : [])
        .map((option) => {
          if (option && typeof option === "object") {
            const value = String(option.value ?? option.label ?? option.text ?? "").trim();
            const label = String(option.text ?? option.label ?? option.value ?? "").trim();
            return value || label ? { value: value || label, label: label || value } : null;
          }

          const value = String(option || "").trim();
          return value ? { value, label: value } : null;
        })
        .filter((option) => {
          if (!option || seen.has(option.value)) return false;
          seen.add(option.value);
          return true;
        });

      if (!includeEmptyOption) return baseOptions;

      return [{ value: "", label: emptyOptionLabel }, ...baseOptions];
    },
    [emptyOptionLabel, includeEmptyOption, options]
  );

  const selectedOption = useMemo(
    () => normalizedOptions.find((option) => option.value === value) || null,
    [normalizedOptions, value]
  );
  const displayValue = isOpen ? searchTerm : selectedOption?.label || value;
  // The synthetic empty/"All" option (includeEmptyOption) has value "" and
  // matches selectedOption whenever nothing real is selected - pre-filling
  // the search box with its label ("All") on open filtered every real option
  // out (none of them contain the word "all"), leaving the list empty. Only
  // an actual, non-empty selection should pre-fill the search box.
  const openSearchTerm = selectedOption && selectedOption.value !== "" ? selectedOption.label : "";

  const filteredOptions = useMemo(() => {
    const keyword = String(searchTerm || "").trim().toLowerCase();
    if (!keyword) return normalizedOptions;
    return normalizedOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword)
    );
  }, [normalizedOptions, searchTerm]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuRect(null);
      return undefined;
    }

    const updateMenuRect = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setMenuRect(rect);
    };

    updateMenuRect();
    // `position: fixed` is viewport-relative, so any scroll (the page itself, or a scrollable
    // ancestor like a table's own overflow-x-auto wrapper) or resize has to re-anchor the menu -
    // capture:true catches scroll on inner scroll containers too, not just window.
    window.addEventListener("scroll", updateMenuRect, true);
    window.addEventListener("resize", updateMenuRect);
    return () => {
      window.removeEventListener("scroll", updateMenuRect, true);
      window.removeEventListener("resize", updateMenuRect);
    };
  }, [isOpen]);

  const handleSelect = (option) => {
    const safeOption =
      option && typeof option === "object"
        ? {
            value: String(option.value ?? "").trim(),
            label: String(option.label ?? option.text ?? option.value ?? "").trim(),
          }
        : { value: "", label: "" };

    if (!safeOption.value && includeEmptyOption) {
      onChange?.("");
      setSearchTerm(emptyOptionLabel);
      setIsOpen(false);
      inputRef.current?.focus();
      return;
    }

    if (!safeOption.value) return;
    onChange?.(safeOption.value);
    setSearchTerm(safeOption.label || safeOption.value);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative w-full ${isOpen ? "z-50" : ""}`}>
      <input
        ref={inputRef}
        type="text"
        className={className}
        style={{
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          paddingRight: "2.5rem",
        }}
        value={displayValue}
        onChange={(event) => {
          // Typing here only filters the option list - it must not call the
          // parent's onChange (which forms treat as "the user picked a
          // value" and use to trigger fetches/side effects). Only an actual
          // click on an option (handleSelect below) should do that.
          const nextValue = event.target.value;
          setSearchTerm(nextValue);
          setIsOpen(true);
        }}
        onFocus={() => {
          setSearchTerm(openSearchTerm);
          setIsOpen(true);
          onFocus?.();
        }}
        onClick={() => {
          if (disabled) return;
          setSearchTerm(openSearchTerm);
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
        className="combo-arrow absolute right-3 top-1/2 flex -translate-y-1/2 appearance-none items-center justify-center border-0 bg-transparent p-0 text-slate-400 shadow-none"
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

      {isOpen && menuRect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[9999] max-h-60 overflow-y-auto rounded-lg border border-[#dbe4f0] bg-white shadow-lg"
              style={{
                left: menuRect.left,
                width: menuRect.width,
                ...(dropUp
                  ? { bottom: window.innerHeight - menuRect.top + 4 }
                  : { top: menuRect.bottom + 4 }),
              }}
            >
              {filteredOptions.length ? (
                <ul className="py-1" role="listbox" aria-label={ariaLabel}>
                  {filteredOptions.map((option, index) => {
                    const safeOption = option && typeof option === "object"
                      ? {
                          value: String(option.value ?? "").trim(),
                          label: String(option.label ?? option.text ?? option.value ?? "").trim(),
                        }
                      : { value: "", label: "" };

                    if (!safeOption.value) return null;

                    return (
                    <li key={`${safeOption.value}-${index}`}>
                      <button
                        type="button"
                        className={`flex w-full items-center px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-100 ${
                          safeOption.value === value ? "bg-slate-50 font-semibold" : ""
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelect(safeOption)}
                      >
                        <span className="truncate">{safeOption.label}</span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-3 py-2 text-[12px] text-slate-500">No matching options</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default SearchableSelect;
