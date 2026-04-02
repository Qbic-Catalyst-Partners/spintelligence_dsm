import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { submitDropTest, clearMixingState } from '@/store/slices/mixing';
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
const dropTestTypeOptions = ["Drop Test Data Entry"];

const DropTestDataEntry = forwardRef(function DropTestDataEntry(
    { date, lotNo, selectedTypeName, onTypeChange, onDateChange, onLotNoChange },
    ref
) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const [formData, setFormData] = useState(initialForm);
    const [numTufts, setNumTufts] = useState('');
    const [tufts, setTufts] = useState([]);
    const [expandedTuftIndex, setExpandedTuftIndex] = useState(0);

    useEffect(() => {
        if (actionSuccess) {
            setFormData(initialForm);
            setNumTufts('');
            setTufts([]);
            setExpandedTuftIndex(0);
            dispatch(clearMixingState());
        }
    }, [actionSuccess, dispatch]);

    const handleSubmit = () => {
        if (!tufts.length) return;
        dispatch(submitDropTest({
            baseData: { date, lotNo, variety: formData.variety, blend: formData.blend },
            tufts,
        }));
    };

    const handleClear = () => {
        setFormData(initialForm);
        setNumTufts('');
        setTufts([]);
        setExpandedTuftIndex(0);
        dispatch(clearMixingState());
    };

    useImperativeHandle(ref, () => ({ submit: handleSubmit, clear: handleClear }));

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleTuftCountChange = (value) => {
        if (!/^\d*$/.test(value)) return;
        let n = Math.min(Number(value), 20);
        setNumTufts(value);
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
        updated[index][field] = value;

        const actDisplay = Number(updated[index].actDisplay) || 0;
        const displayWt  = Number(updated[index].displayWt)  || 0;
        const actWt      = Number(updated[index].actWt)      || 0;

        updated[index].diff  = displayWt - actDisplay;
        updated[index].ratio = displayWt ? (actWt / displayWt).toFixed(2) : '';

        setTufts(updated);
    };

    return (
        <>
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Type</label>
                    <select
                        className={styles['mixx-input']}
                        value={selectedTypeName || "Drop Test Data Entry"}
                        onChange={e => onTypeChange?.(e.target.value)}
                    >
                        {dropTestTypeOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </div>

                <div className={styles['mixx-group']}>
                    <label>Drop ID</label>
                    <input
                        className={styles['mixx-input']}
                        value={lotNo}
                        placeholder="Auto Generated"
                        onChange={e => onLotNoChange?.(e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Date</label>
                    <input
                        type="date"
                        className={styles['mixx-input']}
                        value={date}
                        onChange={e => onDateChange?.(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Variety</label>
                    <select
                        className={styles['mixx-input']}
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
                        className={styles['mixx-input']}
                        placeholder="0/40"
                        value={formData.blend}
                        onChange={e => handleChange('blend', e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Number of Tufts (N)</label>
                    <input
                        type="number"
                        className={styles['mixx-input']}
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
                                        className={styles['mixx-input']}
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
                                        className={styles['mixx-input']}
                                        placeholder="0.00"
                                        value={tuft.actDisplay}
                                        onChange={e => handleTuftFieldChange(i, 'actDisplay', e.target.value)}
                                    />
                                </div>

                                <div className={styles['mixx-group']}>
                                    <label>Display Wt.</label>
                                    <input
                                        className={styles['mixx-input']}
                                        placeholder="0.00"
                                        value={tuft.displayWt}
                                        onChange={e => handleTuftFieldChange(i, 'displayWt', e.target.value)}
                                    />
                                </div>

                                <div className={styles['mixx-group']}>
                                    <label>Act Wt.</label>
                                    <input
                                        className={styles['mixx-input']}
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
