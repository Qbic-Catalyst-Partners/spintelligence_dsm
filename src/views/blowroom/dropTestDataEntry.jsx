import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { saveBlowroomDropTest, resetState } from '@/store/slices/blowroomSlice';
import { sanitizeIntegerInput, sanitizeNumericInput } from '@/utils/inputValidation';
import SearchableSelect from '@/components/SearchableSelect';
import useBlowroomMasterVarieties from '@/hooks/useBlowroomMasterVarieties';
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
    { date, entryId, selectedTypeName, onTypeChange, onDateChange, typeOptions = [] },
    ref
) {
    const dispatch = useDispatch();
    const { success } = useSelector(state => state.blowroom ?? {});
    const [formData, setFormData] = useState(initialForm);
    const [numTufts, setNumTufts] = useState('');
    const [tufts, setTufts] = useState([]);
    const [expandedTuftIndex, setExpandedTuftIndex] = useState(0);
    const [errors, setErrors] = useState({});
    const { varietyOptions, varietyOptionsError, loadingVarietyOptions } = useBlowroomMasterVarieties();

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
                    entry_id: `${entryId || "BDT"}-${String(i + 1).padStart(2, "0")}`,
                    drop_id: entryId,
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
                { label: "Entry ID", value: entryId || "-" },
                { label: "Variety", value: formData.variety },
                { label: "Blend", value: formData.blend },
                { label: "No. of Tufts", value: numTufts },
            ];
            const entries = tufts.map((t, idx)=>({
                label: `Tuft ${idx+1}`,
                value: `Var:${t.tuftVariety} | ActualWt:${t.actWt} | DisplayWt:${t.displayWt} | AverageWt:${t.actDisplay} | Diff:${t.diff} | Ratio:${t.ratio}`
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
            : sanitizeNumericInput(value, { precision: 8, scale: 4 });

        const totalAverageWt = updated.reduce(
            (sum, tuft) => sum + (Number(tuft.actDisplay) || 0),
            0
        );

        updated.forEach((tuft) => {
            const displayWt = Number(tuft.displayWt) || 0;
            const actualWt = Number(tuft.actWt) || 0;
            const averageWt = Number(tuft.actDisplay) || 0;
            const hasDiffInput = String(tuft.displayWt || '').trim() || String(tuft.actWt || '').trim();

            tuft.diff = hasDiffInput ? (actualWt - displayWt).toFixed(4) : '';
            tuft.ratio = totalAverageWt ? ((averageWt / totalAverageWt) * 100).toFixed(4) : '';
        });

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
                            <option key={option.id || option.name} value={option.name}>{option.displayName ?? option.name}</option>
                        ))}
                    </select>
                </div>

                <div className={styles['mixx-group']}>
                    <label>Entry ID</label>
                    <input
                        type="text"
                        className={styles['mixx-input']}
                        value={entryId || ""}
                        readOnly
                        disabled
                    />
                </div>
            </div>

            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Variety</label>
                    <SearchableSelect
                        className={`${styles['mixx-input']} ${errors.variety ? styles['mixx-error'] : ''}`}
                        value={formData.variety}
                        onChange={value => handleChange('variety', value)}
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
                                    <SearchableSelect
                                        className={`${styles['mixx-input']} ${errors[`tuft-${i}-tuftVariety`] ? styles['mixx-error'] : ''}`}
                                        value={tuft.tuftVariety}
                                        onChange={value => handleTuftFieldChange(i, 'tuftVariety', value)}
                                        options={varietyOptions}
                                        placeholder={
                                            loadingVarietyOptions
                                                ? 'Loading varieties...'
                                                : varietyOptionsError
                                                    ? 'Type tuft variety'
                                                    : 'Select tuft variety'
                                        }
                                        ariaLabel={`Tuft ${i + 1} Variety`}
                                    />
                                </div>
                            </div>

                            <div className={styles['mixxx-row']}>
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
                                    <label>Actual Wt.</label>
                                    <input
                                        className={`${styles['mixx-input']} ${errors[`tuft-${i}-actWt`] ? styles['mixx-error'] : ''}`}
                                        placeholder="0.00"
                                        value={tuft.actWt}
                                        onChange={e => handleTuftFieldChange(i, 'actWt', e.target.value)}
                                    />
                                </div>

                                <div className={styles['mixx-group']}>
                                    <label>Average Wt.</label>
                                    <input
                                        className={`${styles['mixx-input']} ${errors[`tuft-${i}-actDisplay`] ? styles['mixx-error'] : ''}`}
                                        placeholder="0.00"
                                        value={tuft.actDisplay}
                                        onChange={e => handleTuftFieldChange(i, 'actDisplay', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className={styles['mixxx-row']}>
                                <div className={styles['mixx-group']}>
                                    <label>Diff (Display Wt. - Actual Wt.)</label>
                                    <input
                                        className={styles['mixx-input']}
                                        value={tuft.diff}
                                        disabled
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className={styles['mixx-group']}>
                                    <label>Ratio (Average Wt. / Total) * 100</label>
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

