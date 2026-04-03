function CustomInput({
    label,
    type = 'text',
    placeholder = '',
    value,
    onChange,
    name,
    error = false
}) {
    const baseClasses = "w-full h-9.5 px-3 py-2 rounded-lg text-[14px] focus:outline-none transition-colors";
    const normal = "border border-slate-200 bg-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-transparent";
    const errored = "border border-red-500 bg-red-50 focus:ring-2 focus:ring-red-400 focus:border-red-500";

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
                onChange={(e) => onChange(e.target.value)}
                className={`${baseClasses} ${error ? errored : normal}`}
            />
        </div>
    );
}

export default CustomInput;
