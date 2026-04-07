import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { MdEditNote } from 'react-icons/md';
import CustomInput from '@/components/CustomInput';
import { submitMoisture, clearMixingState } from '@/store/slices/mixing';
import { sanitizeNumericInput } from '@/utils/inputValidation';
import styles from '../../styles/moistureDataEntry.module.css';

const initialForm = { partyLotNo: '', variety: '', partyName: '', prNo: '' };

const MoistureDataEntry = forwardRef(function MoistureDataEntry({ date }, ref) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const [formData, setFormData] = useState(initialForm);
    const [moistureValues, setMoistureValues] = useState(Array(10).fill(''));
    const [errors, setErrors] = useState({});

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    const handleMoistureChange = (index, value) => {
        const updated = [...moistureValues];
        updated[index] = sanitizeNumericInput(value, { precision: 10, scale: 2 });
        setMoistureValues(updated);
        setErrors((prev) => {
            const key = `value${index}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const numbers = moistureValues.map(Number).filter((n) => !isNaN(n) && n !== 0);
    const average = numbers.length > 0
        ? (numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(2)
        : '';

    useEffect(() => {
        if (actionSuccess) {
            setFormData(initialForm);
            setMoistureValues(Array(10).fill(''));
        }
    }, [actionSuccess, dispatch]);

    const buildPayload = () => ({
        inspection_date: date,
        party_lot_no:    formData.partyLotNo,
        variety:         formData.variety,
        party_name:      formData.partyName,
        pr_no:           formData.prNo,
        value1:  parseFloat(moistureValues[0]) || 0,
        value2:  parseFloat(moistureValues[1]) || 0,
        value3:  parseFloat(moistureValues[2]) || 0,
        value4:  parseFloat(moistureValues[3]) || 0,
        value5:  parseFloat(moistureValues[4]) || 0,
        value6:  parseFloat(moistureValues[5]) || 0,
        value7:  parseFloat(moistureValues[6]) || 0,
        value8:  parseFloat(moistureValues[7]) || 0,
        value9:  parseFloat(moistureValues[8]) || 0,
        value10: parseFloat(moistureValues[9]) || 0,
        average: parseFloat(average) || 0,
    });

    const handleSubmit = () => {
        dispatch(submitMoisture(buildPayload()));
    };

    const handleClear = () => {
        setFormData(initialForm);
        setMoistureValues(Array(10).fill(''));
        dispatch(clearMixingState());
        setErrors({});
    };

    const getPreviewData = () => ([
        { label: "Date", value: date },
        { label: "Party Lot No", value: formData.partyLotNo },
        { label: "Variety", value: formData.variety },
        { label: "Party Name", value: formData.partyName },
        { label: "PR No", value: formData.prNo },
        ...moistureValues.map((val, idx) => ({ label: `Value ${idx + 1}`, value: val })),
        { label: "Average", value: average },
    ]);

    const validate = () => {
        const required = ["partyLotNo","variety","partyName","prNo"];
        const nextErrors = required.reduce((acc,key)=>{
            if (String(formData[key] || "").trim() === "") acc[key]=true;
            return acc;
        }, {});
        moistureValues.forEach((val, idx) => {
            if (String(val || "").trim() === "") nextErrors[`value${idx}`] = true;
        });
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
            {/* Row 1: Party Lot No, Variety, Party Name */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="Party Lot No"
                    placeholder="Enter Party Lot No"
                    value={formData.partyLotNo}
                    onChange={(value) => handleChange('partyLotNo', value)}
                    error={errors.partyLotNo}
                />

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
                    label="Party Name"
                    placeholder="Enter Party Name"
                    value={formData.partyName}
                    onChange={(value) => handleChange('partyName', value)}
                    error={errors.partyName}
                />
            </div>

            {/* Row 2: PR No */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="PR No"
                    placeholder="Enter PR No"
                    value={formData.prNo}
                    onChange={(value) => handleChange('prNo', value)}
                    error={errors.prNo}
                />
                <div className={styles['mixx-empty']} />
                <div className={styles['mixx-empty']} />
            </div>

            {/* Moisture Values Header */}
            <div className={styles['mixx-title-row']} style={{ marginTop: '30px' }}>
                <MdEditNote className={styles['mixx-title-icon']} />
                <h3 className={styles['mixx-section-title']}>
                    Moisture Values (Value 1 to Value 10)
                </h3>
            </div>

            {/* 10 value inputs in 5-column grid */}
            <div className={`${styles['mixx-row']} ${styles['five-columns']}`}>
                {moistureValues.map((val, i) => (
                    <div className={styles['mixx-group']} key={i}>
                        <label>Value {i + 1}</label>
                        <input
                            className={styles['mixx-input']}
                            placeholder="0.00"
                            value={val}
                            onChange={(e) => handleMoistureChange(i, e.target.value)}
                            style={errors[`value${i}`] ? { borderColor: '#ef4444', background: '#fff1f2' } : {}}
                        />
                    </div>
                ))}
            </div>

            {/* Average (read-only) */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Average</label>
                    <input
                        className={styles['mixx-input']}
                        value={average}
                        disabled
                        placeholder="0.00"
                    />
                </div>
            </div>

        </>
    );
});

export default MoistureDataEntry;
