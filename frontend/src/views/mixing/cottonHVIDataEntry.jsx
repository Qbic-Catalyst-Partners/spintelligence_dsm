import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import SearchableSelect from '@/components/SearchableSelect';
import useMixingMasterVarieties from '@/hooks/useMixingMasterVarieties';
import { submitCottonHVI, clearMixingState } from '@/store/slices/mixing';
import { createThresholdViolationTickets } from '@/utils/thresholdTicketing';
import { sanitizeNumericInput } from '@/utils/inputValidation';
import styles from '../../styles/cottonHVIDataEntry.module.css';

const initialForm = {
    variety: '', invoiceNo: '', invoiceDate: '',
    sci: '', spanLength: '', mic: '',
    gtex: '', maturity: '', ur: '',
    sfi: '', elongation: '', yellowB: '',
    trCnt: '', trAr: '', trID: '', invisibleLossPercent: '', trashContentPercent: '', rd: '', colourGrade: '',
};

const NUMERIC_FIELDS = new Set([
    'sci', 'spanLength', 'mic', 'gtex', 'maturity', 'ur', 'sfi', 'elongation', 'yellowB', 'trCnt', 'trAr', 'trID', 'invisibleLossPercent', 'trashContentPercent', 'rd', 'colourGrade',
]);

const CottonHVIDataEntry = forwardRef(function CottonHVIDataEntry({ date, entryId, lotNo, selectedLotDetails, selectedTypeName }, ref) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const user = useSelector((state) => state.auth?.user);
    const { varietyOptions, varietyOptionsError, loadingVarietyOptions } = useMixingMasterVarieties();
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

    useEffect(() => {
        if (!selectedLotDetails) return;
        setFormData((prev) => ({
            ...prev,
            variety: selectedLotDetails.variety || prev.variety,
            invoiceNo: selectedLotDetails.invoice_no || prev.invoiceNo,
            invoiceDate: selectedLotDetails.invoice_date || prev.invoiceDate,
        }));
        setErrors((prev) => {
            const next = { ...prev };
            if (selectedLotDetails.variety) delete next.variety;
            if (selectedLotDetails.invoice_no) delete next.invoiceNo;
            if (selectedLotDetails.invoice_date) delete next.invoiceDate;
            return next;
        });
    }, [selectedLotDetails]);

    const buildPayload = (overrideEntryId) => ({
        entry_id:        overrideEntryId || entryId || undefined,
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
        trcnt:           Number(formData.trCnt)       || 0,
        trar:            Number(formData.trAr)        || 0,
        trid:            Number(formData.trID)        || 0,
        invisible_loss_percentage: Number(formData.invisibleLossPercent) || 0,
        trash_content_percentage: Number(formData.trashContentPercent) || 0,
        rd:              Number(formData.rd)          || 0,
        colour_grade:    Number(formData.colourGrade) || 0,
        user_name:       user?.name || user?.full_name || user?.user_name || user?.username || "",
    });

    const handleSubmit = async (overrideEntryId) => {
        const payload = buildPayload(overrideEntryId);
        await dispatch(submitCottonHVI(payload)).unwrap();

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
                    { label: "TrCnt", value: formData.trCnt },
                    { label: "TrAr", value: formData.trAr },
                    { label: "TrID", value: formData.trID },
                    { label: "Invisible Loss %", value: formData.invisibleLossPercent },
                    { label: "Trash Content %", value: formData.trashContentPercent },
                    { label: "RD", value: formData.rd },
                    { label: "Colour Grade", value: formData.colourGrade },
                ],
            });
        } catch (ticketError) {
            console.error("Threshold ticket generation failed:", ticketError);
        }

        return true;
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
        { label: "TrCnt", value: formData.trCnt },
        { label: "TrAr", value: formData.trAr },
        { label: "TrID", value: formData.trID },
        { label: "Invisible Loss %", value: formData.invisibleLossPercent },
        { label: "Trash Content %", value: formData.trashContentPercent },
        { label: "RD", value: formData.rd },
        { label: "Colour Grade", value: formData.colourGrade },
    ]);

    const validate = () => {
        const required = [
            "variety","invoiceNo","invoiceDate","sci","spanLength","mic","gtex","maturity",
            "ur","sfi","elongation","yellowB","trCnt","trAr","trID","invisibleLossPercent","trashContentPercent","rd","colourGrade"
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
        applyOcrData: (raw) => {
            const rows =
                raw?.json_output ||
                raw?.data ||
                raw?.result?.json_output ||
                raw?.result?.data ||
                null;
            const reviewedValues = raw?.values || raw?.result?.values || null;
            const source = Array.isArray(rows) && rows.length
                ? { ...(rows[0] || {}), ...(reviewedValues || {}) }
                : (reviewedValues || raw?.result || raw || {});
            const pick = (...keys) => {
                for (const key of keys) {
                    const v = source?.[key];
                    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
                }
                return "";
            };

            setFormData((prev) => ({
                ...prev,
                variety: pick("variety", "Variety"),
                invoiceNo: pick("invoice_no", "invoiceNo", "Invoice No"),
                invoiceDate: pick("invoice_date", "invoiceDate", "Invoice Date"),
                sci: pick("sci", "SCI"),
                spanLength: pick("span_length", "spanLength", "Span Length (2.5%)"),
                mic: pick("mic", "Mic"),
                gtex: pick("gtex", "GTEX"),
                maturity: pick("maturity", "Maturity"),
                ur: pick("ur", "UR"),
                sfi: pick("sfi", "SFI"),
                elongation: pick("elongation", "Elongation"),
                yellowB: pick("yellow_b", "yellowB", "Yellow + B"),
                trCnt: pick("trcnt", "trCnt", "TrCnt"),
                trAr: pick("trar", "trAr", "TrAr"),
                trID: pick("trid", "trID", "TrID"),
                invisibleLossPercent: pick("invisible_loss_percentage", "invisibleLossPercent", "Invisible Loss %"),
                trashContentPercent: pick("trash_content_percentage", "trashContentPercent", "Trash Content %"),
                rd: pick("rd", "RD"),
                colourGrade: pick("colour_grade", "colourGrade", "Colour Grade"),
            }));
        },
    }));

    return (
        <>
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label className="text-xs font-semibold text-slate-700">Variety</label>
                    <SearchableSelect
                        className={`${styles['mixx-input']} ${errors.variety ? styles['mixx-error'] : ''}`}
                        value={formData.variety}
                        onChange={(value) => handleChange('variety', value)}
                        options={varietyOptions}
                        placeholder={
                            loadingVarietyOptions
                                ? 'Loading varieties...'
                                : varietyOptionsError
                                    ? 'Type variety'
                                    : 'Select Variety'
                        }
                        ariaLabel="Variety"
                    />
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
                <CustomInput label="TrCnt" placeholder="Enter TrCnt"
                    value={formData.trCnt} onChange={v => handleChange('trCnt', v)} error={errors.trCnt} />
                <CustomInput label="TrAr" placeholder="Enter TrAr"
                    value={formData.trAr} onChange={v => handleChange('trAr', v)} error={errors.trAr} />
                <CustomInput label="TrID" placeholder="Enter TrID"
                    value={formData.trID} onChange={v => handleChange('trID', v)} error={errors.trID} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="Invisible Loss %" placeholder="Enter Invisible Loss %"
                    value={formData.invisibleLossPercent} onChange={v => handleChange('invisibleLossPercent', v)} error={errors.invisibleLossPercent} />
                <CustomInput label="Trash Content %" placeholder="Enter Trash Content %"
                    value={formData.trashContentPercent} onChange={v => handleChange('trashContentPercent', v)} error={errors.trashContentPercent} />
                <CustomInput label="RD" placeholder="Enter RD"
                    value={formData.rd} onChange={v => handleChange('rd', v)} error={errors.rd} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="Colour Grade" placeholder="Enter Colour Grade"
                    value={formData.colourGrade} onChange={v => handleChange('colourGrade', v)} error={errors.colourGrade} />
            </div>

        </>
    );
});

export default CottonHVIDataEntry;
