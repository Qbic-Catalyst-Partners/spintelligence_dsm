function CottonHVIDataEntry() {

    return (
        <>
            <div className="mixx-row">
                <div className="mixx-group">
                    <label>Variety</label>
                    <select
                        className="mixx-input"
                    // value={formData.variety}
                    // onChange={(e) =>
                    //     handleChange("variety", e.target.value)
                    // }
                    >
                        <option value="">Select Variety</option>
                        <option>Bunny</option>
                        <option>MCU5</option>
                        <option>DCH32</option>
                    </select>
                </div>

                <div className="mixx-group">
                    <label>Invoice No</label>
                    <input
                        className="mixx-input"
                    // value={formData.invoiceNo}
                    // onChange={(e) =>
                    //     handleChange("invoiceNo", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>Invoice Date</label>
                    <input
                        type="date"
                        className="mixx-input"
                    // value={formData.invoiceDate}
                    // onChange={(e) =>
                    //     handleChange("invoiceDate", e.target.value)
                    // }
                    />
                </div>
            </div>

            <div className="mixx-row">
                <div className="mixx-group">
                    <label>SCI</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter SCI"
                    // value={formData.sci}
                    // onChange={(e) =>
                    //     handleChange("sci", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>Span Length (2.5%)</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter Span Length"
                    // value={formData.spanLength}
                    // onChange={(e) =>
                    //     handleChange("spanLength", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>Mic</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter Mic"
                    // value={formData.mic}
                    // onChange={(e) =>
                    //     handleChange("mic", e.target.value)
                    // }
                    />
                </div>
            </div>

            <div className="mixx-row">
                <div className="mixx-group">
                    <label>GTEX</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter GTEX"
                    // value={formData.gtex}
                    // onChange={(e) =>
                    //     handleChange("gtex", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>Maturity</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter Maturity"
                    // value={formData.maturity}
                    // onChange={(e) =>
                    //     handleChange("maturity", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>UR</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter UR"
                    // value={formData.ur}
                    // onChange={(e) =>
                    //     handleChange("ur", e.target.value)
                    // }
                    />
                </div>
            </div>

            <div className="mixx-row">
                <div className="mixx-group">
                    <label>SFI</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter SFI"
                    // value={formData.sfi}
                    // onChange={(e) =>
                    //     handleChange("sfi", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>Elongation</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter Elongation"
                    // value={formData.elongation}
                    // onChange={(e) =>
                    //     handleChange("elongation", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>Yellow + B</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter..."
                    // value={formData.yellowB}
                    // onChange={(e) =>
                    //     handleChange("yellowB", e.target.value)
                    // }
                    />
                </div>
            </div>

            <div className="mixx-row">
                <div className="mixx-group">
                    <label>Trash</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter Trash"
                    // value={formData.trash}
                    // onChange={(e) =>
                    //     handleChange("trash", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>RD</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter RD"
                    // value={formData.rd}
                    // onChange={(e) =>
                    //     handleChange("rd", e.target.value)
                    // }
                    />
                </div>

                <div className="mixx-group">
                    <label>Colour Grade</label>
                    <input
                        className="mixx-input"
                        placeholder="Enter Colour Grade"
                    // value={formData.colourGrade}
                    // onChange={(e) =>
                    //     handleChange("colourGrade", e.target.value)
                    // }
                    />
                </div>
            </div>

        </>
    );
}

export default CottonHVIDataEntry;