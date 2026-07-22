import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import SearchableSelect from '@/components/SearchableSelect';
import NotebookCustomFields from '@/components/NotebookCustomFields';
import useMixingMasterVarieties from '@/hooks/useMixingMasterVarieties';
import { submitFibre, clearMixingState } from '@/store/slices/mixing';
import { createThresholdViolationTickets } from '@/utils/thresholdTicketing';
import { sanitizeNumericInput } from '@/utils/inputValidation';
import { saveNotebookCustomFieldValuesApi } from '@/apis/notebookCustomFieldsApi';
import styles from '../../styles/fibreDataEntry.module.css';

const initialForm = {
    variety: '', invoiceNo: '', invoiceDate: '',
    cutLength: '', lengthCV: '',
    meanDenier: '', cvPerDenier: '',
    tenacity: '', cvPerTenacity: '',
    elongation: '', cvPerElongation: '',
    crimp: '', whitenessIndex: '', spinFinish: '',
};

const NUMERIC_FIELDS = new Set([
    'cutLength', 'lengthCV', 'meanDenier', 'cvPerDenier', 'tenacity', 'cvPerTenacity', 'elongation', 'cvPerElongation', 'crimp', 'whitenessIndex', 'spinFinish',
]);

const FibreDataEntry = forwardRef(function FibreDataEntry({ date, entryId, lotNo, selectedLotDetails, selectedTypeName }, ref) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const user = useSelector((state) => state.auth?.user);
    const { varietyOptions, varietyOptionsError, loadingVarietyOptions } = useMixingMasterVarieties();
    const [formData, setFormData] = useState(initialForm);
    const [errors, setErrors] = useState({});
    const [customFieldValues, setCustomFieldValues] = useState({});

    const handleCustomFieldChange = (fieldId, value) => {
        setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    };

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

    const buildPayload = () => ({
        entry_id:          entryId || undefined,
        inspection_date:   date,
        lot_no:            lotNo,
        variety:           formData.variety,
        invoice_no:        formData.invoiceNo,
        invoice_date:      formData.invoiceDate,
        cut_length:        Number(formData.cutLength)       || 0,
        length_cv:         Number(formData.lengthCV)        || 0,
        mean_denier:       Number(formData.meanDenier)      || 0,
        cv_per_denier:     Number(formData.cvPerDenier)     || 0,
        tenacity:          Number(formData.tenacity)        || 0,
        cv_per_tenacity:   Number(formData.cvPerTenacity)   || 0,
        elongation:        Number(formData.elongation)      || 0,
        cv_per_elongation: Number(formData.cvPerElongation) || 0,
        crimp:             Number(formData.crimp)           || 0,
        whiteness_index:   Number(formData.whitenessIndex)  || 0,
        spin_finish:       Number(formData.spinFinish)      || 0,
        user_name:         user?.name || user?.full_name || user?.user_name || user?.username || "",
    });

    const handleSubmit = async () => {
        const payload = buildPayload();
        await dispatch(submitFibre(payload)).unwrap();

        const linkedEntryId = payload.entry_id;
        const customFieldEntries = Object.entries(customFieldValues).filter(([, v]) => String(v ?? '').trim() !== '');
        if (linkedEntryId && customFieldEntries.length) {
            try {
                await saveNotebookCustomFieldValuesApi(
                    linkedEntryId,
                    customFieldEntries.map(([customFieldId, value]) => ({ custom_field_id: customFieldId, value }))
                );
            } catch (customFieldError) {
                console.error("Failed to save custom field values:", customFieldError);
            }
        }

        try {
            await createThresholdViolationTickets({
                department: "Quality Control",
                subDepartment: "Mixing",
                screenName: selectedTypeName || "Fibre",
                machineName: selectedTypeName || "Fibre",
                values: [
                    { label: "Cut Length", value: formData.cutLength },
                    { label: "Length CV", value: formData.lengthCV },
                    { label: "Mean Denier", value: formData.meanDenier },
                    { label: "CV per Denier", value: formData.cvPerDenier },
                    { label: "Tenacity", value: formData.tenacity },
                    { label: "CV per Tenacity", value: formData.cvPerTenacity },
                    { label: "Elongation", value: formData.elongation },
                    { label: "CV per Elongation", value: formData.cvPerElongation },
                    { label: "Crimp (ARC/CM)", value: formData.crimp },
                    { label: "Whiteness Index", value: formData.whitenessIndex },
                    { label: "Spin Finish", value: formData.spinFinish },
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
        setCustomFieldValues({});
    };

    const getPreviewData = () => ([
        { label: "Date", value: date },
        { label: "Lot No", value: lotNo },
        { label: "Variety", value: formData.variety },
        { label: "Invoice No", value: formData.invoiceNo },
        { label: "Invoice Date", value: formData.invoiceDate },
        { label: "Cut Length", value: formData.cutLength },
        { label: "Length CV", value: formData.lengthCV },
        { label: "Mean Denier", value: formData.meanDenier },
        { label: "CV per Denier", value: formData.cvPerDenier },
        { label: "Tenacity", value: formData.tenacity },
        { label: "CV per Tenacity", value: formData.cvPerTenacity },
        { label: "Elongation", value: formData.elongation },
        { label: "CV per Elongation", value: formData.cvPerElongation },
        { label: "Crimp (ARC/CM)", value: formData.crimp },
        { label: "Whiteness Index", value: formData.whitenessIndex },
        { label: "Spin Finish", value: formData.spinFinish },
    ]);

    const validate = () => {
        const required = [
            "variety","invoiceNo","invoiceDate","cutLength","lengthCV","meanDenier","cvPerDenier",
            "tenacity","cvPerTenacity","elongation","cvPerElongation","crimp"
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
            {/* Row 1: Variety, Invoice No, Invoice Date */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Variety</label>
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

            {/* Row 2 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Cut Length" placeholder="Enter Cut Length"
                    value={formData.cutLength} onChange={v => handleChange('cutLength', v)} error={errors.cutLength} />
                <CustomInput label="Length CV" placeholder="Enter Length CV"
                    value={formData.lengthCV} onChange={v => handleChange('lengthCV', v)} error={errors.lengthCV} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 3 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Mean Denier" placeholder="Enter Mean Denier"
                    value={formData.meanDenier} onChange={v => handleChange('meanDenier', v)} error={errors.meanDenier} />
                <CustomInput label="CV per Denier" placeholder="Enter CV per Denier"
                    value={formData.cvPerDenier} onChange={v => handleChange('cvPerDenier', v)} error={errors.cvPerDenier} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 4 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Tenacity" placeholder="Enter Tenacity"
                    value={formData.tenacity} onChange={v => handleChange('tenacity', v)} error={errors.tenacity} />
                <CustomInput label="CV per Tenacity" placeholder="Enter CV per Tenacity"
                    value={formData.cvPerTenacity} onChange={v => handleChange('cvPerTenacity', v)} error={errors.cvPerTenacity} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 5 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Elongation" placeholder="Enter Elongation"
                    value={formData.elongation} onChange={v => handleChange('elongation', v)} error={errors.elongation} />
                <CustomInput label="CV per Elongation" placeholder="Enter CV per Elongation"
                    value={formData.cvPerElongation} onChange={v => handleChange('cvPerElongation', v)} error={errors.cvPerElongation} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 6 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Crimp (ARC/CM)" placeholder="Enter Crimp"
                    value={formData.crimp} onChange={v => handleChange('crimp', v)} error={errors.crimp} />
                <CustomInput label="Whiteness Index (optional)" placeholder="Enter Whiteness Index"
                    value={formData.whitenessIndex} onChange={v => handleChange('whitenessIndex', v)} error={errors.whitenessIndex} />
                <CustomInput label="Spin Finish (optional)" placeholder="Enter Spin Finish"
                    value={formData.spinFinish} onChange={v => handleChange('spinFinish', v)} error={errors.spinFinish} />
            </div>

            <NotebookCustomFields
                department="Quality Control"
                subDepartment="Mixing"
                notebook="Fibre Data Entry"
                entryId={entryId}
                values={customFieldValues}
                onChange={handleCustomFieldChange}
            />

        </>
    );
});

export default FibreDataEntry;
