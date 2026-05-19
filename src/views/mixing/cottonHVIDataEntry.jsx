import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { submitCottonHVI, clearMixingState } from '@/store/slices/mixing';
import { createThresholdViolationTickets } from '@/utils/thresholdTicketing';
import { sanitizeNumericInput } from '@/utils/inputValidation';
import styles from '../../styles/cottonHVIDataEntry.module.css';

const initialForm = {
    variety: '', invoiceNo: '', invoiceDate: '',
    sci: '', spanLength: '', mic: '',
    gtex: '', maturity: '', ur: '',
    sfi: '', elongation: '', yellowB: '',
    trash: '', rd: '', colourGrade: '',
};

const NUMERIC_FIELDS = new Set([
    'sci', 'spanLength', 'mic', 'gtex', 'maturity', 'ur', 'sfi', 'elongation', 'yellowB', 'trash', 'rd', 'colourGrade',
]);

const CottonHVIDataEntry = forwardRef(function CottonHVIDataEntry({ date, lotNo, selectedTypeName }, ref) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const [formData, setFormData] = useState(initialForm);
    const [errors, setErrors] = useState({});

    const handleChange = (field, value) => {
        const nextValue = NUMERIC_FIELDS.has(field)
            ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
            : value;
        setFormData(prev => ({ ...prev, [field]: nextValue }));
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    useEffect(() => {
        if (actionSuccess) {
            setFormData(initialForm);
        }
    }, [actionSuccess, dispatch]);

    const buildPayload = () => ({
        inspection_date: date,
        lot_no:          lotNo,
        variety:         formData.variety,
        invoice_no:      formData.invoiceNo,
        invoice_date:    formData.invoiceDate,
        sci:             Number(formData.sci)         || 0,
        span_length:     Number(formData.spanLength)  || 0,
        mic:             Number(formData.mic)         || 0,
        gtex:            Number(formData.gtex)        || 0,
        maturity:        Number(formData.maturity)    || 0,
        ur:              Number(formData.ur)          || 0,
        sfi:             Number(formData.sfi)         || 0,
        elongation:      Number(formData.elongation)  || 0,
        yellow_b:        Number(formData.yellowB)     || 0,
        trash:           Number(formData.trash)       || 0,
        rd:              Number(formData.rd)          || 0,
        colour_grade:    Number(formData.colourGrade) || 0,
    });

    const handleSubmit = async () => {
        await dispatch(submitCottonHVI(buildPayload())).unwrap();

        try {
            await createThresholdViolationTickets({
                department: "Quality Control",
                subDepartment: "Mixing",
                screenName: selectedTypeName || "Cotton HVI",
                machineName: selectedTypeName || "Cotton HVI",
                values: [
                    { label: "SCI", value: formData.sci },
                    { label: "Span Length (2.5%)", value: formData.spanLength },
                    { label: "Mic", value: formData.mic },
                    { label: "GTEX", value: formData.gtex },
                    { label: "Maturity", value: formData.maturity },
                    { label: "UR", value: formData.ur },
                    { label: "SFI", value: formData.sfi },
                    { label: "Elongation", value: formData.elongation },
                    { label: "Yellow + B", value: formData.yellowB },
                    { label: "Trash", value: formData.trash },
                    { label: "RD", value: formData.rd },
                    { label: "Colour Grade", value: formData.colourGrade },
                ],
            });
        } catch (ticketError) {
            console.error("Threshold ticket generation failed:", ticketError);
        }
    };

    const handleClear = () => {
        setFormData(initialForm);
        dispatch(clearMixingState());
        setErrors({});
    };

    const getPreviewData = () => ([
        { label: "Date", value: date },
        { label: "Lot No", value: lotNo },
        { label: "Variety", value: formData.variety },
        { label: "Invoice No", value: formData.invoiceNo },
        { label: "Invoice Date", value: formData.invoiceDate },
        { label: "SCI", value: formData.sci },
        { label: "Span Length (2.5%)", value: formData.spanLength },
        { label: "Mic", value: formData.mic },
        { label: "GTEX", value: formData.gtex },
        { label: "Maturity", value: formData.maturity },
        { label: "UR", value: formData.ur },
        { label: "SFI", value: formData.sfi },
        { label: "Elongation", value: formData.elongation },
        { label: "Yellow + B", value: formData.yellowB },
        { label: "Trash", value: formData.trash },
        { label: "RD", value: formData.rd },
        { label: "Colour Grade", value: formData.colourGrade },
    ]);

    const validate = () => {
        const required = [
            "variety","invoiceNo","invoiceDate","sci","spanLength","mic","gtex","maturity",
            "ur","sfi","elongation","yellowB","trash","rd","colourGrade"
        ];
        const nextErrors = required.reduce((acc, key) => {
            if (String(formData[key] || "").trim() === "") acc[key] = true;
            return acc;
        }, {});
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    useImperativeHandle(ref, () => ({
        submit: handleSubmit,
        clear: handleClear,
        getPreviewData,
        getPayload: buildPayload,
        validate,
    }));

    return (
        <>
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label className="text-xs font-semibold text-slate-700">Variety</label>
                    <select
                        className={`${styles['mixx-input']} ${errors.variety ? styles['mixx-error'] : ''}`}
                        value={formData.variety}
                        onChange={e => handleChange('variety', e.target.value)}
                    >
                        <option value="">Select Variety</option>
                        <option>Bunny</option>
                        <option>MCU5</option>
                        <option>DCH32</option>
                    </select>
                </div>

                <CustomInput label="Invoice No" placeholder=""
                    value={formData.invoiceNo} onChange={v => handleChange('invoiceNo', v)} error={errors.invoiceNo} />

                <CustomInput label="Invoice Date" type="date"
                    value={formData.invoiceDate} onChange={v => handleChange('invoiceDate', v)} error={errors.invoiceDate} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="SCI" placeholder="Enter SCI"
                    value={formData.sci} onChange={v => handleChange('sci', v)} error={errors.sci} />
                <CustomInput label="Span Length (2.5%)" placeholder="Enter Span Length"
                    value={formData.spanLength} onChange={v => handleChange('spanLength', v)} error={errors.spanLength} />
                <CustomInput label="Mic" placeholder="Enter Mic"
                    value={formData.mic} onChange={v => handleChange('mic', v)} error={errors.mic} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="GTEX" placeholder="Enter GTEX"
                    value={formData.gtex} onChange={v => handleChange('gtex', v)} error={errors.gtex} />
                <CustomInput label="Maturity" placeholder="Enter Maturity"
                    value={formData.maturity} onChange={v => handleChange('maturity', v)} error={errors.maturity} />
                <CustomInput label="UR" placeholder="Enter UR"
                    value={formData.ur} onChange={v => handleChange('ur', v)} error={errors.ur} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="SFI" placeholder="Enter SFI"
                    value={formData.sfi} onChange={v => handleChange('sfi', v)} error={errors.sfi} />
                <CustomInput label="Elongation" placeholder="Enter Elongation"
                    value={formData.elongation} onChange={v => handleChange('elongation', v)} error={errors.elongation} />
                <CustomInput label="Yellow + B" placeholder="Enter..."
                    value={formData.yellowB} onChange={v => handleChange('yellowB', v)} error={errors.yellowB} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="Trash" placeholder="Enter Trash"
                    value={formData.trash} onChange={v => handleChange('trash', v)} error={errors.trash} />
                <CustomInput label="RD" placeholder="Enter RD"
                    value={formData.rd} onChange={v => handleChange('rd', v)} error={errors.rd} />
                <CustomInput label="Colour Grade" placeholder="Enter Colour Grade"
                    value={formData.colourGrade} onChange={v => handleChange('colourGrade', v)} error={errors.colourGrade} />
            </div>

        </>
    );
});

export default CottonHVIDataEntry;
