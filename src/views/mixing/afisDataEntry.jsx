import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { submitAfis, clearMixingState } from '@/store/slices/mixing';
import styles from './afisDataEntery.module.css';

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

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    useEffect(() => {
        if (actionSuccess) {
            setFormData(initialForm);
            dispatch(clearMixingState());
        }
    }, [actionSuccess, dispatch]);

    const handleSubmit = () => {
        dispatch(submitAfis({
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
        }));
    };

    const handleClear = () => {
        setFormData(initialForm);
        dispatch(clearMixingState());
    };

    useImperativeHandle(ref, () => ({ submit: handleSubmit, clear: handleClear }));

    return (
        <>
            {/* Row 1: Variety, Invoice No, Invoice Date */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label className="text-xs font-semibold text-slate-700">Variety</label>
                    <select
                        className={styles['mixx-input']}
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
                />

                <CustomInput
                    label="Invoice Date"
                    type="date"
                    value={formData.invoiceDate}
                    onChange={(value) => handleChange('invoiceDate', value)}
                />
            </div>

            {/* Row 2: UQL, L5%, SFC(N) */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="UQL"
                    placeholder="Enter UQL"
                    value={formData.uql}
                    onChange={(value) => handleChange('uql', value)}
                />

                <CustomInput
                    label="L5%"
                    placeholder="Enter L5%"
                    value={formData.l5}
                    onChange={(value) => handleChange('l5', value)}
                />

                <CustomInput
                    label="SFC(N)"
                    placeholder="Enter SFC(N)"
                    value={formData.sfcN}
                    onChange={(value) => handleChange('sfcN', value)}
                />
            </div>

            {/* Row 3: IFC %, Fibre Neps Gms, SFC(W) */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="IFC %"
                    placeholder="Enter IFC %"
                    value={formData.ifc}
                    onChange={(value) => handleChange('ifc', value)}
                />

                <CustomInput
                    label="Fibre Neps Gms"
                    placeholder="Enter Fibre Neps Gms"
                    value={formData.fibreNepsGms}
                    onChange={(value) => handleChange('fibreNepsGms', value)}
                />

                <CustomInput
                    label="SFC(W)"
                    placeholder="Enter SFC(W)"
                    value={formData.sfcW}
                    onChange={(value) => handleChange('sfcW', value)}
                />
            </div>

            {/* Row 4: Maturity, Fineness, SCN (gms) */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="Maturity"
                    placeholder="Enter Maturity"
                    value={formData.maturity}
                    onChange={(value) => handleChange('maturity', value)}
                />

                <CustomInput
                    label="Fineness"
                    placeholder="Enter Fineness"
                    value={formData.fineness}
                    onChange={(value) => handleChange('fineness', value)}
                />

                <CustomInput
                    label="SCN (gms)"
                    placeholder="Enter SCN (gms)"
                    value={formData.scnGms}
                    onChange={(value) => handleChange('scnGms', value)}
                />
            </div>

        </>
    );
});

export default AfisDataEntry;
