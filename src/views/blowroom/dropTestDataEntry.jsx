import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { saveBlowroomDropTest, resetState } from '@/store/slices/blowroomSlice';
import { sanitizeIntegerInput, sanitizeNumericInput } from '@/utils/inputValidation';
import styles from '@/styles/dropTestDataEntry.module.css';

const emptyTuft = () => ({
    tuftVariety: '',
    actDisplay: '',
    displayWt: '',
    actWt: '',
    diff: '',
    ratio: '',
});

const initialForm = { variety: '', blend: '' };

const DropTestDataEntry = forwardRef(function DropTestDataEntry(
    { date, lotNo, selectedTypeName, onTypeChange, onDateChange, onLotNoChange, typeOptions = [] },
    ref
) {
    const dispatch = useDispatch();
    const { success } = useSelector(state => state.blowroom ?? {});
    const [formData, setFormData] = useState(initialForm);
    const [numTufts, setNumTufts] = useState('');
    const [tufts, setTufts] = useState([]);
    const [expandedTuftIndex, setExpandedTuftIndex] = useState(0);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (success) {
            setFormData(initialForm);
            setNumTufts('');
            setTufts([]);
            setExpandedTuftIndex(0);
        }
    }, [success, dispatch]);

    const handleSubmit = async () => {
        if (!validate()) return;
        try {
            for (let i = 0; i < tufts.length; i++) {
                await dispatch(saveBlowroomDropTest({
                    drop_id: lotNo,
                    date,
                    variety: formData.variety,
                    blend: formData.blend,
                    tuft_no: i + 1,
                    tuft_variety: tufts[i].tuftVariety,
                    display_weight: Number(tufts[i].displayWt) || 0,
                    actual_weight: Number(tufts[i].actWt) || 0,
                    difference: Number(tufts[i].diff) || 0,
                    ratio_percent: Number(tufts[i].ratio) || 0,
                })).unwrap();
            }
        } catch (error) {
            throw error;
        }
    };

    const handleClear = () => {
        setFormData(initialForm);
        setNumTufts('');
        setTufts([]);
        setExpandedTuftIndex(0);
        dispatch(resetState());
        setErrors({});
    };

    const validate = () => {
        const nextErrors = {};
        if (!date) nextErrors.date = true;
        if (!lotNo) nextErrors.lotNo = true;
        ["variety","blend"].forEach((k)=>{ if (!String(formData[k]||"").trim()) nextErrors[k]=true; });
        if (!numTufts || Number(numTufts) <=0) nextErrors.numTufts = true;
        tufts.forEach((tuft, idx)=>{
            ["tuftVariety","actDisplay","displayWt","actWt"].forEach(k=>{
                if (String(tuft[k]||"").trim()==="") nextErrors[`tuft-${idx}-${k}`]=true;
            });
        });
        setErrors(nextErrors);
        return Object.keys(nextErrors).length===0;
    };

    useImperativeHandle(ref, () => ({
        submit: handleSubmit,
        clear: handleClear,
        validate,
        getPreviewData: () => {
            const header = [
                { label: "Type", value: selectedTypeName || "Drop Test Data Entry" },
                { label: "Drop ID", value: lotNo },
                { label: "Date", value: date },
                { label: "Variety", value: formData.variety },
                { label: "Blend", value: formData.blend },
                { label: "No. of Tufts", value: numTufts },
            ];
            const entries = tufts.map((t, idx)=>({
                label: `Tuft ${idx+1}`,
                value: `Var:${t.tuftVariety} | ActDisp:${t.actDisplay} | DispWt:${t.displayWt} | ActWt:${t.actWt} | Diff:${t.diff} | Ratio:${t.ratio}`
            }));
            return [...header, ...entries];
        },
    }));

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    const handleTuftCountChange = (value) => {
        const safeValue = sanitizeIntegerInput(value, 2);
        let n = Math.min(Number(safeValue), 20);
        setNumTufts(safeValue);
        setErrors((prev) => {
            if (!prev.numTufts) return prev;
            const next = { ...prev };
            delete next.numTufts;
            return next;
        });
        setTufts(prev => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyTuft());
            return arr.slice(0, n);
        });
        if (n > 0) {
            setExpandedTuftIndex((current) => Math.min(current, n - 1));
        } else {
            setExpandedTuftIndex(0);
        }
    };

    const handleTuftFieldChange = (index, field, value) => {
        const updated = [...tufts];
        updated[index][field] = field === 'tuftVariety'
            ? value
            : sanitizeNumericInput(value, { precision: 8, scale: 3 });

        const actDisplay = Number(updated[index].actDisplay) || 0;
        const displayWt  = Number(updated[index].displayWt)  || 0;
        const actWt      = Number(updated[index].actWt)      || 0;

        updated[index].diff  = displayWt - actDisplay;
        updated[index].ratio = displayWt ? (actWt / displayWt).toFixed(2) : '';

        setTufts(updated);
        setErrors((prev) => {
            const key = `tuft-${index}-${field}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    return (
        <>
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Type</label>
                    <select
                        className={`${styles['mixx-input']} ${errors.type ? styles['mixx-error'] : ''}`}
                        value={selectedTypeName || "Drop Test Data Entry"}
                        onChange={e => onTypeChange?.(e.target.value)}
                    >
                        {typeOptions.map(option => (
                            <option key={option.id || option.name} value={option.name}>{option.name}</option>
                        ))}
                    </select>
                </div>

                <div className={styles['mixx-group']}>
                    <label>Drop ID</label>
                    <input
                        className={`${styles['mixx-input']} ${errors.lotNo ? styles['mixx-error'] : ''}`}
                        value={lotNo}
                        placeholder="Auto Generated"
                        onChange={e => onLotNoChange?.(e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Date</label>
                    <input
                        type="date"
                        className={`${styles['mixx-input']} ${errors.date ? styles['mixx-error'] : ''}`}
                        value={date}
                        onChange={e => onDateChange?.(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Variety</label>
                    <select
                        className={`${styles['mixx-input']} ${errors.variety ? styles['mixx-error'] : ''}`}
                        value={formData.variety}
                        onChange={e => handleChange('variety', e.target.value)}
                    >
                        <option value="">Select Variety</option>
                        <option>B AIR</option>
                        <option>MCU5</option>
                    </select>
                </div>

                <div className={styles['mixx-group']}>
                    <label>Blend</label>
                    <input
                        className={`${styles['mixx-input']} ${errors.blend ? styles['mixx-error'] : ''}`}
                        placeholder="0/40"
                        value={formData.blend}
                        onChange={e => handleChange('blend', e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Number of Tufts (N)</label>
                    <input
                        type="number"
                        className={`${styles['mixx-input']} ${errors.numTufts ? styles['mixx-error'] : ''}`}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={numTufts}
                        placeholder="Max 20"
                        onChange={e => handleTuftCountChange(e.target.value)}
                        onWheel={e => e.target.blur()}
                    />
                </div>
            </div>

            <div className={styles['section-heading']}>Tuft Details ({tufts.length || 0} rows)</div>

            {tufts.map((tuft, i) => (
                <div className={styles['tuft-card']} key={i}>
                    <button
                        type="button"
                        className={styles['tuft-toggle']}
                        onClick={() => setExpandedTuftIndex(expandedTuftIndex === i ? -1 : i)}
                    >
                        <span>{`Tuft ${i + 1}`}</span>
                        <span className={styles['tuft-toggle-icon']}>
                            {expandedTuftIndex === i ? <HiChevronUp /> : <HiChevronDown />}
                        </span>
                    </button>

                    {expandedTuftIndex === i && (
                        <div className={styles['tuft-body']}>
                            <div className={styles['mixxx-row']}>
                                <div className={styles['mixx-group']}>
                                    <label>Tuft Variety</label>
                                    <select
                                        className={`${styles['mixx-input']} ${errors[`tuft-${i}-tuftVariety`] ? styles['mixx-error'] : ''}`}
                                        value={tuft.tuftVariety}
                                        onChange={e => handleTuftFieldChange(i, 'tuftVariety', e.target.value)}
                                    >
                                        <option value="">Select</option>
                                        <option>B AIR</option>
                                        <option>MCU5</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles['mixxx-row']}>
                                <div className={styles['mixx-group']}>
                                    <label>Act Display</label>
                                    <input
                                        className={`${styles['mixx-input']} ${errors[`tuft-${i}-actDisplay`] ? styles['mixx-error'] : ''}`}
                                        placeholder="0.00"
                                        value={tuft.actDisplay}
                                        onChange={e => handleTuftFieldChange(i, 'actDisplay', e.target.value)}
                                    />
                                </div>

                                <div className={styles['mixx-group']}>
                                    <label>Display Wt.</label>
                                    <input
                                        className={`${styles['mixx-input']} ${errors[`tuft-${i}-displayWt`] ? styles['mixx-error'] : ''}`}
                                        placeholder="0.00"
                                        value={tuft.displayWt}
                                        onChange={e => handleTuftFieldChange(i, 'displayWt', e.target.value)}
                                    />
                                </div>

                                <div className={styles['mixx-group']}>
                                    <label>Act Wt.</label>
                                    <input
                                        className={`${styles['mixx-input']} ${errors[`tuft-${i}-actWt`] ? styles['mixx-error'] : ''}`}
                                        placeholder="0.00"
                                        value={tuft.actWt}
                                        onChange={e => handleTuftFieldChange(i, 'actWt', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className={styles['mixxx-row']}>
                                <div className={styles['mixx-group']}>
                                    <label>Diff (Disp. Wt - Act Display)</label>
                                    <input
                                        className={styles['mixx-input']}
                                        value={tuft.diff}
                                        disabled
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className={styles['mixx-group']}>
                                    <label>Ratio (Act Wt / Tuft) * 100</label>
                                    <input
                                        className={styles['mixx-input']}
                                        value={tuft.ratio}
                                        disabled
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))}

        </>
    );
});

export default DropTestDataEntry;
