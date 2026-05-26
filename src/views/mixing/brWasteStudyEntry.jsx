import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import { saveBlowroomBrWaste, resetState } from '@/store/slices/blowroomSlice';
import { sanitizeIntegerInput, sanitizeNumericInput } from '@/utils/inputValidation';
import styles from '@/styles/brWasteStudyEntry.module.css';

const TYPE_3_COLUMNS = [
    { key: 'flatSpeed', label: 'Flat Speed' },
    { key: 'deliverySpeed', label: 'Delivery Speed' },
    { key: 'wingSettling1', label: 'Wing Settling 1' },
    { key: 'wingSettling2', label: 'Wing Settling 2' },
    { key: 'firstLickerinSpeed', label: '1st Lickerin Speed' },
    { key: 'secondLickerinSpeed', label: '2nd Lickerin Speed' },
    { key: 'thirdLickerinSpeed', label: '3rd Lickerin Speed' },
    { key: 'mcNo', label: 'MC No' },
    { key: 'mcProduction', label: 'MC Production' },
];
const TYPE_2_COLUMNS = [
    { key: "cylinderSpeed", label: "Cylinder Speed" },
    { key: "flatSpeed", label: "Flat Speed" },
    { key: "deliverySpeed", label: "Delivery Speed" },
    { key: "wingSetting", label: "Wing Setting" },
    { key: "lickerinSpeed", label: "Lickerin Speed" },
    { key: "mcNo", label: "MC No" },
    { key: "mcProduction", label: "MC Production" },
];
const TYPE_1_COLUMNS = [
    { key: "cylinderSpeed", label: "Cylinder Speed" },
    { key: "lickerinSpeed", label: "Lickerin Speed" },
    { key: "flatSpeed", label: "Flat Speed" },
    { key: "dofferSpeed", label: "Doffer Speed" },
    { key: "mcNo", label: "MC No" },
    { key: "mcProduction", label: "MC Production" },
];
const WASTE_TYPE_OPTIONS = [
    "Flat Strip",
    "Under Grid",
    "Mote Knife",
    "Cylinder",
    "Doffer",
];

const emptyType3Row = () =>
    TYPE_3_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: '' }), {});
const emptyType2Row = () =>
    TYPE_2_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: "" }), {});
const emptyType1Row = () =>
    TYPE_1_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: "" }), {});
const emptyWasteKgRow = () => ({ wasteType: '', wasteKgValue: '', wasteKgPercent: '' });

const initialForm = { brWasteId: '', variety: '', cardingProduction: '', studyType: '' };
const FORM_NUMERIC_FIELDS = new Set(['cardingProduction']);
const TYPE_1_MAX_ENTRIES = 10;
const TYPE_3_MAX_ENTRIES = 10;
const WASTE_KG_MAX_TYPES = 5;

const buildBrWastePayloads = ({ date, lotNo, formData, type1Rows, type2Rows, type3Rows, wasteKgRows, overallWaste, remarks }) => {
    const totalWasteKg = wasteKgRows.reduce(
        (sum, row) => sum + (Number(row.wasteKgValue) || 0),
        0
    );
    const typeEntries = formData.studyType === "Type 3"
        ? type3Rows.length
        : formData.studyType === "Type 2"
            ? type2Rows.length
            : type1Rows.length;
    const basePayload = {
        waste_study_id: formData.brWasteId,
        date,
        variety: formData.variety,
        study_type: formData.studyType,
        carding_production_kg: Number(formData.cardingProduction) || 0,
        type_entries: typeEntries,
        overall_percent: Number(overallWaste) || 0,
        remarks,
        mc_no: lotNo || "",
        mc_production: 0,
        waste_type: formData.studyType,
        waste_kg: totalWasteKg,
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
        return type1Rows.map((row, index) => ({
            ...basePayload,
            mc_no: String(row.mcNo || lotNo || `MC-${index + 1}`),
            mc_production: Number(row.mcProduction) || 0,
            waste_type: `Type 1 Entry ${index + 1}`,
            flat_speed: Number(row.flatSpeed) || 0,
            lickerin_speed_1: Number(row.lickerinSpeed) || 0,
            wing2_speed: Number(row.cylinderSpeed) || 0,
            lickerin_speed_2: Number(row.dofferSpeed) || 0,
            waste_percent: Number(overallWaste) || 0,
        }));
    }

    if (formData.studyType === "Type 2") {
        return type2Rows.map((row, index) => ({
            ...basePayload,
            mc_no: String(row.mcNo || lotNo || `MC-${index + 1}`),
            mc_production: Number(row.mcProduction) || 0,
            waste_type: `Type 2 Entry ${index + 1}`,
            flat_speed: Number(row.flatSpeed) || 0,
            delivery_speed: Number(row.deliverySpeed) || 0,
            wing1_speed: Number(row.wingSetting) || 0,
            wing2_speed: Number(row.cylinderSpeed) || 0,
            lickerin_speed_1: Number(row.lickerinSpeed) || 0,
            waste_percent: Number(overallWaste) || 0,
        }));
    }

    return type3Rows.map((row, index) => ({
        ...basePayload,
        mc_no: String(row.mcNo || lotNo || ""),
        mc_production: Number(row.mcProduction) || 0,
        waste_type: `Type 3 Entry ${index + 1}`,
        flat_speed: Number(row.flatSpeed) || 0,
        delivery_speed: Number(row.deliverySpeed) || 0,
        wing1_speed: Number(row.wingSettling1) || 0,
        wing2_speed: Number(row.wingSettling2) || 0,
        lickerin_speed_1: Number(row.firstLickerinSpeed) || 0,
        lickerin_speed_2: Number(row.secondLickerinSpeed) || 0,
        lickerin_speed_3: Number(row.thirdLickerinSpeed) || 0,
        waste_percent: Number(overallWaste) || 0,
    }));
};

const BrWasteStudyEntry = forwardRef(function BrWasteStudyEntry({ date, lotNo }, ref) {
    const dispatch = useDispatch();
    const { success } = useSelector(state => state.blowroom ?? {});
    const [formData, setFormData] = useState(initialForm);
    const [errors, setErrors] = useState({});

    const [type1CountInput, setType1CountInput] = useState('1');
    const [type2CountInput, setType2CountInput] = useState("1");
    const [type3CountInput, setType3CountInput] = useState('3');
    const [wasteKgCountInput, setWasteKgCountInput] = useState('1');

    const [type1Rows, setType1Rows] = useState([emptyType1Row()]);
    const [type2Rows, setType2Rows] = useState([emptyType2Row()]);
    const [type3Rows, setType3Rows] = useState(Array.from({ length: 3 }, emptyType3Row));
    const [wasteKgRows, setWasteKgRows] = useState([emptyWasteKgRow()]);

    const [overallWaste, setOverallWaste] = useState('');
    const [remarks, setRemarks] = useState('');

    const calculateWastePercent = (wasteKgValue, production) => {
        const waste = Number(wasteKgValue) || 0;
        const prod = Number(production) || 0;
        if (prod <= 0 || waste <= 0) return '';
        return ((waste / prod) * 100).toFixed(2);
    };

    const handleChange = (field, value) => {
        const nextValue = FORM_NUMERIC_FIELDS.has(field)
            ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
            : value;
        setFormData(prev => {
            const updated = { ...prev, [field]: nextValue };
            if (field === "cardingProduction") {
                setWasteKgRows((prevRows) =>
                    prevRows.map((row) => ({
                        ...row,
                        wasteKgPercent: calculateWastePercent(row.wasteKgValue, nextValue),
                    }))
                );
            }
            return updated;
        });
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    const handleType1RowChange = (index, field, value) => {
        const nextValue = field === "mcNo"
            ? value
            : sanitizeNumericInput(value, { precision: 10, scale: 2 });
        setErrors((prev) => {
            const key = `t1-${index}-${field}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setType1Rows((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: nextValue };
            return updated;
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
        const nextValue = field === "mcNo"
            ? value
            : sanitizeNumericInput(value, { precision: 10, scale: 2 });
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

    const handleType2RowChange = (index, field, value) => {
        const nextValue = field === "mcNo"
            ? value
            : sanitizeNumericInput(value, { precision: 10, scale: 2 });
        setErrors((prev) => {
            const key = `t2-${index}-${field}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setType2Rows((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: nextValue };
            return updated;
        });
    };

    const applyType1Count = () => {
        const n = Math.min(TYPE_1_MAX_ENTRIES, Math.max(1, parseInt(type1CountInput) || 1));
        setType1Rows(prev => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyType1Row());
            return arr.slice(0, n);
        });
    };

    const applyType3Count = () => {
        const n = Math.min(TYPE_3_MAX_ENTRIES, Math.max(1, parseInt(type3CountInput) || 1));
        setType3Rows(prev => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyType3Row());
            return arr.slice(0, n);
        });
    };

    const applyType2Count = () => {
        const n = Math.max(1, parseInt(type2CountInput) || 1);
        setType2Rows((prev) => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyType2Row());
            return arr.slice(0, n);
        });
    };

    const handleWasteKgRowChange = (index, field, value) => {
        const nextValue =
            field === "wasteType"
                ? value
                : sanitizeNumericInput(value, { precision: 10, scale: 2 });
        setWasteKgRows((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: nextValue };
            if (field === "wasteKgValue") {
                updated[index].wasteKgPercent = calculateWastePercent(
                    nextValue,
                    formData.cardingProduction
                );
            }
            return updated;
        });
    };

    const applyWasteKgCount = () => {
        const n = Math.min(WASTE_KG_MAX_TYPES, Math.max(1, parseInt(wasteKgCountInput) || 1));
        setWasteKgRows((prev) => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyWasteKgRow());
            return arr.slice(0, n);
        });
    };

    const calculateOverallWaste = () => {
        let total = 0;
        setWasteKgRows((prev) =>
            prev.map((row) => {
                const percent = calculateWastePercent(row.wasteKgValue, formData.cardingProduction);
                total += Number(percent) || 0;
                return { ...row, wasteKgPercent: percent };
            })
        );
        setOverallWaste(total > 0 ? total.toFixed(2) : "0.00");
    };

    useEffect(() => {
        if (success) {
            setFormData(initialForm);
            setType1Rows([emptyType1Row()]);
            setType2Rows([emptyType2Row()]);
            setType3Rows(Array.from({ length: 3 }, emptyType3Row));
            setWasteKgRows([emptyWasteKgRow()]);
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
            type1Rows,
            type2Rows,
            type3Rows,
            wasteKgRows,
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
        setType1Rows([emptyType1Row()]);
        setType2Rows([emptyType2Row()]);
        setType3Rows(Array.from({ length: 3 }, emptyType3Row));
        setWasteKgRows([emptyWasteKgRow()]);
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
        if (studyType === "Type 1") {
            type1Rows.forEach((row, idx)=>{
                TYPE_1_COLUMNS.forEach((col) => {
                    if (String(row[col.key]||"").trim()==="") nextErrors[`t1-${idx}-${col.key}`]=true;
                });
            });
        }
        if (studyType === "Type 2") {
            type2Rows.forEach((row, idx) => {
                TYPE_2_COLUMNS.forEach((col) => {
                    if (String(row[col.key] || "").trim() === "") nextErrors[`t2-${idx}-${col.key}`] = true;
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
        const rowsForPreview = studyType === "Type 3"
            ? type3Rows
            : studyType === "Type 2"
                ? type2Rows
                : type1Rows;
        const entries = rowsForPreview.map((row, idx)=>({
            label: `Entry ${idx+1}`,
            value: studyType === "Type 3"
                ? TYPE_3_COLUMNS.map(col=>`${col.label}:${row[col.key]}`).join(" | ")
                : studyType === "Type 2"
                    ? TYPE_2_COLUMNS.map(col=>`${col.label}:${row[col.key]}`).join(" | ")
                : TYPE_1_COLUMNS.map(col=>`${col.label}:${row[col.key]}`).join(" | ")
        }));
        const wasteKgEntries = wasteKgRows.map((row, idx) => ({
            label: `Waste KGs ${idx + 1}`,
            value: `Type:${row.wasteType} | Waste KG:${row.wasteKgValue} | Waste %:${row.wasteKgPercent}`,
        }));
        return [...header, ...entries, ...wasteKgEntries];
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
                    <div className={styles['section-title']}>Type 1 Study Details</div>
                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Number of Type 1 Entries (Max {TYPE_1_MAX_ENTRIES})</label>
                            <input
                                type="number"
                                className={styles['mixx-input']}
                                value={type1CountInput}
                                min={1}
                                onChange={e => setType1CountInput(sanitizeIntegerInput(e.target.value, 2))}
                                onWheel={e => e.target.blur()}
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={applyType1Count}>
                                Apply Type 1 Entries
                            </button>
                        </div>
                    </div>

                    <div className={`${styles['type1-table']} ${styles['desktop-view']}`}>
                        <div className={styles['type1-header']}>
                            <span>#</span>
                            {TYPE_1_COLUMNS.map((col) => (
                                <span key={col.key}>{col.label}</span>
                            ))}
                        </div>
                        {type1Rows.map((row, i) => (
                            <div className={styles['type1-row']} key={i}>
                                <span className={styles['type3-number']}>{i + 1}</span>
                                {TYPE_1_COLUMNS.map((col) => (
                                    <input
                                        key={col.key}
                                        className={`${styles['mixx-input']} ${errors[`t1-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                        placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
                                        value={row[col.key]}
                                        onChange={e => handleType1RowChange(i, col.key, e.target.value)}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className={styles['type1-mobile']}>
                        {type1Rows.map((row, i) => (
                            <div className={styles['type3-entry']} key={i}>
                                <div className={styles['type3-number']}>Entry {i + 1}</div>
                                <div className={styles['type3-card']}>
                                    <div className={styles['type3-grid']}>
                                        {TYPE_1_COLUMNS.map((col) => (
                                            <div className={styles['mixx-group']} key={col.key}>
                                                <label>{col.label}</label>
                                                <input
                                                    className={`${styles['mixx-input']} ${errors[`t1-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                                    placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
                                                    value={row[col.key]}
                                                    onChange={e => handleType1RowChange(i, col.key, e.target.value)}
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

            {/* ===== TYPE 2 ===== */}
            {studyType === 'Type 2' && (
                <>
                    <div className={styles['section-title']}>Type 2 Study Details</div>
                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Number of Type 2 Entries</label>
                            <input
                                type="number"
                                className={styles['mixx-input']}
                                value={type2CountInput}
                                min={1}
                                onChange={e => setType2CountInput(sanitizeIntegerInput(e.target.value, 4))}
                                onWheel={e => e.target.blur()}
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={applyType2Count}>
                                Apply Type 2 Entries
                            </button>
                        </div>
                    </div>

                    <div className={`${styles['type2-table']} ${styles['desktop-view']}`}>
                        <div className={styles['type2-header']}>
                            <span>#</span>
                            {TYPE_2_COLUMNS.map((col) => (
                                <span key={col.key}>{col.label}</span>
                            ))}
                        </div>
                        {type2Rows.map((row, i) => (
                            <div className={styles['type2-row']} key={i}>
                                <span className={styles['type3-number']}>{i + 1}</span>
                                {TYPE_2_COLUMNS.map((col) => (
                                    <input
                                        key={col.key}
                                        className={`${styles['mixx-input']} ${errors[`t2-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                        placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
                                        value={row[col.key]}
                                        onChange={(e) => handleType2RowChange(i, col.key, e.target.value)}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className={styles['type2-mobile']}>
                        {type2Rows.map((row, i) => (
                            <div className={styles['type3-entry']} key={i}>
                                <div className={styles['type3-number']}>Entry {i + 1}</div>
                                <div className={styles['type3-card']}>
                                    <div className={styles['type3-grid']}>
                                        {TYPE_2_COLUMNS.map((col) => (
                                            <div className={styles['mixx-group']} key={col.key}>
                                                <label>{col.label}</label>
                                                <input
                                                    className={`${styles['mixx-input']} ${errors[`t2-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                                    placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
                                                    value={row[col.key]}
                                                    onChange={(e) => handleType2RowChange(i, col.key, e.target.value)}
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

            {/* ===== TYPE 3 ===== */}
            {studyType === 'Type 3' && (
                <>
                    <div className={styles['section-title']}>Type 3 Study Details</div>
                    {/* Apply row */}
                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Number of Type 3 Entries (Max {TYPE_3_MAX_ENTRIES})</label>
                            <input
                                type="number"
                                className={styles['mixx-input']}
                                value={type3CountInput}
                                min={1}
                                onChange={e => setType3CountInput(sanitizeIntegerInput(e.target.value, 2))}
                                onWheel={e => e.target.blur()}
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={applyType3Count}>
                                Apply Type 3 Entries
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
                                        placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
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

            {/* Waste KGs Calculation */}
            {studyType && (
                <>
                    <div className={styles['section-title']}>Waste KGs Calculation</div>
                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Number of Waste Types (Max {WASTE_KG_MAX_TYPES})</label>
                            <input
                                type="number"
                                className={styles['mixx-input']}
                                min={1}
                                value={wasteKgCountInput}
                                onChange={(e) => setWasteKgCountInput(sanitizeIntegerInput(e.target.value, 2))}
                                onWheel={(e) => e.target.blur()}
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={applyWasteKgCount}>
                                Apply Waste KGs
                            </button>
                        </div>
                    </div>

                    {wasteKgRows.map((row, i) => (
                        <div className={styles['mixx-row']} key={`waste-kg-${i}`}>
                            <div className={styles['mixx-group']}>
                                <label>Waste Type</label>
                                <select
                                    className={styles['mixx-input']}
                                    value={row.wasteType}
                                    onChange={(e) => handleWasteKgRowChange(i, "wasteType", e.target.value)}
                                >
                                    <option value="">Select Waste Type</option>
                                    {WASTE_TYPE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Waste KGs Value</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.00"
                                    value={row.wasteKgValue}
                                    onChange={(e) => handleWasteKgRowChange(i, "wasteKgValue", e.target.value)}
                                />
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Waste KGs %</label>
                                <input
                                    className={styles['mixx-input']}
                                    value={row.wasteKgPercent ? `${row.wasteKgPercent} %` : "0.00 %"}
                                    readOnly
                                />
                            </div>
                        </div>
                    ))}

                    <div className={`${styles['mixx-row']} ${styles['waste-apply-row']}`}>
                        <div className={styles['mixx-group']}>
                            <label>Overall Waste %</label>
                            <input
                                className={styles['mixx-input']}
                                value={overallWaste || "0.00"}
                                readOnly
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <button className={styles['mixx-btn-primary']} onClick={calculateOverallWaste}>
                                Calculate Percentage
                            </button>
                        </div>
                    </div>

                    <div className={styles['mixx-row']}>
                        <div className={styles['mixx-group']}>
                            <label>Remarks</label>
                            <textarea
                                className={`${styles['mixx-input']} ${styles['mixx-textarea']}`}
                                placeholder="Type Remarks..."
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                            />
                        </div>
                        <div className={styles['mixx-empty']} />
                        <div className={styles['mixx-empty']} />
                    </div>
                </>
            )}

        </>
    );
});

export default BrWasteStudyEntry;
