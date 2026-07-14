import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CustomInput from '@/components/CustomInput';
import SearchableSelect from '@/components/SearchableSelect';
import useBlowroomMasterVarieties from '@/hooks/useBlowroomMasterVarieties';
import useBlowroomMasterWasteTypes from '@/hooks/useBlowroomMasterWasteTypes';
import { saveBlowroomBrWaste, resetState } from '@/store/slices/blowroomSlice';
import { saveBlowroomMasterWasteType } from '@/apis/blowroom';
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
const emptyType3Row = () =>
    TYPE_3_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: '' }), {});
const emptyType2Row = () =>
    TYPE_2_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: "" }), {});
const emptyType1Row = () =>
    TYPE_1_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: "" }), {});
const emptyWasteKgRow = () => ({ wasteType: '', wasteKgValue: '', wasteKgPercent: '' });

const initialForm = { variety: '', cardingProduction: '', studyType: '' };
const DEFAULT_BLOWROOM_STATE = { success: false };
const FORM_NUMERIC_FIELDS = new Set(['cardingProduction']);
const TYPE_3_MAX_ENTRIES = 10;
const WASTE_KG_MAX_TYPES = 25;

const getTotalWastePercent = (wasteKgRows) =>
    (Array.isArray(wasteKgRows) ? wasteKgRows : []).reduce(
        (sum, row) => sum + (Number(row.wasteKgPercent) || 0),
        0
    );

const formatWastePercent = (value) => (Number(value) > 0 ? Number(value).toFixed(2) : "0.00");
const formatCardingProduction = (rows) =>
    (Array.isArray(rows) ? rows : [])
        .reduce((sum, row) => sum + (Number(row?.mcProduction) || 0), 0)
        .toFixed(2);

const buildBrWastePayload = ({ date, entryId, lotNo, formData, type1Rows, type2Rows, type3Rows, wasteKgRows, overallWaste, remarks, entryTypeLabel = "BR Waste Study Entry" }) => {
    const selectedTypeRows = formData.studyType === "Type 3"
        ? type3Rows
        : formData.studyType === "Type 2"
            ? type2Rows
            : type1Rows;

    const totalWasteKg = wasteKgRows.reduce((sum, row) => sum + (Number(row.wasteKgValue) || 0), 0);
    const averageWastePercent = wasteKgRows.length
        ? wasteKgRows.reduce((sum, row) => sum + (Number(row.wasteKgPercent) || 0), 0) / wasteKgRows.length
        : 0;

    const type_rows = selectedTypeRows.map((row, index) => {
        if (formData.studyType === "Type 1") {
            return {
                row_no: index + 1,
                cylinder_speed: Number(row.cylinderSpeed) || null,
                lickerin_speed: Number(row.lickerinSpeed) || null,
                flat_speed: Number(row.flatSpeed) || null,
                doffer_speed: Number(row.dofferSpeed) || null,
                delivery_speed: null,
                wing_setting_1: null,
                wing_setting_2: null,
                mc_no: row.mcNo || null,
                mc_production: Number(row.mcProduction) || null,
            };
        }

        if (formData.studyType === "Type 2") {
            return {
                row_no: index + 1,
                cylinder_speed: Number(row.cylinderSpeed) || null,
                lickerin_speed: Number(row.lickerinSpeed) || null,
                flat_speed: Number(row.flatSpeed) || null,
                doffer_speed: null,
                delivery_speed: Number(row.deliverySpeed) || null,
                wing_setting_1: Number(row.wingSetting) || null,
                wing_setting_2: null,
                mc_no: row.mcNo || null,
                mc_production: Number(row.mcProduction) || null,
            };
        }

        return {
            row_no: index + 1,
            cylinder_speed: null,
            lickerin_speed: null,
            flat_speed: Number(row.flatSpeed) || null,
            doffer_speed: null,
            delivery_speed: Number(row.deliverySpeed) || null,
            wing_setting_1: Number(row.wingSettling1) || null,
            wing_setting_2: Number(row.wingSettling2) || null,
            first_lickerin_speed: Number(row.firstLickerinSpeed) || null,
            second_lickerin_speed: Number(row.secondLickerinSpeed) || null,
            third_lickerin_speed: Number(row.thirdLickerinSpeed) || null,
            mc_no: row.mcNo || null,
            mc_production: Number(row.mcProduction) || null,
        };
    });

    const waste_rows = wasteKgRows.map((row, index) => ({
        row_no: index + 1,
        waste_type: row.wasteType || null,
        waste_kgs_value: Number(row.wasteKgValue) || null,
        waste_kgs_percent: Number(row.wasteKgPercent) || null,
    }));

    return {
        type: entryTypeLabel,
        entry_id: entryId || null,
        lot_no: lotNo || null,
        waste_study_id: entryId || null,
        date,
        variety: formData.variety || null,
        study_type: formData.studyType,
        carding_production_kg: Number(formData.cardingProduction) || null,
        type_entries: selectedTypeRows.length,
        waste_type: "Overall",
        waste_kg: totalWasteKg || null,
        waste_percent: averageWastePercent || null,
        overall_percent: Number(overallWaste || getTotalWastePercent(wasteKgRows)) || null,
        remarks: remarks || null,
        type_rows,
        waste_rows,
    };
};

const BrWasteStudyEntry = forwardRef(function BrWasteStudyEntry({
    date,
    entryId,
    lotNo,
    onLotNoChange,
    saveEntryApi = null,
    fetchMachineOptionsApi = null,
    fetchWasteTypesApi = null,
    saveWasteTypeApi = saveBlowroomMasterWasteType,
    entryTypeLabel = "BR Waste Study Entry",
    useBlowroomRedux = true,
    showEntryId = true,
    variety: externalVariety,
    onVarietyChange = null,
    hideVarietyField = false,
}, ref) {
    const dispatch = useDispatch();
    const { success } = useSelector((state) => state.blowroom ?? DEFAULT_BLOWROOM_STATE);
    const [formData, setFormData] = useState(initialForm);
    const [errors, setErrors] = useState({});
    const [localSubmitTick, setLocalSubmitTick] = useState(0);
    const [machineOptions, setMachineOptions] = useState([]);
    const { varietyOptions, varietyOptionsError, loadingVarietyOptions } = useBlowroomMasterVarieties();
    const {
        wasteTypeOptions,
        wasteTypeOptionsError,
        loadingWasteTypeOptions,
        refreshWasteTypeOptions,
    } = useBlowroomMasterWasteTypes(fetchWasteTypesApi || undefined);
    const normalizedWasteTypes = new Set(
        (Array.isArray(wasteTypeOptions) ? wasteTypeOptions : [])
            .map((option) => String(option?.value ?? option?.label ?? option ?? "").trim().toLowerCase())
            .filter(Boolean)
    );
    const [wasteTypeSaveStatus, setWasteTypeSaveStatus] = useState({});
    const wasteTypeAttemptRef = useRef({});

    const [type2CountInput, setType2CountInput] = useState("1");
    const [type3CountInput, setType3CountInput] = useState('3');
    const [wasteKgCountInput, setWasteKgCountInput] = useState('1');

    const [type1Rows, setType1Rows] = useState([emptyType1Row()]);
    const [type2Rows, setType2Rows] = useState([emptyType2Row()]);
    const [type3Rows, setType3Rows] = useState(Array.from({ length: 3 }, emptyType3Row));
    const [wasteKgRows, setWasteKgRows] = useState([emptyWasteKgRow()]);

    const [overallWaste, setOverallWaste] = useState('');
    const [remarks, setRemarks] = useState('');
    const { studyType } = formData;

    useEffect(() => {
        if (onVarietyChange && externalVariety !== undefined && externalVariety !== formData.variety) {
            setFormData((prev) => ({ ...prev, variety: externalVariety }));
        }
    }, [externalVariety, onVarietyChange]);

    const handleVarietyChange = (value) => {
        handleChange('variety', value);
        onVarietyChange?.(value);
    };

    const mapEntryToForm = (entry) => {
        const typeRows = Array.isArray(entry?.type_rows) ? entry.type_rows : [];
        const wasteRows = Array.isArray(entry?.waste_rows) ? entry.waste_rows : [];
        const studyType = entry?.study_type || "";

        setFormData({
            variety: entry?.variety || "",
            cardingProduction: entry?.carding_production_kg == null ? "" : String(entry.carding_production_kg),
            studyType,
        });
        setRemarks(entry?.remarks || "");
        setOverallWaste(entry?.overall_percent == null ? "" : String(entry.overall_percent));

        if (entry?.lot_no && onLotNoChange) {
            onLotNoChange(entry.lot_no);
        }

        if (studyType === "Type 1") {
            setType1Rows(
                typeRows.length
                    ? typeRows.map((row) => ({
                        cylinderSpeed: row?.cylinder_speed == null ? "" : String(row.cylinder_speed),
                        lickerinSpeed: row?.lickerin_speed == null ? "" : String(row.lickerin_speed),
                        flatSpeed: row?.flat_speed == null ? "" : String(row.flat_speed),
                        dofferSpeed: row?.doffer_speed == null ? "" : String(row.doffer_speed),
                        mcNo: row?.mc_no || "",
                        mcProduction: row?.mc_production == null ? "" : String(row.mc_production),
                    }))
                    : [emptyType1Row()]
            );
        }

        if (studyType === "Type 2") {
            setType2Rows(
                typeRows.length
                    ? typeRows.map((row) => ({
                        cylinderSpeed: row?.cylinder_speed == null ? "" : String(row.cylinder_speed),
                        flatSpeed: row?.flat_speed == null ? "" : String(row.flat_speed),
                        deliverySpeed: row?.delivery_speed == null ? "" : String(row.delivery_speed),
                        wingSetting: row?.wing_setting_1 == null ? "" : String(row.wing_setting_1),
                        lickerinSpeed: row?.lickerin_speed == null ? "" : String(row.lickerin_speed),
                        mcNo: row?.mc_no || "",
                        mcProduction: row?.mc_production == null ? "" : String(row.mc_production),
                    }))
                    : [emptyType2Row()]
            );
            setType2CountInput(String(typeRows.length || 1));
        }

        if (studyType === "Type 3") {
            setType3Rows(
                typeRows.length
                    ? typeRows.map((row) => ({
                        flatSpeed: row?.flat_speed == null ? "" : String(row.flat_speed),
                        deliverySpeed: row?.delivery_speed == null ? "" : String(row.delivery_speed),
                        wingSettling1: row?.wing_setting_1 == null ? "" : String(row.wing_setting_1),
                        wingSettling2: row?.wing_setting_2 == null ? "" : String(row.wing_setting_2),
                        firstLickerinSpeed: "",
                        secondLickerinSpeed: "",
                        thirdLickerinSpeed: "",
                        mcNo: row?.mc_no || "",
                        mcProduction: row?.mc_production == null ? "" : String(row.mc_production),
                    }))
                    : [emptyType3Row()]
            );
            setType3CountInput(String(typeRows.length || 1));
        }

        setWasteKgRows(
            wasteRows.length
                ? wasteRows.map((row) => ({
                    wasteType: row?.waste_type || "",
                    wasteKgValue: row?.waste_kgs_value == null ? "" : String(row.waste_kgs_value),
                    wasteKgPercent: row?.waste_kgs_percent == null ? "" : String(row.waste_kgs_percent),
                }))
                : [emptyWasteKgRow()]
        );
        setWasteKgCountInput(String(wasteRows.length || 1));
        setErrors({});
    };

    const calculateWastePercent = (wasteKgValue, production) => {
        const waste = Number(wasteKgValue) || 0;
        const prod = Number(production) || 0;
        const denominator = prod + waste;
        if (denominator <= 0 || waste <= 0) return '';
        return ((waste / denominator) * 100).toFixed(2);
    };

    const handleChange = (field, value) => {
        const nextValue = FORM_NUMERIC_FIELDS.has(field)
            ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
            : value;
        setFormData(prev => {
            if (field === "cardingProduction") {
                setWasteKgRows((prevRows) =>
                    prevRows.map((row) => ({
                        ...row,
                        wasteKgPercent: calculateWastePercent(row.wasteKgValue, nextValue),
                    }))
                );
            }
            return { ...prev, [field]: nextValue };
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
                : sanitizeNumericInput(value, { precision: 10, scale: 4 });
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

    useEffect(() => {
        setOverallWaste(formatWastePercent(getTotalWastePercent(wasteKgRows)));
    }, [wasteKgRows]);

    useEffect(() => {
        setWasteKgRows((prevRows) =>
            prevRows.map((row) => ({
                ...row,
                wasteKgPercent: calculateWastePercent(row.wasteKgValue, formData.cardingProduction),
            }))
        );
    }, [formData.cardingProduction]);

    useEffect(() => {
        const selectedRows =
            studyType === "Type 3"
                ? type3Rows
                : studyType === "Type 2"
                    ? type2Rows
                    : studyType === "Type 1"
                        ? type1Rows
                        : [];
        const nextCardingProduction = selectedRows.length ? formatCardingProduction(selectedRows) : "";
        setFormData((prev) => (
            prev.cardingProduction === nextCardingProduction
                ? prev
                : { ...prev, cardingProduction: nextCardingProduction }
        ));
    }, [studyType, type1Rows, type2Rows, type3Rows]);

    const applyWasteKgCount = () => {
        const n = Math.min(WASTE_KG_MAX_TYPES, Math.max(1, parseInt(wasteKgCountInput) || 1));
        setWasteKgRows((prev) => {
            const arr = [...prev];
            while (arr.length < n) arr.push(emptyWasteKgRow());
            return arr.slice(0, n);
        });
    };

    useEffect(() => {
        const loadMachines = async () => {
            if (!fetchMachineOptionsApi) return;
            try {
                const options = await fetchMachineOptionsApi({ prefix: "CDG" });
                setMachineOptions(Array.isArray(options) ? options : []);
            } catch {
                setMachineOptions([]);
            }
        };
        loadMachines();
    }, [fetchMachineOptionsApi]);

    useEffect(() => {
        const timers = [];

        wasteKgRows.forEach((row, index) => {
            const rawValue = String(row.wasteType || "").trim();
            if (!rawValue) return;

            const normalizedValue = rawValue.toLowerCase();
            if (normalizedWasteTypes.has(normalizedValue)) return;
            if (wasteTypeAttemptRef.current[index] === normalizedValue) return;
            if (wasteTypeSaveStatus[normalizedValue]?.saving || wasteTypeSaveStatus[normalizedValue]?.saved) return;

            const timer = setTimeout(async () => {
                wasteTypeAttemptRef.current[index] = normalizedValue;
                setWasteTypeSaveStatus((current) => ({
                    ...current,
                    [normalizedValue]: { saving: true, saved: false, error: "" },
                }));

                try {
                    await saveWasteTypeApi(rawValue);
                    await refreshWasteTypeOptions();
                    setWasteTypeSaveStatus((current) => ({
                        ...current,
                        [normalizedValue]: { saving: false, saved: true, error: "" },
                    }));
                } catch (error) {
                    setWasteTypeSaveStatus((current) => ({
                        ...current,
                        [normalizedValue]: { saving: false, saved: false, error: error.message || "Failed to save waste type" },
                    }));
                }
            }, 450);

            timers.push(timer);
        });

        return () => {
            timers.forEach((timer) => clearTimeout(timer));
        };
    }, [normalizedWasteTypes, refreshWasteTypeOptions, wasteKgRows, wasteTypeSaveStatus]);

    useEffect(() => {
        const shouldReset = useBlowroomRedux ? success : localSubmitTick > 0;
        if (shouldReset) {
            setFormData(initialForm);
            setType1Rows([emptyType1Row()]);
            setType2Rows([emptyType2Row()]);
            setType3Rows(Array.from({ length: 3 }, emptyType3Row));
            setWasteKgRows([emptyWasteKgRow()]);
            setOverallWaste('');
            setRemarks('');
            setWasteTypeSaveStatus({});
            wasteTypeAttemptRef.current = {};
            onVarietyChange?.('');
        }
    }, [success, localSubmitTick, dispatch, useBlowroomRedux]);

    const handleSubmit = async () => {
        if (!validate()) return;
        const payload = buildBrWastePayload({
            date,
            entryId,
            lotNo,
            formData,
            type1Rows,
            type2Rows,
            type3Rows,
            wasteKgRows,
            overallWaste,
            remarks,
            entryTypeLabel,
        });

        try {
            if (saveEntryApi) {
                await saveEntryApi(payload);
                setLocalSubmitTick((value) => value + 1);
            } else {
                await dispatch(saveBlowroomBrWaste(payload)).unwrap();
            }
            return true;
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
        setWasteTypeSaveStatus({});
        wasteTypeAttemptRef.current = {};
        onVarietyChange?.('');
        if (useBlowroomRedux) {
            dispatch(resetState());
        }
        setErrors({});
    };

    const validate = () => {
        const nextErrors = {};
        ["variety","cardingProduction","studyType"].forEach((key)=>{
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
            ...(showEntryId ? [{ label: "BR Waste ID", value: entryId }] : []),
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

    const totalWasteKgValue = wasteKgRows.reduce((sum, row) => sum + (Number(row.wasteKgValue) || 0), 0);

    return (
        <>
            <div className={styles['mixx-row']}>
                {!hideVarietyField && (
                    <div className={styles['mixx-group']}>
                        <label>Variety</label>
                        <SearchableSelect
                            className={`${styles['mixx-input']} ${errors.variety ? styles['mixx-error'] : ''}`}
                            value={formData.variety}
                            onChange={handleVarietyChange}
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
                )}

                <CustomInput
                    label="Carding Production (KGs)"
                    placeholder="0.00"
                    value={formData.cardingProduction}
                    onChange={value => handleChange('cardingProduction', value)}
                    error={errors.cardingProduction}
                    readOnly
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
            </div>

            {/* ===== TYPE 1 ===== */}
            {studyType === 'Type 1' && (
                <>
                    <div className={styles['section-title']}>Type 1 Study Details</div>
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
                                    col.key === "mcNo" && machineOptions.length ? (
                                        <select
                                            key={col.key}
                                            className={`${styles['mixx-input']} ${errors[`t1-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                            value={row[col.key]}
                                            onChange={e => handleType1RowChange(i, col.key, e.target.value)}
                                        >
                                            <option value="">Select MC No</option>
                                            {machineOptions.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            key={col.key}
                                            className={`${styles['mixx-input']} ${errors[`t1-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                            placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
                                            value={row[col.key]}
                                            onChange={e => handleType1RowChange(i, col.key, e.target.value)}
                                        />
                                    )
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
                                    col.key === "mcNo" && machineOptions.length ? (
                                        <select
                                            key={col.key}
                                            className={`${styles['mixx-input']} ${errors[`t2-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                            value={row[col.key]}
                                            onChange={(e) => handleType2RowChange(i, col.key, e.target.value)}
                                        >
                                            <option value="">Select MC No</option>
                                            {machineOptions.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            key={col.key}
                                            className={`${styles['mixx-input']} ${errors[`t2-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                            placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
                                            value={row[col.key]}
                                            onChange={(e) => handleType2RowChange(i, col.key, e.target.value)}
                                        />
                                    )
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
                                    col.key === "mcNo" && machineOptions.length ? (
                                        <select
                                            key={col.key}
                                            className={`${styles['mixx-input']} ${errors[`t3-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                            value={row[col.key]}
                                            onChange={e => handleType3RowChange(i, col.key, e.target.value)}
                                        >
                                            <option value="">Select MC No</option>
                                            {machineOptions.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            key={col.key}
                                            className={`${styles['mixx-input']} ${errors[`t3-${i}-${col.key}`] ? styles['mixx-error'] : ''}`}
                                            placeholder={col.key === "mcNo" ? "MC No" : "0.00"}
                                            value={row[col.key]}
                                            onChange={e => handleType3RowChange(i, col.key, e.target.value)}
                                        />
                                    )
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
                                <SearchableSelect
                                    className={styles['mixx-input']}
                                    value={row.wasteType}
                                    onChange={(value) => handleWasteKgRowChange(i, "wasteType", value)}
                                    options={wasteTypeOptions}
                                    placeholder={
                                        loadingWasteTypeOptions
                                            ? "Loading waste types..."
                                            : wasteTypeOptionsError
                                                ? "Type waste type"
                                                : "Select or type waste type"
                                    }
                                    ariaLabel={`Waste Type ${i + 1}`}
                                />
                                {wasteTypeSaveStatus[String(row.wasteType || "").trim().toLowerCase()]?.saving ? (
                                    <div className={styles['mixx-help']}>Saving new waste type...</div>
                                ) : null}
                                {wasteTypeSaveStatus[String(row.wasteType || "").trim().toLowerCase()]?.error ? (
                                    <div className={styles['mixx-help-error']}>
                                        {wasteTypeSaveStatus[String(row.wasteType || "").trim().toLowerCase()].error}
                                    </div>
                                ) : null}
                            </div>
                            <div className={styles['mixx-group']}>
                                <label>Waste KGs Value</label>
                                <input
                                    className={styles['mixx-input']}
                                    placeholder="0.0000"
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

                    <div className={styles['mixx-row']}>
                        <div className={`${styles['mixx-group']} ${styles['mixx-total-label-col']}`}>
                            <label className={styles['mixx-total-spacer']}>&nbsp;</label>
                            <span className={styles['mixx-total-label']}>Total</span>
                        </div>
                        <div className={styles['mixx-group']}>
                            <label>Total Waste KGs Value</label>
                            <input
                                className={`${styles['mixx-input']} ${styles['mixx-total-input']}`}
                                value={totalWasteKgValue.toFixed(4)}
                                readOnly
                            />
                        </div>
                        <div className={styles['mixx-group']}>
                            <label>Total Waste KGs %</label>
                            <input
                                className={`${styles['mixx-input']} ${styles['mixx-total-input']}`}
                                value={`${formatWastePercent(getTotalWastePercent(wasteKgRows))} %`}
                                readOnly
                            />
                        </div>
                    </div>


                    <div className={styles['mixx-row']}>
                        <div className={styles['mixx-group']}>
                            <label>Remarks (optional)</label>
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
