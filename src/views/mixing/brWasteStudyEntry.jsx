import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { saveBlowroomBrWaste, resetState } from '@/store/slices/blowroomSlice';
import { sanitizeIntegerInput, sanitizeNumericInput } from '@/utils/inputValidation';
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
const FORM_NUMERIC_FIELDS = new Set(['cardingProduction']);

const buildBrWastePayloads = ({ date, lotNo, formData, wasteRows, type3Rows, overallWaste, remarks }) => {
    const basePayload = {
        waste_study_id: formData.brWasteId,
        date,
        variety: formData.variety,
        study_type: formData.studyType,
        carding_production_kg: Number(formData.cardingProduction) || 0,
        type_entries: formData.studyType === "Type 3" ? type3Rows.length : wasteRows.length,
        overall_percent: Number(overallWaste) || 0,
        remarks,
        mc_no: lotNo || "",
        mc_production: 0,
        waste_type: formData.studyType,
        waste_kg: 0,
        waste_percent: 0,
        flat_speed: 0,
        delivery_speed: 0,
        wing1_speed: 0,
        wing2_speed: 0,
        lickerin_speed_1: 0,
        lickerin_speed_2: 0,
        lickerin_speed_3: 0,
    };

    if (formData.studyType === "Type 1") {
        return wasteRows.map((row, index) => ({
            ...basePayload,
            waste_type: `Type 1 Entry ${index + 1}`,
            flat_speed: Number(row.production) || 0,
            delivery_speed: Number(row.totalWaste) || 0,
            wing1_speed: Number(row.wastePercent) || 0,
            waste_percent: Number(row.wastePercent) || 0,
        }));
    }

    if (formData.studyType === "Type 2") {
        return wasteRows.map((row, index) => ({
            ...basePayload,
            mc_no: lotNo || `MC-${index + 1}`,
            mc_production: Number(row.production) || 0,
            waste_type: `Type 2 Entry ${index + 1}`,
            waste_kg: Number(row.totalWaste) || 0,
            waste_percent: Number(row.wastePercent) || 0,
        }));
    }

    return type3Rows.map((row, index) => ({
        ...basePayload,
        waste_type: `Type 3 Entry ${index + 1}`,
        flat_speed: Number(row.flatStrip) || 0,
        delivery_speed: Number(row.underGrid) || 0,
        wing1_speed: Number(row.moteKnife) || 0,
        wing2_speed: Number(row.cylinder) || 0,
        lickerin_speed_1: Number(row.doffer) || 0,
        lickerin_speed_2: Number(row.bowingFlat) || 0,
        lickerin_speed_3: Number(row.filter) || 0,
        waste_percent: Number(row.cardWaste) || 0,
    }));
};

const BrWasteStudyEntry = forwardRef(function BrWasteStudyEntry({ date, lotNo }, ref) {
    const dispatch = useDispatch();
    const { success } = useSelector(state => state.blowroom ?? {});
    const [formData, setFormData] = useState(initialForm);
    const [errors, setErrors] = useState({});

    const [wasteCountInput, setWasteCountInput] = useState('1');
    const [type3CountInput, setType3CountInput] = useState('3');

    const [wasteRows, setWasteRows] = useState([emptyWasteRow()]);
    const [type3Rows, setType3Rows] = useState(Array.from({ length: 3 }, emptyType3Row));

    const [overallWaste, setOverallWaste] = useState('');
    const [remarks, setRemarks] = useState('');

    const handleChange = (field, value) => {
        const nextValue = FORM_NUMERIC_FIELDS.has(field)
            ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
            : value;
        setFormData(prev => ({ ...prev, [field]: nextValue }));
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    const handleWasteRowChange = (index, field, value) => {
        const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 2 });
        setErrors((prev) => {
            const key = `waste-${index}-${field}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setWasteRows(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: nextValue };
            return updated;
        });
    };

    const handleType3RowChange = (index, field, value) => {
        const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 2 });
        setErrors((prev) => {
            const key = `t3-${index}-${field}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setType3Rows(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: nextValue };
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
        if (success) {
            setFormData(initialForm);
            setWasteRows([emptyWasteRow()]);
            setType3Rows(Array.from({ length: 3 }, emptyType3Row));
            setOverallWaste('');
            setRemarks('');
        }
    }, [success, dispatch]);

    const handleSubmit = async () => {
        if (!validate()) return;
        const payloads = buildBrWastePayloads({
            date,
            lotNo,
            formData,
            wasteRows,
            type3Rows,
            overallWaste,
            remarks,
        });

        try {
            for (const payload of payloads) {
                await dispatch(saveBlowroomBrWaste(payload)).unwrap();
            }
        } catch (error) {
            throw error;
        }
    };

    const handleClear = () => {
        setFormData(initialForm);
        setWasteRows([emptyWasteRow()]);
        setType3Rows(Array.from({ length: 3 }, emptyType3Row));
        setOverallWaste('');
        setRemarks('');
        dispatch(resetState());
        setErrors({});
    };

    const validate = () => {
        const nextErrors = {};
        ["brWasteId","variety","cardingProduction","studyType"].forEach((key)=>{
            if (String(formData[key] || "").trim() === "") nextErrors[key]=true;
        });
        if (studyType === "Type 1" || studyType === "Type 2") {
            wasteRows.forEach((row, idx)=>{
                ["production","totalWaste","wastePercent"].forEach(k=>{
                    if (String(row[k]||"").trim()==="") nextErrors[`waste-${idx}-${k}`]=true;
                });
            });
        }
        if (studyType === "Type 3") {
            type3Rows.forEach((row, idx)=>{
                TYPE_3_COLUMNS.forEach(col=>{
                    if (String(row[col.key]||"").trim()==="") nextErrors[`t3-${idx}-${col.key}`]=true;
                });
            });
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length===0;
    };

    const getPreviewData = () => {
        const header = [
            { label: "Date", value: date },
            { label: "BR Waste ID", value: formData.brWasteId },
            { label: "Lot No", value: lotNo },
            { label: "Variety", value: formData.variety },
            { label: "Carding Production (KGs)", value: formData.cardingProduction },
            { label: "Study Type", value: formData.studyType },
            { label: "Overall Waste %", value: overallWaste },
            { label: "Remarks", value: remarks },
        ];
        const entries = (studyType === "Type 3" ? type3Rows : wasteRows).map((row, idx)=>({
            label: `Entry ${idx+1}`,
            value: studyType === "Type 3"
                ? TYPE_3_COLUMNS.map(col=>`${col.label}:${row[col.key]}`).join(" | ")
                : `Flat:${row.production} | Under:${row.totalWaste} | Mote:${row.wastePercent}`
        }));
        return [...header, ...entries];
    };

    useImperativeHandle(ref, () => ({
        submit: handleSubmit,
        clear: handleClear,
        validate,
        getPreviewData,
    }));

    const { studyType } = formData;

    return (
        <>
            {/* Row 1: BR Waste ID, Entry Date, Variety */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>BR Waste ID</label>
                    <input
                        className={`${styles['mixx-input']} ${errors.brWasteId ? styles['mixx-error'] : ''}`}
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
                        className={`${styles['mixx-input']} ${errors.variety ? styles['mixx-error'] : ''}`}
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
                    error={errors.cardingProduction}
                />

                <div className={styles['mixx-group']}>
                    <label>Study Type</label>
                    <select
                        className={`${styles['mixx-input']} ${errors.studyType ? styles['mixx-error'] : ''}`}
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
                                onChange={e => setWasteCountInput(sanitizeIntegerInput(e.target.value, 4))}
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
                                    style={errors[`waste-${i}-production`] ? { borderColor: '#ef4444', background: '#fff1f2' } : undefined}
                                />
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Under Grid Waste %</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.totalWaste}
                                    onChange={e => handleWasteRowChange(i, 'totalWaste', e.target.value)}
                                    style={errors[`waste-${i}-totalWaste`] ? { borderColor: '#ef4444', background: '#fff1f2' } : undefined}
                                />
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Mote Knife Waste %</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.wastePercent}
                                    onChange={e => handleWasteRowChange(i, 'wastePercent', e.target.value)}
                                    style={errors[`waste-${i}-wastePercent`] ? { borderColor: '#ef4444', background: '#fff1f2' } : undefined}
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
                                onChange={e => setWasteCountInput(sanitizeIntegerInput(e.target.value, 4))}
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
                                onChange={e => setType3CountInput(sanitizeIntegerInput(e.target.value, 4))}
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
                                        className={`${styles['mixx-input']} ${errors[`t3-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
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
                        onChange={(value) => setOverallWaste(sanitizeNumericInput(value, { precision: 6, scale: 2 }))}
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
