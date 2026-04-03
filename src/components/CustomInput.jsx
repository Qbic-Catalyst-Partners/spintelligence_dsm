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
    className = '',
    onWheel
}) {
    const baseClasses = "w-full h-9.5 px-3 py-2 rounded-lg text-[14px] focus:outline-none transition-colors";
    const normal = "border border-slate-200 bg-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-transparent";
    const errored = "border border-red-500 focus:ring-2 focus:ring-red-400 focus:border-red-500";
    const errorStyle = error ? { borderColor: "#ef4444", backgroundColor: "#fff1f2" } : undefined;

    return (
        <div className="flex flex-col gap-1.5 min-w-0 w-full">
            {label && (
                <label className="text-[14px] font-semibold text-slate-700 truncate">
                    {label}
                </label>
            )}
            <input
                type={type}
                name={name}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                disabled={disabled}
                readOnly={readOnly}
                step={step}
                onWheel={onWheel}
                style={errorStyle}
                className={`${baseClasses} ${error ? errored : normal} ${className}`.trim()}
            />
        </div>
    );
}

export default CustomInput;
