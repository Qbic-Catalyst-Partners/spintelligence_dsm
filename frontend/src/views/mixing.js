import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/router";
import CottonHVIDataEntry from "./mixing/cottonHVIDataEntry";
import Afis6CottonDataEntry from "./mixing/afis6CottonDataEntry";
import Afis6MmfDataEntry from "./mixing/afis6MmfDataEntry";
import FibreDataEntry from "./mixing/fibreDataEntry";
import CustomInput from "@/components/CustomInput";
import SearchableSelect from "@/components/SearchableSelect";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import AfisDataEntry from "./mixing/afisDataEntry";
import MoistureDataEntry from "./mixing/moistureDataEntry";
import OpennessDataEntry from "./mixing/opennessDataEntry";
import ProcessParameterDataEntry from "./mixing/processParameterDataEntry";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { clearMixingState } from "@/store/slices/mixing";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import { fetchBlowroomMachineMaster } from "@/apis/blowroom";
import useMixingLotOptions from "@/hooks/useMixingLotOptions";
import { fetchMixingLotDetails } from "@/apis/mixing";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { submitAfis6Cotton, submitAfis6Mmf } from "@/store/slices/mixing";

const mixingDepartmentTypes = [
    {
        id: 0,
        name: "Process Parameter",
        aliases: [
            "Process Parameter",
            "Process Parameter Data Entry",
            "Mixing Process Parameter",
            "Mixing QC",
            "Mixing QC Data Entry",
            "Mixing Qc Data Entry",
        ],
        component: ProcessParameterDataEntry,
        needsLotNo: false,
    },
    { id: 1, name: "Cotton HVI Data Entry", aliases: ["Cotton HVI Data Entry", "Cotton HVI"], component: CottonHVIDataEntry, needsLotNo: true },
    { id: 2, name: "AFIS Data Entry", aliases: ["AFIS Data Entry", "Afis Data Entry"], component: AfisDataEntry, needsLotNo: true },
    {
        id: 3,
        name: "AFIS-6 Cotton Data Entry",
        aliases: ["AFIS-6 Cotton Data Entry", "AFIS 6 Cotton Data Entry", "AFIS6 Cotton Data Entry"],
        component: Afis6CottonDataEntry,
        needsLotNo: false,
    },
    {
        id: 4,
        name: "AFIS-6 MMF Data Entry",
        aliases: ["AFIS-6 MMF Data Entry", "AFIS 6 MMF Data Entry", "AFIS6 MMF Data Entry"],
        component: Afis6MmfDataEntry,
        needsLotNo: false,
    },
    { id: 5, name: "Fibre Data Entry", aliases: ["Fibre Data Entry", "Fiber Data Entry"], component: FibreDataEntry, needsLotNo: true },
    { id: 6, name: "Moisture Data Entry", aliases: ["Moisture Data Entry"], component: MoistureDataEntry, needsLotNo: true },
    { id: 7, name: "Openness Data Entry", aliases: ["Openness Data Entry"], component: OpennessDataEntry, needsLotNo: false },
];

export const MIXING_INPUT_SCREEN_COUNT = mixingDepartmentTypes.length;

const getCurrentDate = () => new Date().toISOString().split("T")[0];
const normalizeTypeName = (value = "") => String(value).trim().toLowerCase();
const MIXING_ENTRY_ID_CONFIG = {
    "Cotton HVI Data Entry": { prefix: "COT", width: 4, routePath: "/mixing/cotton-hvi" },
    "AFIS-6 Cotton Data Entry": {
        prefix: "AFIC",
        width: 4,
        routePath: "/mixing?type=AFIS-6%20Cotton%20Data%20Entry",
        fetchPath: "/mixing/afis6-cotton",
    },
    "AFIS-6 MMF Data Entry": {
        prefix: "AFIM",
        width: 4,
        routePath: "/mixing?type=AFIS-6%20MMF%20Data%20Entry",
        fetchPath: "/mixing/afis6-mmf",
    },
    "Fibre Data Entry": { prefix: "FIB", width: 4, routePath: "/mixing/fibre" },
    "AFIS Data Entry": { prefix: "AFI", width: 4, routePath: "/mixing/afis" },
    "Moisture Data Entry": { prefix: "MOI", width: 4, routePath: "/mixing/moisture" },
    "Openness Data Entry": { prefix: "OPN", width: 4, routePath: "/mixing/openness" },
    "Process Parameter": { prefix: "MIX", width: 4, routePath: "/mixing/qc" },
};

const getEntryConfigForType = (typeName) =>
    MIXING_ENTRY_ID_CONFIG[typeName] || { prefix: "MIX" };

const PROCESS_PARAMETER_CREATED_IDS_KEY = "mixing-process-parameter-created-ids";

const readCreatedProcessParameterIds = () => {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(PROCESS_PARAMETER_CREATED_IDS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map((value) => String(value || "").trim()).filter(Boolean) : [];
    } catch {
        return [];
    }
};

const writeCreatedProcessParameterIds = (ids) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            PROCESS_PARAMETER_CREATED_IDS_KEY,
            JSON.stringify(Array.from(new Set((ids || []).map((value) => String(value || "").trim()).filter(Boolean))))
        );
    } catch {}
};

function Mixing() {
    const router = useRouter();
    const childRef = useRef(null);
    const successHandledRef = useRef(false);
    const lotDetailsFetchKeyRef = useRef("");
    const appliedRequestedTypeRef = useRef("");
    const dispatch = useDispatch();
    const { actionLoading, actionSuccess } = useSelector((state) => state.mixing);
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const requestedType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
    const isProcessParameterRequest = normalizeTypeName(requestedType) === "process parameter";
    const typeOptions = useMemo(() => {
        const fullTypeOptions = filterOptionsByDepartmentAccess(
            mixingDepartmentTypes,
            accessByDepartment,
            user,
            "Mixing"
        );
        return isProcessParameterRequest
            ? fullTypeOptions
            : fullTypeOptions.filter((item) => item.name !== "Process Parameter");
    }, [accessByDepartment, user, isProcessParameterRequest]);
    const mixingNavigationOptions = useMemo(
        () =>
            filterOptionsByDepartmentAccess(
                mixingDepartmentTypes,
                accessByDepartment,
                user,
                "Mixing"
            ).filter((item) => item.name !== "Process Parameter"),
        [accessByDepartment, user]
    );
    const [selectedTypeName, setSelectedTypeName] = useState(() => typeOptions[0]?.name || "");
    const [date, setDate] = useState(getCurrentDate);
    const [lotNo, setLotNo] = useState("");
    const [selectedLotDetails, setSelectedLotDetails] = useState(null);
    const [target, setTarget] = useState("");
    const [brLine, setBrLine] = useState("");
    const [brLineOptions, setBrLineOptions] = useState([]);
    const [headerErrors, setHeaderErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [pendingConfirmAction, setPendingConfirmAction] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [validationMessage, setValidationMessage] = useState("");
    const [ocrBusy] = useState(false);
    const [pendingOcrValues, setPendingOcrValues] = useState(null);
    const [afis6Form, setAfis6Form] = useState({
        lot_no: "",
        variety: "",
        invoice_date: "",
        mc_name: "",
        blow_room: "",
        carding: "",
        breaker_drawing: "",
        finisher_drawing: "",
        comber: "",
        scp_nep_count: "",
        l_w_mm: "",
        l_w_cv: "",
        sfc_w_percent: "",
        uql_w_mm: "",
        l_n_mm: "",
        l_n_cv_percent: "",
        sfc_n_percent: "",
        five_pct_l_n_mm: "",
    });
    const [afis6Errors, setAfis6Errors] = useState({});
    const [afis6MmfForm, setAfis6MmfForm] = useState({
        lot_no: "",
        variety: "",
        invoice_date: "",
        mc_name: "",
        blow_room: "",
        carding: "",
        breaker_drawing: "",
        finisher_drawing: "",
        comber: "",
        total_nep_count_g: "",
        total_nep_mean_size_um: "",
        fiber_nep_count_g: "",
        fiber_nep_mean_size_um: "",
        sc_nep_count_g: "",
        sc_nep_mean_size_um: "",
        l_w_mm: "",
        l_w_cv: "",
        sfc_w_percent: "",
        uql_w_mm: "",
        l_n_mm: "",
        l_n_cv_percent: "",
        sfc_n_percent: "",
        five_pct_l_n_mm: "",
        fitness_index: "",
        maturity_ratio_mat1: "",
        ifc_percent: "",
        fifty_pct_l_n_mm: "",
        cut_length_n_mm: "",
        cut_length_l_n_cv_percent: "",
        cut_length_sfc_w_percent: "",
        fineness_den: "",
        fineness_cv_percent: "",
        long_fiber_gt_45_60_percent: "",
        long_fiber_count_gt_45_60: "",
    });
    const [afis6MmfErrors, setAfis6MmfErrors] = useState({});
    const [currentDateLabel, setCurrentDateLabel] = useState("");
    useEffect(() => {
        setCurrentDateLabel(new Date().toLocaleDateString("en-IN"));
    }, []);

    const selectedType = typeOptions.find((item) => item.name === selectedTypeName) || null;
    const SelectedComponent = selectedType?.component ?? null;
    const isProcessParameter = selectedTypeName === "Process Parameter";
    const isAfis6Cotton = selectedTypeName === "AFIS-6 Cotton Data Entry";
    const isAfis6Mmf = selectedTypeName === "AFIS-6 MMF Data Entry";
    const shouldLoadLots = selectedType?.needsLotNo !== false && selectedTypeName !== "Openness Data Entry";
    const { lotOptions, lotOptionsError, loadingLotOptions } = useMixingLotOptions(
        shouldLoadLots ? selectedTypeName : ""
    );
    const {
        lotOptions: afis6LotOptions,
        lotOptionsError: afis6LotOptionsError,
        loadingLotOptions: loadingAfis6LotOptions,
    } = useMixingLotOptions(isAfis6Cotton || isAfis6Mmf ? "AFIS Data Entry" : "");
    const { entryId, reserveEntryId, loading: entryIdLoading } = useDatabaseEntryId({
        department: "Mixing",
        typeName: selectedTypeName,
        config: getEntryConfigForType(selectedTypeName),
    });

    useEffect(() => {
        if (!typeOptions.some((item) => item.name === selectedTypeName)) {
            setSelectedTypeName(typeOptions[0]?.name || "");
        }
    }, [selectedTypeName, typeOptions]);

    useEffect(() => {
        if (!requestedType || !typeOptions.length) return;
        if (appliedRequestedTypeRef.current === requestedType) return;
        const requested = normalizeTypeName(requestedType);
        const matchedType = typeOptions.find((item) =>
            [item.name, ...(item.aliases || [])].map(normalizeTypeName).includes(requested)
        );
        if (matchedType) {
            appliedRequestedTypeRef.current = requestedType;
            setSelectedTypeName(matchedType.name);
        }
    }, [requestedType, typeOptions]);

    const showSuccessOnce = () => {
        if (successHandledRef.current) return;
        successHandledRef.current = true;
        setShowSuccess(true);
    };

    useEffect(() => {
        if (actionSuccess) {
            reserveEntryId();
            showSuccessOnce();
        }
    }, [actionSuccess, reserveEntryId]);

    useEffect(() => {
        setDate((current) => current || getCurrentDate());
    }, []);
    const handleTypeChange = (value) => {
        if (value === selectedTypeName) return;
        setSelectedTypeName(value);
        setLotNo("");
        setSelectedLotDetails(null);
        setTarget("");
        setBrLine("");
        setHeaderErrors({});
        setValidationMessage("");
        childRef.current?.clear?.();
    };

    const handleBrLineChange = (value) => {
        setBrLine(value);
        setHeaderErrors((prev) => {
            if (!prev.brLine) return prev;
            const next = { ...prev };
            delete next.brLine;
            return next;
        });
    };

    useEffect(() => {
        if (selectedTypeName !== "Openness Data Entry") return;
        let active = true;
        fetchBlowroomMachineMaster()
            .then((options) => {
                if (active) setBrLineOptions(Array.isArray(options) ? options : []);
            })
            .catch((error) => {
                console.warn("Unable to fetch B/R Line options:", error?.message || error);
                if (active) setBrLineOptions([]);
            });
        return () => {
            active = false;
        };
    }, [selectedTypeName]);

    const handleTargetChange = (value) => {
        setTarget(value);
        setHeaderErrors((prev) => {
            if (!prev.target) return prev;
            const next = { ...prev };
            delete next.target;
            return next;
        });
    };

    const handleLotChange = (value) => {
        setLotNo(value);
        setSelectedLotDetails(lotOptions.find((lot) => lot.lot_no === value || lot.value === value) || null);
        setHeaderErrors((prev) => {
            if (!prev.lotNo) return prev;
            const next = { ...prev };
            delete next.lotNo;
            return next;
        });
    };

    const handleClear = () => {
        setDate(getCurrentDate());
        setLotNo("");
        setSelectedLotDetails(null);
        setTarget("");
        setBrLine("");
        setHeaderErrors({});
        setValidationMessage("");
        childRef.current?.clear?.();
    };

    useEffect(() => {
        if (!lotNo) {
            setSelectedLotDetails(null);
            return;
        }
        setSelectedLotDetails(lotOptions.find((lot) => lot.lot_no === lotNo || lot.value === lotNo) || null);
    }, [lotNo, lotOptions]);

    useEffect(() => {
        if (!lotNo || !selectedTypeName) return undefined;
        const hasAutofillDetails =
            selectedLotDetails?.variety ||
            selectedLotDetails?.invoice_no ||
            selectedLotDetails?.invoice_date;
        if (hasAutofillDetails) return undefined;
        const fetchKey = `${selectedTypeName}:${lotNo}`;
        if (lotDetailsFetchKeyRef.current === fetchKey) return undefined;
        lotDetailsFetchKeyRef.current = fetchKey;

        let active = true;
        fetchMixingLotDetails({ screenName: selectedTypeName, lotNo })
            .then((details) => {
                if (active && details) {
                    setSelectedLotDetails(details);
                }
            })
            .catch((error) => {
                console.warn("Unable to fetch selected lot details:", error?.message || error);
            });

        return () => {
            active = false;
        };
    }, [lotNo, selectedTypeName, selectedLotDetails]);

    const buildHeaderPreview = () => {
        const list = [
            { label: "Type", value: selectedTypeName },
        ];
        if (!isProcessParameter) list.push({ label: "Entry ID", value: entryId });
        if (selectedType?.needsLotNo !== false) {
            list.push({ label: "Lot No", value: lotNo });
        }
        return list;
    };

    const openPreview = () => {
        if (entryIdLoading || !entryId) {
            setValidationMessage("Entry ID is still loading. Please wait a moment and try again.");
            return;
        }
        const errors = {};
        if (selectedType?.needsLotNo !== false && !lotNo) errors.lotNo = true;
        if (selectedTypeName === "Openness Data Entry" && !target) errors.target = true;

        setHeaderErrors(errors);

        const childValid = childRef.current?.validate ? childRef.current.validate() : true;
        const hasErrors = Object.keys(errors).length > 0 || childValid === false;
        if (hasErrors) {
            setValidationMessage("Please fill all required fields before saving.");
            return;
        }
        setValidationMessage("");

        if (!SelectedComponent || !childRef.current?.getPreviewData) {
            childRef.current?.submit?.();
            return;
        }
        const childItems = childRef.current.getPreviewData() || [];
        setPreviewItems([...buildHeaderPreview(), ...childItems]);
        setShowPreview(true);
    };

    const confirmSubmit = async () => {
        setShowPreview(false);

        if (pendingConfirmAction) {
            const action = pendingConfirmAction;
            setPendingConfirmAction(null);
            try {
                await action();
            } catch (error) {
                console.error("Mixing form save failed:", error?.response?.data || error?.message || error);
            }
            return;
        }

        // Captured synchronously, before reserveEntryId()/showSuccessOnce() run any state updates
        // that could re-render/detach the child form ahead of the recordSubmittedNotebook call
        // below. recordSubmittedNotebook is never passed childRef here (only this snapshot, with
        // previewItems as an ultimate fallback) — reading childRef.current.getPayload() live at
        // record-time is exactly the pattern that left "AFIS Data Entry" with zero submitted-
        // notebook rows ever recorded, while AFIS-6 Cotton's separate submit handler (which never
        // touches childRef, just its own locally-built data) has always worked.
        let capturedPayload = null;
        try {
            capturedPayload = childRef.current?.getPayload?.() || null;
            const ok = await childRef.current?.submit?.();
            if (ok === false) return;
            await reserveEntryId();
            showSuccessOnce();
        } catch (error) {
            console.error("Mixing form save failed:", error?.response?.data || error?.message || error);
            return;
        }

        try {
            await recordSubmittedNotebook({
                department: "Quality Control",
                subDepartment: "Mixing",
                notebookName: selectedTypeName,
                entryId,
                lotNo,
                registeredActions: capturedPayload ? { getPayload: () => capturedPayload } : undefined,
                previewItems,
                user,
            });
        } catch (error) {
            console.warn("Mixing submitted notebook record failed:", error?.response?.data || error?.message || error);
        }
    };

    const handleSuccessClose = () => {
        setShowSuccess(false);
        dispatch(clearMixingState());
        successHandledRef.current = false;
        router.reload();
    };

    const handleOpennessSubmitSuccess = () => {
        showSuccessOnce();
    };

    const BLOW_ROOM_OPTIONS = ["GBR", "CHUTE", "MO", "FLEXI CLEANER", "KB", "VARIO CLEANER"];

    const toDateInputValue = (value) => {
        const trimmed = String(value || "").trim();
        if (!trimmed) return "";
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
        const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (dmy) {
            const [, day, month, year] = dmy;
            return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
    };

    const afis6TextFieldDefs = [
        { key: "lot_no", label: "Lot No." },
        { key: "variety", label: "Variety" },
        { key: "invoice_date", label: "Invoice Date", type: "date" },
        { key: "mc_name", label: "Mc. Name" },
        { key: "blow_room", label: "Blow Room" },
        { key: "carding", label: "Carding" },
        { key: "breaker_drawing", label: "Breaker Drawing" },
        { key: "finisher_drawing", label: "Finisher Drawing" },
        { key: "comber", label: "Comber" },
    ];

    const afis6FieldDefs = [
        { key: "scp_nep_count", label: "SCP NEP Count" },
        { key: "l_w_mm", label: "L(W)" },
        { key: "l_w_cv", label: "L(W) CV" },
        { key: "sfc_w_percent", label: "SCF(W)<12.70mm" },
        { key: "uql_w_mm", label: "UQL(w)" },
        { key: "l_n_mm", label: "L(n)" },
        { key: "l_n_cv_percent", label: "L(n)CV" },
        { key: "sfc_n_percent", label: "SCF(n)<12.70mm" },
        { key: "five_pct_l_n_mm", label: "5%L(n)" },
    ];

    const handleAfis6Change = (key, value) => {
        const nextValue = afis6FieldDefs.some((field) => field.key === key)
            ? sanitizeNumericInput(value, { precision: 12, scale: 3 })
            : value;

        if (key === "lot_no") {
            const matchedLot = afis6LotOptions.find(
                (lot) => lot.lot_no === nextValue || lot.value === nextValue
            );
            setAfis6Form((prev) => ({
                ...prev,
                lot_no: nextValue,
                variety: matchedLot?.variety || prev.variety,
                invoice_date: matchedLot?.invoice_date ? toDateInputValue(matchedLot.invoice_date) : prev.invoice_date,
            }));
            setAfis6Errors((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
            });
            return;
        }

        setAfis6Form((prev) => ({ ...prev, [key]: nextValue }));
        setAfis6Errors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const buildAfis6Payload = () => {
        const normalizeNumeric = (value) => {
            const trimmed = String(value ?? "").trim();
            if (trimmed === "") return "";
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? parsed : Number.NaN;
        };

        const payload = {
            entry_id: entryId || undefined,
            inspection_date: date || "",
            lot_no: String(afis6Form.lot_no || "").trim(),
            variety: String(afis6Form.variety || "").trim(),
            invoice_date: String(afis6Form.invoice_date || "").trim(),
            mc_name: String(afis6Form.mc_name || "").trim(),
            blow_room: String(afis6Form.blow_room || "").trim(),
            carding: String(afis6Form.carding || "").trim(),
            breaker_drawing: String(afis6Form.breaker_drawing || "").trim(),
            finisher_drawing: String(afis6Form.finisher_drawing || "").trim(),
            comber: String(afis6Form.comber || "").trim(),
            scp_nep_count: normalizeNumeric(afis6Form.scp_nep_count),
            l_w_mm: normalizeNumeric(afis6Form.l_w_mm),
            l_w_cv: normalizeNumeric(afis6Form.l_w_cv),
            sfc_w_percent: normalizeNumeric(afis6Form.sfc_w_percent),
            uql_w_mm: normalizeNumeric(afis6Form.uql_w_mm),
            l_n_mm: normalizeNumeric(afis6Form.l_n_mm),
            l_n_cv_percent: normalizeNumeric(afis6Form.l_n_cv_percent),
            sfc_n_percent: normalizeNumeric(afis6Form.sfc_n_percent),
            five_pct_l_n_mm: normalizeNumeric(afis6Form.five_pct_l_n_mm),
            machine_name: "AFIS-6",
            department: "Mixing",
            sub_department: "Quality Control",
            user_name: user?.name || user?.user_name || user?.username || "",
        };

        return Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
        );
    };

    const handleAfis6Clear = () => {
        setAfis6Form({
            lot_no: "",
            variety: "",
            invoice_date: "",
            mc_name: "",
            blow_room: "",
            carding: "",
            breaker_drawing: "",
            finisher_drawing: "",
            comber: "",
            scp_nep_count: "",
            l_w_mm: "",
            l_w_cv: "",
            sfc_w_percent: "",
            uql_w_mm: "",
            l_n_mm: "",
            l_n_cv_percent: "",
            sfc_n_percent: "",
            five_pct_l_n_mm: "",
        });
        setAfis6Errors({});
        setValidationMessage("");
    };

    const handleAfis6Submit = async () => {
        const numericKeys = afis6FieldDefs.map((field) => field.key);
        const nextErrors = numericKeys.reduce((acc, key) => {
            const trimmed = String(afis6Form[key] ?? "").trim();
            const parsed = trimmed === "" ? "" : Number(trimmed);
            if (Number.isNaN(parsed)) acc[key] = "Must be a number";
            return acc;
        }, {});
        setAfis6Errors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            setValidationMessage("Please correct the numeric fields before saving.");
            return;
        }

        setValidationMessage("");
        await dispatch(submitAfis6Cotton(buildAfis6Payload())).unwrap();
        await reserveEntryId();
        try {
            await recordSubmittedNotebook({
                department: "Quality Control",
                subDepartment: "Mixing",
                notebookName: "AFIS-6 Cotton",
                entryId,
                previewItems: Object.entries(afis6Form).map(([key, value]) => ({ label: key, value })),
                user,
            });
        } catch (error) {
            console.warn("Mixing submitted notebook record failed:", error?.response?.data || error?.message || error);
        }
        handleAfis6Clear();
        showSuccessOnce();
    };

    const openAfis6Preview = () => {
        const numericKeys = afis6FieldDefs.map((field) => field.key);
        const nextErrors = numericKeys.reduce((acc, key) => {
            const trimmed = String(afis6Form[key] ?? "").trim();
            const parsed = trimmed === "" ? "" : Number(trimmed);
            if (Number.isNaN(parsed)) acc[key] = "Must be a number";
            return acc;
        }, {});
        setAfis6Errors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            setValidationMessage("Please correct the numeric fields before saving.");
            return;
        }
        setValidationMessage("");

        const items = [
            { label: "Type", value: selectedTypeName },
            { label: "Entry ID", value: entryId },
            ...afis6TextFieldDefs.map((field) => ({ label: field.label, value: afis6Form[field.key] })),
            ...afis6FieldDefs.map((field) => ({ label: field.label, value: afis6Form[field.key] })),
        ];
        setPreviewItems(items);
        setPendingConfirmAction(() => handleAfis6Submit);
        setShowPreview(true);
    };

    const afis6MmfTextFieldDefs = [
        { key: "lot_no", label: "Lot No." },
        { key: "variety", label: "Variety" },
        { key: "invoice_date", label: "Invoice Date", type: "date" },
        { key: "mc_name", label: "Mc. Name" },
        { key: "blow_room", label: "Blow Room" },
        { key: "carding", label: "Carding" },
        { key: "breaker_drawing", label: "Breaker Drawing" },
        { key: "finisher_drawing", label: "Finisher Drawing" },
        { key: "comber", label: "Comber" },
    ];

    const afis6MmfFieldDefs = [
        { key: "total_nep_count_g", label: "Total Nep Count / g" },
        { key: "total_nep_mean_size_um", label: "Total Nep mean size" },
        { key: "fiber_nep_count_g", label: "Fiber Nep Count" },
        { key: "fiber_nep_mean_size_um", label: "Fiber Nep Mean Size" },
        { key: "sc_nep_count_g", label: "SC Nep Count" },
        { key: "sc_nep_mean_size_um", label: "SC Nep Mean Size" },
        { key: "l_w_mm", label: "L(w)" },
        { key: "l_w_cv", label: "L(w)CV" },
        { key: "sfc_w_percent", label: "SCF(w)<12.70mm" },
        { key: "uql_w_mm", label: "UQL(w)" },
        { key: "l_n_mm", label: "L(n)" },
        { key: "l_n_cv_percent", label: "L(n)CV" },
        { key: "sfc_n_percent", label: "SCF(n)<12.70mm" },
        { key: "five_pct_l_n_mm", label: "5%L(n)" },
        { key: "fitness_index", label: "Fitness Index" },
        { key: "maturity_ratio_mat1", label: "Maturity Ratio Mat 1" },
        { key: "ifc_percent", label: "IFC%" },
        { key: "fifty_pct_l_n_mm", label: "50%L(n)" },
        { key: "cut_length_n_mm", label: "Cut Length(n)" },
        { key: "cut_length_l_n_cv_percent", label: "L(n)CV" },
        { key: "cut_length_sfc_w_percent", label: "SCF(w)<12.70mm" },
        { key: "fineness_den", label: "Fineness Den" },
        { key: "fineness_cv_percent", label: "Fineness CV" },
        { key: "long_fiber_gt_45_60_percent", label: "Long Fiber >45.60mm" },
        { key: "long_fiber_count_gt_45_60", label: "Long Fiber Count >45.60mm" },
    ];

    const handleAfis6MmfChange = (key, value) => {
        const nextValue = afis6MmfFieldDefs.some((field) => field.key === key)
            ? sanitizeNumericInput(value, { precision: 12, scale: 3 })
            : value;

        if (key === "lot_no") {
            const matchedLot = afis6LotOptions.find(
                (lot) => lot.lot_no === nextValue || lot.value === nextValue
            );
            setAfis6MmfForm((prev) => ({
                ...prev,
                lot_no: nextValue,
                variety: matchedLot?.variety || prev.variety,
                invoice_date: matchedLot?.invoice_date ? toDateInputValue(matchedLot.invoice_date) : prev.invoice_date,
            }));
            setAfis6MmfErrors((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
            });
            return;
        }

        setAfis6MmfForm((prev) => ({ ...prev, [key]: nextValue }));
        setAfis6MmfErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const buildAfis6MmfPayload = () => {
        const normalizeNumeric = (value) => {
            const trimmed = String(value ?? "").trim();
            if (trimmed === "") return "";
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? parsed : Number.NaN;
        };

        const payload = {
            entry_id: entryId || undefined,
            inspection_date: date || "",
            lot_no: String(afis6MmfForm.lot_no || "").trim(),
            variety: String(afis6MmfForm.variety || "").trim(),
            invoice_date: String(afis6MmfForm.invoice_date || "").trim(),
            mc_name: String(afis6MmfForm.mc_name || "").trim(),
            blow_room: String(afis6MmfForm.blow_room || "").trim(),
            carding: String(afis6MmfForm.carding || "").trim(),
            breaker_drawing: String(afis6MmfForm.breaker_drawing || "").trim(),
            finisher_drawing: String(afis6MmfForm.finisher_drawing || "").trim(),
            comber: String(afis6MmfForm.comber || "").trim(),
            total_nep_count_g: normalizeNumeric(afis6MmfForm.total_nep_count_g),
            total_nep_mean_size_um: normalizeNumeric(afis6MmfForm.total_nep_mean_size_um),
            fiber_nep_count_g: normalizeNumeric(afis6MmfForm.fiber_nep_count_g),
            fiber_nep_mean_size_um: normalizeNumeric(afis6MmfForm.fiber_nep_mean_size_um),
            sc_nep_count_g: normalizeNumeric(afis6MmfForm.sc_nep_count_g),
            sc_nep_mean_size_um: normalizeNumeric(afis6MmfForm.sc_nep_mean_size_um),
            l_w_mm: normalizeNumeric(afis6MmfForm.l_w_mm),
            l_w_cv: normalizeNumeric(afis6MmfForm.l_w_cv),
            sfc_w_percent: normalizeNumeric(afis6MmfForm.sfc_w_percent),
            uql_w_mm: normalizeNumeric(afis6MmfForm.uql_w_mm),
            l_n_mm: normalizeNumeric(afis6MmfForm.l_n_mm),
            l_n_cv_percent: normalizeNumeric(afis6MmfForm.l_n_cv_percent),
            sfc_n_percent: normalizeNumeric(afis6MmfForm.sfc_n_percent),
            five_pct_l_n_mm: normalizeNumeric(afis6MmfForm.five_pct_l_n_mm),
            fitness_index: normalizeNumeric(afis6MmfForm.fitness_index),
            maturity_ratio_mat1: normalizeNumeric(afis6MmfForm.maturity_ratio_mat1),
            ifc_percent: normalizeNumeric(afis6MmfForm.ifc_percent),
            fifty_pct_l_n_mm: normalizeNumeric(afis6MmfForm.fifty_pct_l_n_mm),
            cut_length_n_mm: normalizeNumeric(afis6MmfForm.cut_length_n_mm),
            cut_length_l_n_cv_percent: normalizeNumeric(afis6MmfForm.cut_length_l_n_cv_percent),
            cut_length_sfc_w_percent: normalizeNumeric(afis6MmfForm.cut_length_sfc_w_percent),
            fineness_den: normalizeNumeric(afis6MmfForm.fineness_den),
            fineness_cv_percent: normalizeNumeric(afis6MmfForm.fineness_cv_percent),
            long_fiber_gt_45_60_percent: normalizeNumeric(afis6MmfForm.long_fiber_gt_45_60_percent),
            long_fiber_count_gt_45_60: normalizeNumeric(afis6MmfForm.long_fiber_count_gt_45_60),
            machine_name: "AFIS-6",
            department: "Mixing",
            sub_department: "Quality Control",
            user_name: user?.name || user?.user_name || user?.username || "",
        };

        return Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
        );
    };

    const handleAfis6MmfClear = () => {
        setAfis6MmfForm({
            lot_no: "",
            variety: "",
            invoice_date: "",
            mc_name: "",
            blow_room: "",
            carding: "",
            breaker_drawing: "",
            finisher_drawing: "",
            comber: "",
            total_nep_count_g: "",
            total_nep_mean_size_um: "",
            fiber_nep_count_g: "",
            fiber_nep_mean_size_um: "",
            sc_nep_count_g: "",
            sc_nep_mean_size_um: "",
            l_w_mm: "",
            l_w_cv: "",
            sfc_w_percent: "",
            uql_w_mm: "",
            l_n_mm: "",
            l_n_cv_percent: "",
            sfc_n_percent: "",
            five_pct_l_n_mm: "",
            fitness_index: "",
            maturity_ratio_mat1: "",
            ifc_percent: "",
            fifty_pct_l_n_mm: "",
            cut_length_n_mm: "",
            cut_length_l_n_cv_percent: "",
            cut_length_sfc_w_percent: "",
            fineness_den: "",
            fineness_cv_percent: "",
            long_fiber_gt_45_60_percent: "",
            long_fiber_count_gt_45_60: "",
        });
        setAfis6MmfErrors({});
        setValidationMessage("");
    };

    const handleAfis6MmfSubmit = async () => {
        const numericKeys = afis6MmfFieldDefs.map((field) => field.key);
        const nextErrors = numericKeys.reduce((acc, key) => {
            const trimmed = String(afis6MmfForm[key] ?? "").trim();
            const parsed = trimmed === "" ? "" : Number(trimmed);
            if (Number.isNaN(parsed)) acc[key] = "Must be a number";
            return acc;
        }, {});
        setAfis6MmfErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            setValidationMessage("Please correct the numeric fields before saving.");
            return;
        }

        setValidationMessage("");
        await dispatch(submitAfis6Mmf(buildAfis6MmfPayload())).unwrap();
        await reserveEntryId();
        try {
            await recordSubmittedNotebook({
                department: "Quality Control",
                subDepartment: "Mixing",
                notebookName: "AFIS-6 MMF",
                entryId,
                previewItems: Object.entries(afis6MmfForm).map(([key, value]) => ({ label: key, value })),
                user,
            });
        } catch (error) {
            console.warn("Mixing submitted notebook record failed:", error?.response?.data || error?.message || error);
        }
        handleAfis6MmfClear();
        showSuccessOnce();
    };

    const openAfis6MmfPreview = () => {
        const numericKeys = afis6MmfFieldDefs.map((field) => field.key);
        const nextErrors = numericKeys.reduce((acc, key) => {
            const trimmed = String(afis6MmfForm[key] ?? "").trim();
            const parsed = trimmed === "" ? "" : Number(trimmed);
            if (Number.isNaN(parsed)) acc[key] = "Must be a number";
            return acc;
        }, {});
        setAfis6MmfErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            setValidationMessage("Please correct the numeric fields before saving.");
            return;
        }
        setValidationMessage("");

        const items = [
            { label: "Type", value: selectedTypeName },
            { label: "Entry ID", value: entryId },
            ...afis6MmfTextFieldDefs.map((field) => ({ label: field.label, value: afis6MmfForm[field.key] })),
            ...afis6MmfFieldDefs.map((field) => ({ label: field.label, value: afis6MmfForm[field.key] })),
        ];
        setPreviewItems(items);
        setPendingConfirmAction(() => handleAfis6MmfSubmit);
        setShowPreview(true);
    };

    const handleProcessParameterSubmitSuccess = (response) => {
        const createdId = String(
            response?.entry_id || response?.param_id || response?.process_parameter_id || response?.id || ""
        ).trim();

        if (createdId) {
            const currentIds = readCreatedProcessParameterIds();
            writeCreatedProcessParameterIds([createdId, ...currentIds]);
        }
    };

    useEffect(() => {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("ocr_prefill") : "";
        if (!raw) return;
        try {
            const payload = JSON.parse(raw);
            if (payload?.screen && payload?.docType && (payload?.result || payload?.values)) {
                const normalizedScreen = String(payload.screen || "").trim().toLowerCase();
                const matchingType = mixingDepartmentTypes.find((item) =>
                    item.name.toLowerCase() === normalizedScreen ||
                    item.aliases.some((alias) => alias.toLowerCase() === normalizedScreen)
                );
                if (matchingType) {
                    setSelectedTypeName(matchingType.name);
                } else {
                    setSelectedTypeName(payload.docType === "afis" ? "AFIS Data Entry" : "Cotton HVI Data Entry");
                }
                setPendingOcrValues(payload.result || payload.values);
            }
        } catch {}
    }, []);

    useEffect(() => {
        if (!pendingOcrValues) return;
        let attempts = 0;
        const maxAttempts = 30;
        const timer = setInterval(() => {
            attempts += 1;
            if (childRef.current?.applyOcrData) {
                childRef.current.applyOcrData(pendingOcrValues);
                setPendingOcrValues(null);
                if (typeof window !== "undefined") {
                    window.localStorage.removeItem("ocr_prefill");
                }
                clearInterval(timer);
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(timer);
            }
        }, 100);
        return () => clearInterval(timer);
    }, [pendingOcrValues, selectedTypeName]);

    return (
        <div className="min-h-screen bg-slate-50 flex justify-center">
            <div className="w-full max-w-7xl pt-8 px-4 pb-8">
                <div className="mb-5">
                    <h1 className="text-[24px] font-extrabold text-slate-900 m-0">
                        Quality Control - Mixing Notebook
                    </h1>
                    <div className="mt-2 text-right text-base font-semibold text-slate-600">
                        Current Date: {currentDateLabel}
                    </div>
                    <p className="text-[14px] text-slate-500 mt-1.5 mb-0">
                    </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200">
                    {!isProcessParameter && !isAfis6Cotton && !isAfis6Mmf ? (
                        <div className="p-5">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[#3d539f] text-xl leading-none">&#8801;&#9998;</span>
                                    <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
                                </div>
                                <InputScreenUploadButton
                                    visible={selectedTypeName === "Cotton HVI Data Entry" || selectedTypeName === "AFIS Data Entry"}
                                    disabled={ocrBusy}
                                    returnTo="/mixing"
                                    docType={selectedTypeName === "AFIS Data Entry" ? "afis" : "hvi"}
                                    screenName={selectedTypeName}
                                />
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 gap-[18px] items-start md:grid-cols-2 xl:grid-cols-3">
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <label className="text-[14px] font-semibold text-slate-700">Type</label>
                                        <select
                                            className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                                            style={{ backgroundColor: "#f1f5f9" }}
                                            value={selectedTypeName}
                                            onChange={(e) => handleTypeChange(e.target.value)}
                                        >
                                            <option value="">Select Type</option>
                                            {typeOptions.map((item) => (
                                                <option key={item.id} value={item.name}>
                                                    {item.displayName ?? item.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <CustomInput
                                        label="Entry ID"
                                        value={entryId}
                                        onChange={() => {}}
                                        disabled
                                    />

                                    {selectedType?.needsLotNo !== false ? (
                                        <div className="flex flex-col gap-1.5 min-w-0 w-full">
                                            <label className="text-[14px] font-semibold text-slate-700 truncate">
                                                Lot No
                                            </label>
                                            <SearchableSelect
                                                className={`w-full h-9.5 px-3 py-2 rounded-lg text-[14px] focus:outline-none transition-colors ${
                                                    headerErrors.lotNo
                                                        ? "border border-red-500 focus:ring-2 focus:ring-red-400 focus:border-red-500"
                                                        : "border border-slate-200 bg-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                                                }`}
                                                value={lotNo}
                                                onChange={handleLotChange}
                                                options={lotOptions}
                                            placeholder={
                                                loadingLotOptions
                                                    ? "Loading lots..."
                                                    : lotOptionsError
                                                        ? "Type lot number"
                                                        : "Select Lot Number"
                                            }
                                            ariaLabel="Lot No"
                                            />
                                        </div>
                                    ) : selectedTypeName === "Openness Data Entry" ? (
                                        <div className="flex flex-col gap-1.5 min-w-0 w-full">
                                            <label className="text-[14px] font-semibold text-slate-700 truncate">
                                                B/R Line No
                                            </label>
                                            <SearchableSelect
                                                className={`w-full h-9.5 px-3 py-2 rounded-lg text-[14px] focus:outline-none transition-colors ${
                                                    headerErrors.brLine
                                                        ? "border border-red-500 focus:ring-2 focus:ring-red-400 focus:border-red-500"
                                                        : "border border-slate-200 bg-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                                                }`}
                                                value={brLine}
                                                onChange={handleBrLineChange}
                                                options={brLineOptions}
                                                placeholder="Select B/R Line No"
                                                ariaLabel="B/R Line No"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                {SelectedComponent ? (
                                    <SelectedComponent
                                        ref={childRef}
                                        date={date}
                                        entryId={entryId}
                                        lotNo={lotNo}
                                        selectedLotDetails={selectedLotDetails}
                                        target={target}
                                        onTargetChange={handleTargetChange}
                                        targetError={headerErrors.target}
                                        brLine={brLine}
                                        selectedTypeName={selectedTypeName}
                                        typeOptions={typeOptions}
                                        onTypeChange={handleTypeChange}
                                        onSubmitSuccess={
                                            isProcessParameter
                                                ? handleProcessParameterSubmitSuccess
                                                : handleOpennessSubmitSuccess
                                        }
                                    />
                                ) : (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                        No accessible input screens are available for this department.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : isAfis6Cotton ? (
                        <div className="p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[#3d539f] text-xl leading-none">&#8801;&#9998;</span>
                                    <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
                                </div>
                                <InputScreenUploadButton
                                    visible={false}
                                    disabled={ocrBusy}
                                    returnTo="/mixing"
                                    docType="afis"
                                    screenName={selectedTypeName}
                                />
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Type</label>
                                    <select
                                        className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                                        style={{ backgroundColor: "#f1f5f9" }}
                                        value={selectedTypeName}
                                        onChange={(e) => handleTypeChange(e.target.value)}
                                    >
                                        <option value="">Select Type</option>
                                        {mixingNavigationOptions.map((item) => (
                                            <option key={item.id} value={item.name}>
                                                {item.displayName ?? item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Entry ID</label>
                                    <input
                                        readOnly
                                        value={entryId}
                                        className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px]"
                                    />
                                </div>
                                {afis6TextFieldDefs.map((field) =>
                                    field.key === "lot_no" ? (
                                        <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                            <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                            <SearchableSelect
                                                className={`w-full h-9.5 px-3 py-2 rounded-lg text-[14px] focus:outline-none transition-colors ${
                                                    afis6Errors.lot_no
                                                        ? "border border-red-500 focus:ring-2 focus:ring-red-400 focus:border-red-500"
                                                        : "border border-slate-200 bg-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                                                }`}
                                                value={afis6Form.lot_no}
                                                onChange={(value) => handleAfis6Change("lot_no", value)}
                                                options={afis6LotOptions}
                                                placeholder={
                                                    loadingAfis6LotOptions
                                                        ? "Loading lots..."
                                                        : afis6LotOptionsError
                                                            ? "Type lot number"
                                                            : "Select Lot Number"
                                                }
                                                ariaLabel="Lot No"
                                            />
                                        </div>
                                    ) : field.key === "blow_room" ? (
                                        <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                            <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                            <select
                                                value={afis6Form.blow_room}
                                                onChange={(e) => handleAfis6Change("blow_room", e.target.value)}
                                                className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6Errors.blow_room ? "border-red-500" : "border-slate-200"}`}
                                            >
                                                <option value="">Select Blow Room</option>
                                                {BLOW_ROOM_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {option}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                            <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                            <input
                                                type={field.type === "date" ? "date" : "text"}
                                                placeholder={field.type === "date" ? undefined : `Enter ${field.label}`}
                                                value={afis6Form[field.key]}
                                                onChange={(e) => handleAfis6Change(field.key, e.target.value)}
                                                className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6Errors[field.key] ? "border-red-500" : "border-slate-200"}`}
                                            />
                                        </div>
                                    )
                                )}
                                {afis6FieldDefs.map((field) => (
                                    <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                        <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="Enter"
                                            value={afis6Form[field.key]}
                                            onChange={(e) => handleAfis6Change(field.key, e.target.value)}
                                            className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6Errors[field.key] ? "border-red-500" : "border-slate-200"}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : isAfis6Mmf ? (
                        <div className="p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[#3d539f] text-xl leading-none">&#8801;&#9998;</span>
                                    <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
                                </div>
                                <InputScreenUploadButton
                                    visible={false}
                                    disabled={ocrBusy}
                                    returnTo="/mixing"
                                    docType="afis"
                                    screenName={selectedTypeName}
                                />
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Type</label>
                                    <select
                                        className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                                        style={{ backgroundColor: "#f1f5f9" }}
                                        value={selectedTypeName}
                                        onChange={(e) => handleTypeChange(e.target.value)}
                                    >
                                        <option value="">Select Type</option>
                                        {mixingNavigationOptions.map((item) => (
                                            <option key={item.id} value={item.name}>
                                                {item.displayName ?? item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Entry ID</label>
                                    <input
                                        readOnly
                                        value={entryId}
                                        className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px]"
                                    />
                                </div>
                                {afis6MmfTextFieldDefs.map((field) =>
                                    field.key === "lot_no" ? (
                                        <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                            <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                            <SearchableSelect
                                                className={`w-full h-9.5 px-3 py-2 rounded-lg text-[14px] focus:outline-none transition-colors ${
                                                    afis6MmfErrors.lot_no
                                                        ? "border border-red-500 focus:ring-2 focus:ring-red-400 focus:border-red-500"
                                                        : "border border-slate-200 bg-slate-100 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                                                }`}
                                                value={afis6MmfForm.lot_no}
                                                onChange={(value) => handleAfis6MmfChange("lot_no", value)}
                                                options={afis6LotOptions}
                                                placeholder={
                                                    loadingAfis6LotOptions
                                                        ? "Loading lots..."
                                                        : afis6LotOptionsError
                                                            ? "Type lot number"
                                                            : "Select Lot Number"
                                                }
                                                ariaLabel="Lot No"
                                            />
                                        </div>
                                    ) : field.key === "blow_room" ? (
                                        <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                            <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                            <select
                                                value={afis6MmfForm.blow_room}
                                                onChange={(e) => handleAfis6MmfChange("blow_room", e.target.value)}
                                                className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6MmfErrors.blow_room ? "border-red-500" : "border-slate-200"}`}
                                            >
                                                <option value="">Select Blow Room</option>
                                                {BLOW_ROOM_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {option}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                            <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                            <input
                                                type={field.type === "date" ? "date" : "text"}
                                                placeholder={field.type === "date" ? undefined : `Enter ${field.label}`}
                                                value={afis6MmfForm[field.key]}
                                                onChange={(e) => handleAfis6MmfChange(field.key, e.target.value)}
                                                className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6MmfErrors[field.key] ? "border-red-500" : "border-slate-200"}`}
                                            />
                                        </div>
                                    )
                                )}
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
                                {afis6MmfFieldDefs.slice(0, 2).map((field) => (
                                    <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                        <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="Enter"
                                            value={afis6MmfForm[field.key]}
                                            onChange={(e) => handleAfis6MmfChange(field.key, e.target.value)}
                                            className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6MmfErrors[field.key] ? "border-red-500" : "border-slate-200"}`}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
                                {afis6MmfFieldDefs.slice(2).map((field) => (
                                    <div key={field.key} className="flex flex-col gap-1.5 min-w-0">
                                        <label className="text-[14px] font-semibold text-slate-700">{field.label}</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="Enter"
                                            value={afis6MmfForm[field.key]}
                                            onChange={(e) => handleAfis6MmfChange(field.key, e.target.value)}
                                            className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6MmfErrors[field.key] ? "border-red-500" : "border-slate-200"}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : SelectedComponent ? (
                        <SelectedComponent
                            ref={childRef}
                            date={date}
                            entryId={entryId}
                            lotNo={lotNo}
                            selectedTypeName={selectedTypeName}
                            typeOptions={typeOptions}
                            onTypeChange={handleTypeChange}
                            onSubmitSuccess={
                                isProcessParameter
                                    ? handleProcessParameterSubmitSuccess
                                    : handleOpennessSubmitSuccess
                            }
                            standaloneSection
                            savedVersionsTargetId=""
                        />
                    ) : (
                        <div className="p-5">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                No accessible input screens are available for this department.
                            </div>
                        </div>
                    )}

                    {validationMessage ? (
                        <div className="px-5 pb-4">
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
                                {validationMessage}
                            </div>
                        </div>
                    ) : null}

                    <Footer
                        onBack={() => router.push("/departments/quality-control")}
                        onClear={isAfis6Cotton ? handleAfis6Clear : isAfis6Mmf ? handleAfis6MmfClear : handleClear}
                        onSave={isAfis6Cotton ? openAfis6Preview : isAfis6Mmf ? openAfis6MmfPreview : openPreview}
                        saveLabel={actionLoading ? "Submitting..." : "Save Record"}
                        disabled={actionLoading || entryIdLoading}
                    />
                </div>
            </div>

            <PreviewModal
                open={showPreview}
                title="Quality Control - Mixing Notebook"
                subtitle="Preview"
                items={previewItems}
                typeValue={selectedTypeName}
                onCancel={() => setShowPreview(false)}
                onConfirm={confirmSubmit}
                confirmLabel="Submit"
            />

            <SuccessModal
                open={showSuccess}
                message="Data Submitted"
                typeValue={selectedTypeName}
                onClose={handleSuccessClose}
                closeLabel="OK"
            />
        </div>
    );
}

export default Mixing;


