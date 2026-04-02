import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { submitFibre, clearMixingState } from '@/store/slices/mixing';
import styles from '../../styles/fibreDataEntry.module.css';

const initialForm = {
    variety: '', invoiceNo: '', invoiceDate: '',
    cutLength: '', lengthCV: '',
    meanDenier: '', cvPerDenier: '',
    tenacity: '', cvPerTenacity: '',
    elongation: '', cvPerElongation: '',
    crimp: '', whitenessIndex: '', spinFinish: '',
};

const FibreDataEntry = forwardRef(function FibreDataEntry({ date, lotNo }, ref) {
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
        dispatch(submitFibre({
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
                    <label>Variety</label>
                    <select
                        className={styles['mixx-input']}
                        value={formData.variety}
                        onChange={e => handleChange('variety', e.target.value)}
                    >
                        <option value="">Select Variety</option>
                        <option>Polyester</option>
                        <option>Viscose</option>
                    </select>
                </div>
                <CustomInput label="Invoice No" placeholder=""
                    value={formData.invoiceNo} onChange={v => handleChange('invoiceNo', v)} />
                <CustomInput label="Invoice Date" type="date"
                    value={formData.invoiceDate} onChange={v => handleChange('invoiceDate', v)} />
            </div>

            {/* Row 2 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Cut Length" placeholder="Enter Cut Length"
                    value={formData.cutLength} onChange={v => handleChange('cutLength', v)} />
                <CustomInput label="Length CV" placeholder="Enter Length CV"
                    value={formData.lengthCV} onChange={v => handleChange('lengthCV', v)} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 3 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Mean Denier" placeholder="Enter Mean Denier"
                    value={formData.meanDenier} onChange={v => handleChange('meanDenier', v)} />
                <CustomInput label="CV per Denier" placeholder="Enter CV per Denier"
                    value={formData.cvPerDenier} onChange={v => handleChange('cvPerDenier', v)} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 4 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Tenacity" placeholder="Enter Tenacity"
                    value={formData.tenacity} onChange={v => handleChange('tenacity', v)} />
                <CustomInput label="CV per Tenacity" placeholder="Enter CV per Tenacity"
                    value={formData.cvPerTenacity} onChange={v => handleChange('cvPerTenacity', v)} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 5 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Elongation" placeholder="Enter Elongation"
                    value={formData.elongation} onChange={v => handleChange('elongation', v)} />
                <CustomInput label="CV per Elongation" placeholder="Enter CV per Elongation"
                    value={formData.cvPerElongation} onChange={v => handleChange('cvPerElongation', v)} />
                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`} />
            </div>

            {/* Row 6 */}
            <div className={styles['mixx-row']}>
                <CustomInput label="Crimp (ARC/CM)" placeholder="Enter Crimp"
                    value={formData.crimp} onChange={v => handleChange('crimp', v)} />
                <CustomInput label="Whiteness Index" placeholder="Enter Whiteness Index"
                    value={formData.whitenessIndex} onChange={v => handleChange('whitenessIndex', v)} />
                <CustomInput label="Spin Finish" placeholder="Enter Spin Finish"
                    value={formData.spinFinish} onChange={v => handleChange('spinFinish', v)} />
            </div>

        </>
    );
});

export default FibreDataEntry;
