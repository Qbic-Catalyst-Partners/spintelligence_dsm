import { sanitizeNumericInput } from "@/utils/inputValidation";

function CustomInput({
    label,
    type = 'text',
    placeholder = '',
    value,
    onChange,
    name,
    error = false,
    disabled = false,
    readOnly = false,
    step,
    min,
    max,
    numericConfig,
    className = '',
    onWheel
}) {
    const isNumericField = type === "number" || Boolean(numericConfig);
    const baseClasses = "w-full h-9.5 px-3 py-2 rounded-lg text-[14px] focus:outline-none transition-colors";
    const normal = "border border-slate-200 bg-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-transparent";
    const errored = "border border-red-500 focus:ring-2 focus:ring-red-400 focus:border-red-500";
    const normalStyle = { borderColor: "#e2e8f0", backgroundColor: "#f1f5f9" };
    const errorStyle = error
        ? { borderColor: "#ef4444", backgroundColor: "#fff1f2", boxShadow: "none" }
        : normalStyle;
    const inputType = isNumericField ? "text" : type;
    const dateInputClass = inputType === "date" ? "hide-date-picker-icon" : "";

    return (
        <div className="flex flex-col gap-1.5 min-w-0 w-full">
            {label && (
                <label className="text-[14px] font-semibold text-slate-700 truncate">
                    {label}
                </label>
            )}
            <input
                type={inputType}
                name={name}
                placeholder={placeholder}
                value={value}
                inputMode={isNumericField ? (numericConfig?.integerOnly ? "numeric" : "decimal") : undefined}
                onChange={(e) => {
                    if (!isNumericField) {
                        onChange?.(e.target.value);
                        return;
                    }
                    onChange?.(sanitizeNumericInput(e.target.value, numericConfig));
                }}
                disabled={disabled}
                readOnly={readOnly}
                step={step}
                min={min}
                max={max}
                onWheel={onWheel}
                style={errorStyle}
                className={`${baseClasses} ${error ? errored : normal} ${dateInputClass} ${className}`.trim()}
            />
        </div>
    );
}

export default CustomInput;
