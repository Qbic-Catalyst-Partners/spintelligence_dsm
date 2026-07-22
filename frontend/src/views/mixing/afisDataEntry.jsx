import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import SearchableSelect from '@/components/SearchableSelect';
import NotebookCustomFields from '@/components/NotebookCustomFields';
import useMixingMasterVarieties from '@/hooks/useMixingMasterVarieties';
import { submitAfis, clearMixingState } from '@/store/slices/mixing';
import { createThresholdViolationTickets } from '@/utils/thresholdTicketing';
import { sanitizeNumericInput } from '@/utils/inputValidation';
import { saveNotebookCustomFieldValuesApi } from '@/apis/notebookCustomFieldsApi';
import styles from '../../styles/afisDataEntery.module.css';

const initialForm = {
    variety: '', invoiceNo: '', invoiceDate: '',
    uql: '', l5: '', sfcN: '',
    ifc: '', fibreNepsGms: '', sfcW: '',
    maturity: '', fineness: '', scnGms: '',
};

const NUMERIC_FIELDS = new Set([
    'uql', 'l5', 'sfcN', 'ifc', 'fibreNepsGms', 'sfcW', 'maturity', 'fineness', 'scnGms',
]);

const AfisDataEntry = forwardRef(function AfisDataEntry({ date, entryId, lotNo, selectedLotDetails, selectedTypeName }, ref) {
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
        setFormData((prev) => ({ ...prev, [field]: nextValue }));
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
        entry_id:         entryId || undefined,
        inspection_date:  date,
        lot_no:           lotNo,
        variety:          formData.variety,
        invoice_no:       formData.invoiceNo,
        invoice_date:     formData.invoiceDate,
        uql:              Number(formData.uql)          || 0,
        l5:               Number(formData.l5)           || 0,
        sfc_n:            Number(formData.sfcN)         || 0,
        ifc:              Number(formData.ifc)          || 0,
        fibre_neps_gms:   Number(formData.fibreNepsGms) || 0,
        sfc_w:            Number(formData.sfcW)         || 0,
        maturity:         Number(formData.maturity)     || 0,
        fineness:         Number(formData.fineness)     || 0,
        scn_gms:          Number(formData.scnGms)       || 0,
        user_name:        user?.name || user?.full_name || user?.user_name || user?.username || "",
    });

    const handleSubmit = async () => {
        const payload = buildPayload();
        await dispatch(submitAfis(payload)).unwrap();

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
                screenName: selectedTypeName || "AFIS",
                machineName: selectedTypeName || "AFIS",
                values: [
                    { label: "UQL", value: formData.uql },
                    { label: "L5%", value: formData.l5 },
                    { label: "SFC(N)", value: formData.sfcN },
                    { label: "IFC %", value: formData.ifc },
                    { label: "Fibre Neps Gms", value: formData.fibreNepsGms },
                    { label: "SFC(W)", value: formData.sfcW },
                    { label: "Maturity", value: formData.maturity },
                    { label: "Fineness", value: formData.fineness },
                    { label: "SCN/gm", value: formData.scnGms },
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
        { label: "UQL", value: formData.uql },
        { label: "L5%", value: formData.l5 },
        { label: "SFC(N)", value: formData.sfcN },
        { label: "IFC %", value: formData.ifc },
        { label: "Fibre Neps Gms", value: formData.fibreNepsGms },
        { label: "SFC(W)", value: formData.sfcW },
        { label: "Maturity", value: formData.maturity },
        { label: "Fineness", value: formData.fineness },
        { label: "SCN/gm", value: formData.scnGms },
    ]);

    const validate = () => {
        const required = [
            "variety","invoiceNo","invoiceDate","uql","l5","sfcN","ifc","fibreNepsGms","sfcW","maturity","fineness","scnGms"
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
            const list =
                raw?.json_output ||
                raw?.data ||
                raw?.result?.json_output ||
                raw?.result?.data ||
                [];
            const source = Array.isArray(list) ? (list[0] || {}) : (raw?.result || raw || {});
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
                uql: pick("uql", "UQL"),
                l5: pick("l5", "L5%"),
                sfcN: pick("sfc_n", "sfcN", "SFC(N)"),
                ifc: pick("ifc", "IFC %"),
                fibreNepsGms: pick("fibre_neps_gms", "fibreNepsGms", "Fibre Neps Gms"),
                sfcW: pick("sfc_w", "sfcW", "SFC(W)"),
                maturity: pick("maturity", "Maturity"),
                fineness: pick("fineness", "Fineness"),
                scnGms: pick("scn_gms", "scnGms", "SCN/gm"),
            }));
        },
    }));

    return (
        <>
            {/* Row 1: Variety, Invoice No, Invoice Date */}
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

                <CustomInput
                    label="Invoice No"
                    placeholder=""
                    value={formData.invoiceNo}
                    onChange={(value) => handleChange('invoiceNo', value)}
                    error={errors.invoiceNo}
                />

                <CustomInput
                    label="Invoice Date"
                    type="date"
                    value={formData.invoiceDate}
                    onChange={(value) => handleChange('invoiceDate', value)}
                    error={errors.invoiceDate}
                />
            </div>

            {/* Row 2: UQL, L5%, SFC(N) */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="UQL"
                    placeholder="Enter UQL"
                    value={formData.uql}
                    onChange={(value) => handleChange('uql', value)}
                    error={errors.uql}
                />

                <CustomInput
                    label="L5%"
                    placeholder="Enter L5%"
                    value={formData.l5}
                    onChange={(value) => handleChange('l5', value)}
                    error={errors.l5}
                />

                <CustomInput
                    label="SFC(N)"
                    placeholder="Enter SFC(N)"
                    value={formData.sfcN}
                    onChange={(value) => handleChange('sfcN', value)}
                    error={errors.sfcN}
                />
            </div>

            {/* Row 3: IFC %, Fibre Neps Gms, SFC(W) */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="IFC %"
                    placeholder="Enter IFC %"
                    value={formData.ifc}
                    onChange={(value) => handleChange('ifc', value)}
                    error={errors.ifc}
                />

                <CustomInput
                    label="Fibre Neps Gms"
                    placeholder="Enter Fibre Neps Gms"
                    value={formData.fibreNepsGms}
                    onChange={(value) => handleChange('fibreNepsGms', value)}
                    error={errors.fibreNepsGms}
                />

                <CustomInput
                    label="SFC(W)"
                    placeholder="Enter SFC(W)"
                    value={formData.sfcW}
                    onChange={(value) => handleChange('sfcW', value)}
                    error={errors.sfcW}
                />
            </div>

            {/* Row 4: Maturity, Fineness, SCN/gm */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="Maturity"
                    placeholder="Enter Maturity"
                    value={formData.maturity}
                    onChange={(value) => handleChange('maturity', value)}
                    error={errors.maturity}
                />

                <CustomInput
                    label="Fineness"
                    placeholder="Enter Fineness"
                    value={formData.fineness}
                    onChange={(value) => handleChange('fineness', value)}
                    error={errors.fineness}
                />

                <CustomInput
                    label="SCN/gm"
                    placeholder="Enter SCN/gm"
                    value={formData.scnGms}
                    onChange={(value) => handleChange('scnGms', value)}
                    error={errors.scnGms}
                />
            </div>

            <NotebookCustomFields
                department="Quality Control"
                subDepartment="Mixing"
                notebook="AFIS Data Entry"
                entryId={entryId}
                values={customFieldValues}
                onChange={handleCustomFieldChange}
            />

        </>
    );
});

export default AfisDataEntry;
