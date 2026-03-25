function CustomSelect({ options, value, onChange }) {
    return (
        <select
            className="mixx-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value="">Select Type</option>
            {options.map((option) => (
                <option key={option.id}>{option.name}</option>
            ))}
        </select>
    )
}

export default CustomSelect;
