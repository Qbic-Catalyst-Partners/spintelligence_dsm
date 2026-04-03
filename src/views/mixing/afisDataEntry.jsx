import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { submitAfis, clearMixingState } from '@/store/slices/mixing';
import styles from '../../styles/afisDataEntery.module.css';

const initialForm = {
    variety: '', invoiceNo: '', invoiceDate: '',
    uql: '', l5: '', sfcN: '',
    ifc: '', fibreNepsGms: '', sfcW: '',
    maturity: '', fineness: '', scnGms: '',
};

const AfisDataEntry = forwardRef(function AfisDataEntry({ date, lotNo }, ref) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const [formData, setFormData] = useState(initialForm);
    const [errors, setErrors] = useState({});

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    useEffect(() => {
        if (actionSuccess) {
            setFormData(initialForm);
        }
    }, [actionSuccess, dispatch]);

    const buildPayload = () => ({
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
    });

    const handleSubmit = () => {
        dispatch(submitAfis(buildPayload()));
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
        { label: "UQL", value: formData.uql },
        { label: "L5%", value: formData.l5 },
        { label: "SFC(N)", value: formData.sfcN },
        { label: "IFC %", value: formData.ifc },
        { label: "Fibre Neps Gms", value: formData.fibreNepsGms },
        { label: "SFC(W)", value: formData.sfcW },
        { label: "Maturity", value: formData.maturity },
        { label: "Fineness", value: formData.fineness },
        { label: "SCN (gms)", value: formData.scnGms },
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
    }));

    return (
        <>
            {/* Row 1: Variety, Invoice No, Invoice Date */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label className="text-xs font-semibold text-slate-700">Variety</label>
                    <select
                        className={`${styles['mixx-input']} ${errors.variety ? styles['mixx-error'] : ''}`}
                        value={formData.variety}
                        onChange={(e) => handleChange('variety', e.target.value)}
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

            {/* Row 4: Maturity, Fineness, SCN (gms) */}
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
                    label="SCN (gms)"
                    placeholder="Enter SCN (gms)"
                    value={formData.scnGms}
                    onChange={(value) => handleChange('scnGms', value)}
                    error={errors.scnGms}
                />
            </div>

        </>
    );
});

export default AfisDataEntry;
