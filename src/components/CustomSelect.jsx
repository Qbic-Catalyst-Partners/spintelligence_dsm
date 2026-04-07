function CustomSelect({ options = [], value = "", onChange = () => {}, error = false }) {
    const errorStyle = error
        ? {
            border: "1px solid #ef4444",
            background: "#fff1f2",
            WebkitBoxShadow: "0 0 0 1000px #fff1f2 inset",
            boxShadow: "0 0 0 1000px #fff1f2 inset",
        }
        : undefined;

    return (
        <select
            className="mixx-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={errorStyle}
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
