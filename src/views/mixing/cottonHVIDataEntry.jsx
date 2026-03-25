import { useState } from 'react';
import CustomInput from '@/components/CustomInput';
import styles from './cottonHVIDataEntry.module.css';

function CottonHVIDataEntry() {
    const [formData, setFormData] = useState({
        variety: '',
        invoiceNo: '',
        invoiceDate: '',
        sci: '',
        spanLength: '',
        mic: '',
        gtex: '',
        maturity: '',
        ur: '',
        sfi: '',
        elongation: '',
        yellowB: '',
        trash: '',
        rd: '',
        colourGrade: ''
    });

    const handleChange = (field, value) => {
        setFormData((prevData) => ({
            ...prevData,
            [field]: value
        }));
    };

    const createPayload = () => {
        return {
            variety: formData.variety,
            invoiceNo: formData.invoiceNo,
            invoiceDate: formData.invoiceDate,
            sci: formData.sci ? parseFloat(formData.sci) : null,
            spanLength: formData.spanLength ? parseFloat(formData.spanLength) : null,
            mic: formData.mic ? parseFloat(formData.mic) : null,
            gtex: formData.gtex ? parseFloat(formData.gtex) : null,
            maturity: formData.maturity ? parseFloat(formData.maturity) : null,
            ur: formData.ur ? parseFloat(formData.ur) : null,
            sfi: formData.sfi ? parseFloat(formData.sfi) : null,
            elongation: formData.elongation ? parseFloat(formData.elongation) : null,
            yellowB: formData.yellowB ? parseFloat(formData.yellowB) : null,
            trash: formData.trash ? parseFloat(formData.trash) : null,
            rd: formData.rd ? parseFloat(formData.rd) : null,
            colourGrade: formData.colourGrade
        };
    };

    return (
        <>
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label className="text-xs font-semibold text-slate-700">Variety</label>
                    <select
                        className="h-9.5 px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        value={formData.variety}
                        onChange={(e) =>
                            handleChange("variety", e.target.value)
                        }
                    >
                        <option value="">Select Variety</option>
                        <option>Bunny</option>
                        <option>MCU5</option>
                        <option>DCH32</option>
                    </select>
                </div>

                <CustomInput
                    label="Invoice No"
                    placeholder=""
                    value={formData.invoiceNo}
                    onChange={(value) => handleChange("invoiceNo", value)}
                />

                <CustomInput
                    label="Invoice Date"
                    type="date"
                    value={formData.invoiceDate}
                    onChange={(value) => handleChange("invoiceDate", value)}
                />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput
                    label="SCI"
                    placeholder="Enter SCI"
                    value={formData.sci}
                    onChange={(value) => handleChange("sci", value)}
                />

                <CustomInput
                    label="Span Length (2.5%)"
                    placeholder="Enter Span Length"
                    value={formData.spanLength}
                    onChange={(value) => handleChange("spanLength", value)}
                />

                <CustomInput
                    label="Mic"
                    placeholder="Enter Mic"
                    value={formData.mic}
                    onChange={(value) => handleChange("mic", value)}
                />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput
                    label="GTEX"
                    placeholder="Enter GTEX"
                    value={formData.gtex}
                    onChange={(value) => handleChange("gtex", value)}
                />

                <CustomInput
                    label="Maturity"
                    placeholder="Enter Maturity"
                    value={formData.maturity}
                    onChange={(value) => handleChange("maturity", value)}
                />

                <CustomInput
                    label="UR"
                    placeholder="Enter UR"
                    value={formData.ur}
                    onChange={(value) => handleChange("ur", value)}
                />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput
                    label="SFI"
                    placeholder="Enter SFI"
                    value={formData.sfi}
                    onChange={(value) => handleChange("sfi", value)}
                />

                <CustomInput
                    label="Elongation"
                    placeholder="Enter Elongation"
                    value={formData.elongation}
                    onChange={(value) => handleChange("elongation", value)}
                />

                <CustomInput
                    label="Yellow + B"
                    placeholder="Enter..."
                    value={formData.yellowB}
                    onChange={(value) => handleChange("yellowB", value)}
                />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput
                    label="Trash"
                    placeholder="Enter Trash"
                    value={formData.trash}
                    onChange={(value) => handleChange("trash", value)}
                />

                <CustomInput
                    label="RD"
                    placeholder="Enter RD"
                    value={formData.rd}
                    onChange={(value) => handleChange("rd", value)}
                />

                <CustomInput
                    label="Colour Grade"
                    placeholder="Enter Colour Grade"
                    value={formData.colourGrade}
                    onChange={(value) => handleChange("colourGrade", value)}
                />
            </div>

        </>
    );
}

export default CottonHVIDataEntry;
