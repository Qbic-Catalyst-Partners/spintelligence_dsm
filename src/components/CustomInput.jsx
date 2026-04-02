function CustomInput({
    label,
    type = 'text',
    placeholder = '',
    value,
    onChange,
    name
}) {
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
                className={`w-full h-9.5 px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors`} />
        </div>
    );
}

export default CustomInput;
