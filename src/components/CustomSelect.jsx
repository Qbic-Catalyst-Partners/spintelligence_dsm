function CustomSelect({ options = [], value = "", onChange = () => {}, error = false }) {
    return (
        <select
            className="mixx-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={
                error
                    ? {
                        borderColor: "#ef4444",
                        background: "#fff1f2",
                    }
                    : undefined
            }
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
