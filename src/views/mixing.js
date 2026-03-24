import React, { useState, useEffect } from "react";
import CottonHVIDataEntry from "./mixing/cottonHVIDataEntry";
import FibreDataEntry from "./mixing/fibreDataEntry";

const mixingDepartmentTypes = [{
    id: 1,
    name: "Cotton HVI Data Entry",
    component: <CottonHVIDataEntry />,
}, {
    id: 2,
    name: "Fibre Data Entry",
    component: <FibreDataEntry />,
},
{
    id: 3,
    name: "Inspection Data Entry",
    component: <FibreDataEntry />,
},


]

function Mixing() {
    const [checkingType, setCheckingType] = useState(null);

    const handleTypeChange = (value) => {
        console.log(value);
        const selectedType = mixingDepartmentTypes.find((item) => item.name === value);
        setCheckingType(selectedType.id);
    };
    return (
        <div>
            <div className="mixx-header">
                <h1>
                    Quality Control - Mixing Notebook
                </h1>
                <p>
                    Record and manage industrial machine quality inspections.
                </p>

                <select
                    className="mixx-input"
                    value={checkingType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                >
                    <option value="">Select Type</option>
                    {mixingDepartmentTypes.map((item) => (
                        <option key={item.id}>{item.name}</option>
                    ))}
                </select>
            </div>
            {mixingDepartmentTypes.find((item) => item.id === checkingType)?.component}
        </div>
    );
}

export default Mixing;