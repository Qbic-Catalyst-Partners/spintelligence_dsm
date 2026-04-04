function CustomSelect({ options = [], value = "", onChange = () => {}, error = false }) {
    return (
        <select
            className={`mixx-input ${error ? "border border-red-500" : ""}`.trim()}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={error ? { borderColor: "#ef4444", backgroundColor: "#fff1f2" } : undefined}
        >
            <option value="">Select Type</option>
            {options.map((option) => (
                <option key={option.id ?? option.name} value={option.name}>
                    {option.name}
                </option>
            ))}
        </select>
    )
}

export default CustomSelect;
