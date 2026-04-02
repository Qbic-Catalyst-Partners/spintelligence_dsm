import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { submitCottonHVI, clearMixingState } from '@/store/slices/mixing';
import styles from '../../styles/cottonHVIDataEntry.module.css';

const initialForm = {
    variety: '', invoiceNo: '', invoiceDate: '',
    sci: '', spanLength: '', mic: '',
    gtex: '', maturity: '', ur: '',
    sfi: '', elongation: '', yellowB: '',
    trash: '', rd: '', colourGrade: '',
};

const CottonHVIDataEntry = forwardRef(function CottonHVIDataEntry({ date, lotNo }, ref) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const [formData, setFormData] = useState(initialForm);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    useEffect(() => {
        if (actionSuccess) {
            setFormData(initialForm);
            dispatch(clearMixingState());
        }
    }, [actionSuccess, dispatch]);

    const handleSubmit = () => {
        dispatch(submitCottonHVI({
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
        }));
    };

    const handleClear = () => {
        setFormData(initialForm);
        dispatch(clearMixingState());
    };

    useImperativeHandle(ref, () => ({ submit: handleSubmit, clear: handleClear }));

    return (
        <>
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label className="text-xs font-semibold text-slate-700">Variety</label>
                    <select
                        className={styles['mixx-input']}
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
                    value={formData.invoiceNo} onChange={v => handleChange('invoiceNo', v)} />

                <CustomInput label="Invoice Date" type="date"
                    value={formData.invoiceDate} onChange={v => handleChange('invoiceDate', v)} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="SCI" placeholder="Enter SCI"
                    value={formData.sci} onChange={v => handleChange('sci', v)} />
                <CustomInput label="Span Length (2.5%)" placeholder="Enter Span Length"
                    value={formData.spanLength} onChange={v => handleChange('spanLength', v)} />
                <CustomInput label="Mic" placeholder="Enter Mic"
                    value={formData.mic} onChange={v => handleChange('mic', v)} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="GTEX" placeholder="Enter GTEX"
                    value={formData.gtex} onChange={v => handleChange('gtex', v)} />
                <CustomInput label="Maturity" placeholder="Enter Maturity"
                    value={formData.maturity} onChange={v => handleChange('maturity', v)} />
                <CustomInput label="UR" placeholder="Enter UR"
                    value={formData.ur} onChange={v => handleChange('ur', v)} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="SFI" placeholder="Enter SFI"
                    value={formData.sfi} onChange={v => handleChange('sfi', v)} />
                <CustomInput label="Elongation" placeholder="Enter Elongation"
                    value={formData.elongation} onChange={v => handleChange('elongation', v)} />
                <CustomInput label="Yellow + B" placeholder="Enter..."
                    value={formData.yellowB} onChange={v => handleChange('yellowB', v)} />
            </div>

            <div className={styles['mixx-row']}>
                <CustomInput label="Trash" placeholder="Enter Trash"
                    value={formData.trash} onChange={v => handleChange('trash', v)} />
                <CustomInput label="RD" placeholder="Enter RD"
                    value={formData.rd} onChange={v => handleChange('rd', v)} />
                <CustomInput label="Colour Grade" placeholder="Enter Colour Grade"
                    value={formData.colourGrade} onChange={v => handleChange('colourGrade', v)} />
            </div>

        </>
    );
});

export default CottonHVIDataEntry;
