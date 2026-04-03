import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { submitBrWaste, clearMixingState } from '@/store/slices/mixing';
import styles from '@/styles/brWasteStudyEntry.module.css';

const TYPE_3_COLUMNS = [
    { key: 'flatStrip',  label: 'Flat Strip %'  },
    { key: 'underGrid',  label: 'Under Grid %'  },
    { key: 'moteKnife',  label: 'Mote Knife %'  },
    { key: 'cylinder',   label: 'Cylinder %'    },
    { key: 'doffer',     label: 'Doffer %'      },
    { key: 'bowingFlat', label: 'Bowing Flat %' },
    { key: 'filter',     label: 'Filter %'      },
    { key: 'overallBL',  label: 'Overall BL %'  },
    { key: 'cardWaste',  label: 'Card Waste %'  },
];

const emptyType3Row = () =>
    TYPE_3_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: '' }), {});

const emptyWasteRow = () => ({ production: '', totalWaste: '', wastePercent: '' });

const initialForm = { brWasteId: '', variety: '', cardingProduction: '', studyType: '' };

const BrWasteStudyEntry = forwardRef(function BrWasteStudyEntry({ date, lotNo }, ref) {
    const dispatch = useDispatch();
    const { actionSuccess } = useSelector(state => state.mixing);
    const [formData, setFormData] = useState(initialForm);

    const [wasteCountInput, setWasteCountInput] = useState('1');
    const [type3CountInput, setType3CountInput] = useState('3');

    const [wasteRows, setWasteRows] = useState([emptyWasteRow()]);
    const [type3Rows, setType3Rows] = useState(Array.from({ length: 3 }, emptyType3Row));

    const [overallWaste, setOverallWaste] = useState('');
    const [remarks, setRemarks] = useState('');

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleWasteRowChange = (index, field, value) => {
        setWasteRows(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const handleType3RowChange = (index, field, value) => {
        setType3Rows(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const applyWasteCount = () => {
        const n = Math.max(1, parseInt(wasteCountInput) || 1);
        setWasteRows(prev => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyWasteRow());
            return arr.slice(0, n);
        });
    };

    const applyType3Count = () => {
        const n = Math.max(1, parseInt(type3CountInput) || 1);
        setType3Rows(prev => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyType3Row());
            return arr.slice(0, n);
        });
    };

    useEffect(() => {
        if (actionSuccess) {
            setFormData(initialForm);
            setWasteRows([emptyWasteRow()]);
            setType3Rows(Array.from({ length: 3 }, emptyType3Row));
            setOverallWaste('');
            setRemarks('');
            dispatch(clearMixingState());
        }
    }, [actionSuccess, dispatch]);

    const handleSubmit = () => {
        const entries = studyType === 'Type 3'
            ? type3Rows
            : wasteRows;
        dispatch(submitBrWaste({
            inspection_date:    date,
            br_waste_id:        formData.brWasteId,
            lot_no:             lotNo,
            variety:            formData.variety,
            carding_production: Number(formData.cardingProduction) || 0,
            study_type:         formData.studyType,
            overall_waste:      Number(overallWaste) || 0,
            remarks,
            entries,
        }));
    };

    const handleClear = () => {
        setFormData(initialForm);
        setWasteRows([emptyWasteRow()]);
        setType3Rows(Array.from({ length: 3 }, emptyType3Row));
        setOverallWaste('');
        setRemarks('');
        dispatch(clearMixingState());
    };

    useImperativeHandle(ref, () => ({ submit: handleSubmit, clear: handleClear }));

    const { studyType } = formData;

    return (
        <>
            {/* Row 1: BR Waste ID, Entry Date, Variety */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>BR Waste ID</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter BR Waste ID"
                        value={formData.brWasteId}
                        onChange={e => handleChange('brWasteId', e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Entry Date</label>
                    <input
                        type="date"
                        className={styles['mixx-input']}
                        value={date}
                        disabled
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Variety</label>
                    <select
                        className={styles['mixx-input']}
                        value={formData.variety}
                        onChange={e => handleChange('variety', e.target.value)}
                    >
                        <option value="">Select Variety</option>
                        <option>Bunny</option>
                        <option>MCU5</option>
                    </select>
                </div>
            </div>

            {/* Row 2: Carding Production, Study Type */}
            <div className={styles['mixx-row']}>
                <CustomInput
                    label="Carding Production (KGs)"
                    placeholder="0.00"
                    value={formData.cardingProduction}
                    onChange={value => handleChange('cardingProduction', value)}
                />

                <div className={styles['mixx-group']}>
                    <label>Study Type</label>
                    <select
                        className={styles['mixx-input']}
                        value={formData.studyType}
                        onChange={e => handleChange('studyType', e.target.value)}
                    >
                        <option value="">Select Study Type</option>
                        <option value="Type 1">Type 1</option>
                        <option value="Type 2">Type 2</option>
                        <option value="Type 3">Type 3</option>
                    </select>
                </div>

                <div className={styles['mixx-empty']} />
            </div>

            {/* ===== TYPE 1 ===== */}
            {studyType === 'Type 1' && (
                <>
                    {/* Apply row */}
                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Number of Entries</label>
                            <input
                                type="number"
                                className={styles['mixx-input']}
                                value={wasteCountInput}
                                min={1}
                                onChange={e => setWasteCountInput(e.target.value)}
                                onWheel={e => e.target.blur()}
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={applyWasteCount}>
                                Apply
                            </button>
                        </div>
                    </div>

                    {wasteRows.map((row, i) => (
                        <div className={styles['mixx-row']} key={i}>
                            <div className={styles['mixx-group']}>
                                <label>Flat Strip Waste %</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.production}
                                    onChange={e => handleWasteRowChange(i, 'production', e.target.value)}
                                />
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Under Grid Waste %</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.totalWaste}
                                    onChange={e => handleWasteRowChange(i, 'totalWaste', e.target.value)}
                                />
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Mote Knife Waste %</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.wastePercent}
                                    onChange={e => handleWasteRowChange(i, 'wastePercent', e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                </>
            )}

            {/* ===== TYPE 2 ===== */}
            {studyType === 'Type 2' && (
                <>
                    {/* Apply row */}
                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Number of Entries</label>
                            <input
                                type="number"
                                className={styles['mixx-input']}
                                value={wasteCountInput}
                                min={1}
                                onChange={e => setWasteCountInput(e.target.value)}
                                onWheel={e => e.target.blur()}
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={applyWasteCount}>
                                Apply
                            </button>
                        </div>
                    </div>

                    {wasteRows.map((row, i) => (
                        <div className={styles['mixx-row']} key={i}>
                            <div className={styles['mixx-group']}>
                                <label>Production (Kg)</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.production}
                                    onChange={e => handleWasteRowChange(i, 'production', e.target.value)}
                                />
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Total Waste (Kg)</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.totalWaste}
                                    onChange={e => handleWasteRowChange(i, 'totalWaste', e.target.value)}
                                />
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Waste %</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.wastePercent}
                                    onChange={e => handleWasteRowChange(i, 'wastePercent', e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                </>
            )}

            {/* ===== TYPE 3 ===== */}
            {studyType === 'Type 3' && (
                <>
                    {/* Apply row */}
                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Number of Entries</label>
                            <input
                                type="number"
                                className={styles['mixx-input']}
                                value={type3CountInput}
                                min={1}
                                onChange={e => setType3CountInput(e.target.value)}
                                onWheel={e => e.target.blur()}
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={applyType3Count}>
                                Apply
                            </button>
                        </div>
                    </div>

                    {/* Desktop table */}
                    <div className={`${styles['type3-table']} ${styles['desktop-view']}`}>
                        <div className={styles['type3-header']}>
                            <span>#</span>
                            {TYPE_3_COLUMNS.map(col => (
                                <span key={col.key}>{col.label}</span>
                            ))}
                        </div>
                        {type3Rows.map((row, i) => (
                            <div className={styles['type3-row']} key={i}>
                                <span className={styles['type3-number']}>{i + 1}</span>
                                {TYPE_3_COLUMNS.map(col => (
                                    <input
                                        key={col.key}
                                        className={styles['mixx-input']}
                                        placeholder="0.00"
                                        value={row[col.key]}
                                        onChange={e => handleType3RowChange(i, col.key, e.target.value)}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Mobile cards */}
                    <div className={styles['type3-mobile']}>
                        {type3Rows.map((row, i) => (
                            <div className={styles['type3-entry']} key={i}>
                                <div className={styles['type3-number']}>Entry {i + 1}</div>
                                <div className={styles['type3-card']}>
                                    <div className={styles['type3-grid']}>
                                        {TYPE_3_COLUMNS.map(col => (
                                            <div className={styles['mixx-group']} key={col.key}>
                                                <label>{col.label}</label>
                                                <input
                                                    className={styles['mixx-input']}
                                                    placeholder="0.00"
                                                    value={row[col.key]}
                                                    onChange={e => handleType3RowChange(i, col.key, e.target.value)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Bottom: Overall Waste %, Remarks */}
            {studyType && (
                <div className={styles['mixx-row']}>
                    <CustomInput
                        label="Overall Waste %"
                        placeholder="0.00"
                        value={overallWaste}
                        onChange={setOverallWaste}
                    />
                    <CustomInput
                        label="Remarks"
                        placeholder="Enter Remarks"
                        value={remarks}
                        onChange={setRemarks}
                    />
                    <div className={styles['mixx-empty']} />
                </div>
            )}

        </>
    );
});

export default BrWasteStudyEntry;
