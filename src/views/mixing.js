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
import { fetchMixingAfis6CottonEntries, fetchMixingAfis6MmfEntries } from "@/apis/mixing";
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
    const [headerErrors, setHeaderErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [validationMessage, setValidationMessage] = useState("");
    const [ocrBusy] = useState(false);
    const [pendingOcrValues, setPendingOcrValues] = useState(null);
    const [afis6Form, setAfis6Form] = useState({
        material_class: "",
        comment: "",
        total_nep_count_g: "",
        total_nep_mean_size_um: "",
        fiber_nep_count_g: "",
        fiber_nep_mean_size_um: "",
        scnep_count_g: "",
        scnep_mean_size_um: "",
        l_w_mm: "",
        l_w_cv: "",
        sfc_w_percent: "",
        uql_w_mm: "",
        l_n_mm: "",
        l_n_cv_percent: "",
        sfc_n_percent: "",
        five_pct_l_n_mm: "",
        fineness_mtex: "",
        maturity_ratio_mat1: "",
        ifc_percent: "",
    });
    const [afis6Errors, setAfis6Errors] = useState({});
    const [afis6Records, setAfis6Records] = useState([]);
    const [afis6RecordsLoading, setAfis6RecordsLoading] = useState(false);
    const [afis6RecordsError, setAfis6RecordsError] = useState("");
    const [afis6MmfForm, setAfis6MmfForm] = useState({
        material_class: "",
        comment: "",
        total_nep_count_g: "",
        total_nep_mean_size_um: "",
        cut_length_n_mm: "",
        l_n_cv_percent: "",
        sfc_n_percent: "",
        five_pct_l_n_mm: "",
        fineness_den: "",
        fineness_cv_percent: "",
        long_fiber_gt_46_80_percent: "",
        long_fiber_count_gt_46_80: "",
    });
    const [afis6MmfErrors, setAfis6MmfErrors] = useState({});
    const [afis6MmfRecords, setAfis6MmfRecords] = useState([]);
    const [afis6MmfRecordsLoading, setAfis6MmfRecordsLoading] = useState(false);
    const [afis6MmfRecordsError, setAfis6MmfRecordsError] = useState("");
    const currentDateLabel = useMemo(() => new Date().toLocaleDateString("en-IN"), []);

    const selectedType = typeOptions.find((item) => item.name === selectedTypeName) || null;
    const SelectedComponent = selectedType?.component ?? null;
    const isProcessParameter = selectedTypeName === "Process Parameter";
    const isAfis6Cotton = selectedTypeName === "AFIS-6 Cotton Data Entry";
    const isAfis6Mmf = selectedTypeName === "AFIS-6 MMF Data Entry";
    const shouldLoadLots = selectedType?.needsLotNo !== false && selectedTypeName !== "Openness Data Entry";
    const { lotOptions, lotOptionsError, loadingLotOptions } = useMixingLotOptions(
        shouldLoadLots ? selectedTypeName : ""
    );
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
        setHeaderErrors({});
        setValidationMessage("");
        childRef.current?.clear?.();
    };

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
        try {
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
                childRef,
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

    const afis6FieldDefs = [
        { key: "total_nep_count_g", label: "Total Nep Count / g" },
        { key: "total_nep_mean_size_um", label: "Total Nep Mean Size µm" },
        { key: "fiber_nep_count_g", label: "Fiber Nep Count / g" },
        { key: "fiber_nep_mean_size_um", label: "Fiber Nep Mean Size µm" },
        { key: "scnep_count_g", label: "SCNep Count / g" },
        { key: "scnep_mean_size_um", label: "SCNep Mean Size µm" },
        { key: "l_w_mm", label: "L(w) mm" },
        { key: "l_w_cv", label: "L(w) CV" },
        { key: "sfc_w_percent", label: "SFC(w) <12.70 mm %" },
        { key: "uql_w_mm", label: "UQL(w) mm" },
        { key: "l_n_mm", label: "L(n) mm" },
        { key: "l_n_cv_percent", label: "L(n) CV %" },
        { key: "sfc_n_percent", label: "SFC(n) <12.70 mm %" },
        { key: "five_pct_l_n_mm", label: "5% L(n) mm" },
        { key: "fineness_mtex", label: "Fineness mtex" },
        { key: "maturity_ratio_mat1", label: "Maturity ratio mat 1" },
        { key: "ifc_percent", label: "IFC %" },
    ];

    const handleAfis6Change = (key, value) => {
        const nextValue = afis6FieldDefs.some((field) => field.key === key)
            ? sanitizeNumericInput(value, { precision: 12, scale: 3 })
            : value;
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
            inspection_date: date || "",
            material_class: String(afis6Form.material_class || "").trim(),
            comment: String(afis6Form.comment || "").trim(),
            total_nep_count_g: normalizeNumeric(afis6Form.total_nep_count_g),
            total_nep_mean_size_um: normalizeNumeric(afis6Form.total_nep_mean_size_um),
            fiber_nep_count_g: normalizeNumeric(afis6Form.fiber_nep_count_g),
            fiber_nep_mean_size_um: normalizeNumeric(afis6Form.fiber_nep_mean_size_um),
            scnep_count_g: normalizeNumeric(afis6Form.scnep_count_g),
            scnep_mean_size_um: normalizeNumeric(afis6Form.scnep_mean_size_um),
            l_w_mm: normalizeNumeric(afis6Form.l_w_mm),
            l_w_cv: normalizeNumeric(afis6Form.l_w_cv),
            sfc_w_percent: normalizeNumeric(afis6Form.sfc_w_percent),
            uql_w_mm: normalizeNumeric(afis6Form.uql_w_mm),
            l_n_mm: normalizeNumeric(afis6Form.l_n_mm),
            l_n_cv_percent: normalizeNumeric(afis6Form.l_n_cv_percent),
            sfc_n_percent: normalizeNumeric(afis6Form.sfc_n_percent),
            five_pct_l_n_mm: normalizeNumeric(afis6Form.five_pct_l_n_mm),
            fineness_mtex: normalizeNumeric(afis6Form.fineness_mtex),
            maturity_ratio_mat1: normalizeNumeric(afis6Form.maturity_ratio_mat1),
            ifc_percent: normalizeNumeric(afis6Form.ifc_percent),
            machine_name: "AFIS-6",
            department: "Mixing",
            sub_department: "Quality Control",
            user_name: user?.name || user?.user_name || user?.username || "",
        };

        return Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
        );
    };

    const refreshAfis6Records = useCallback(async () => {
        setAfis6RecordsLoading(true);
        setAfis6RecordsError("");

        try {
            const response = await fetchMixingAfis6CottonEntries({ limit: 10 });
            const rows = Array.isArray(response?.data)
                ? response.data
                : Array.isArray(response?.records)
                    ? response.records
                    : Array.isArray(response)
                        ? response
                        : [];
            setAfis6Records(rows);
        } catch (error) {
            setAfis6RecordsError(error?.message || "Failed to load AFIS-6 Cotton entries.");
            setAfis6Records([]);
        } finally {
            setAfis6RecordsLoading(false);
        }
    }, []);

    const handleAfis6Clear = () => {
        setAfis6Form({
            material_class: "",
            comment: "",
            total_nep_count_g: "",
            total_nep_mean_size_um: "",
            fiber_nep_count_g: "",
            fiber_nep_mean_size_um: "",
            scnep_count_g: "",
            scnep_mean_size_um: "",
            l_w_mm: "",
            l_w_cv: "",
            sfc_w_percent: "",
            uql_w_mm: "",
            l_n_mm: "",
            l_n_cv_percent: "",
            sfc_n_percent: "",
            five_pct_l_n_mm: "",
            fineness_mtex: "",
            maturity_ratio_mat1: "",
            ifc_percent: "",
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
        await refreshAfis6Records();
        handleAfis6Clear();
        showSuccessOnce();
    };

    useEffect(() => {
        if (!isAfis6Cotton) return undefined;
        refreshAfis6Records();
    }, [isAfis6Cotton, refreshAfis6Records, showSuccess]);

    const afis6MmfFieldDefs = [
        { key: "total_nep_count_g", label: "Total Nep Count / g" },
        { key: "total_nep_mean_size_um", label: "Total Nep Mean Size µm" },
        { key: "cut_length_n_mm", label: "Cut Length (n) mm" },
        { key: "l_n_cv_percent", label: "L(n) CV %" },
        { key: "sfc_n_percent", label: "SFC(n) <12.70 mm %" },
        { key: "five_pct_l_n_mm", label: "5% L(n) mm" },
        { key: "fineness_den", label: "Fineness den" },
        { key: "fineness_cv_percent", label: "Fineness CV %" },
        { key: "long_fiber_gt_46_80_percent", label: "Long Fiber >46.80 mm %" },
        { key: "long_fiber_count_gt_46_80", label: "Long Fiber Count > 46.80 mm" },
    ];

    const handleAfis6MmfChange = (key, value) => {
        const nextValue = afis6MmfFieldDefs.some((field) => field.key === key)
            ? sanitizeNumericInput(value, { precision: 12, scale: 3 })
            : value;
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
            inspection_date: date || "",
            material_class: String(afis6MmfForm.material_class || "").trim(),
            comment: String(afis6MmfForm.comment || "").trim(),
            total_nep_count_g: normalizeNumeric(afis6MmfForm.total_nep_count_g),
            total_nep_mean_size_um: normalizeNumeric(afis6MmfForm.total_nep_mean_size_um),
            cut_length_n_mm: normalizeNumeric(afis6MmfForm.cut_length_n_mm),
            l_n_cv_percent: normalizeNumeric(afis6MmfForm.l_n_cv_percent),
            sfc_n_percent: normalizeNumeric(afis6MmfForm.sfc_n_percent),
            five_pct_l_n_mm: normalizeNumeric(afis6MmfForm.five_pct_l_n_mm),
            fineness_den: normalizeNumeric(afis6MmfForm.fineness_den),
            fineness_cv_percent: normalizeNumeric(afis6MmfForm.fineness_cv_percent),
            long_fiber_gt_46_80_percent: normalizeNumeric(afis6MmfForm.long_fiber_gt_46_80_percent),
            long_fiber_count_gt_46_80: normalizeNumeric(afis6MmfForm.long_fiber_count_gt_46_80),
            machine_name: "AFIS-6",
            department: "Mixing",
            sub_department: "Quality Control",
            user_name: user?.name || user?.user_name || user?.username || "",
        };

        return Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
        );
    };

    const refreshAfis6MmfRecords = useCallback(async () => {
        setAfis6MmfRecordsLoading(true);
        setAfis6MmfRecordsError("");

        try {
            const response = await fetchMixingAfis6MmfEntries({ limit: 10 });
            const rows = Array.isArray(response?.data)
                ? response.data
                : Array.isArray(response?.records)
                    ? response.records
                    : Array.isArray(response)
                        ? response
                        : [];
            setAfis6MmfRecords(rows);
        } catch (error) {
            setAfis6MmfRecordsError(error?.message || "Failed to load AFIS-6 MMF entries.");
            setAfis6MmfRecords([]);
        } finally {
            setAfis6MmfRecordsLoading(false);
        }
    }, []);

    const handleAfis6MmfClear = () => {
        setAfis6MmfForm({
            material_class: "",
            comment: "",
            total_nep_count_g: "",
            total_nep_mean_size_um: "",
            cut_length_n_mm: "",
            l_n_cv_percent: "",
            sfc_n_percent: "",
            five_pct_l_n_mm: "",
            fineness_den: "",
            fineness_cv_percent: "",
            long_fiber_gt_46_80_percent: "",
            long_fiber_count_gt_46_80: "",
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
        await refreshAfis6MmfRecords();
        handleAfis6MmfClear();
        showSuccessOnce();
    };

    useEffect(() => {
        if (!isAfis6Mmf) return undefined;
        refreshAfis6MmfRecords();
    }, [isAfis6Mmf, refreshAfis6MmfRecords, showSuccess]);

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
                                        <CustomInput
                                            label="Actual Specific Volume (Target)"
                                            placeholder="1.0"
                                            value={target}
                                            onChange={handleTargetChange}
                                            error={headerErrors.target}
                                            numericConfig={{ precision: 20, scale: 10 }}
                                        />
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
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Material Class</label>
                                    <input
                                        placeholder="Enter Material Class"
                                        value={afis6Form.material_class}
                                        onChange={(e) => handleAfis6Change("material_class", e.target.value)}
                                        className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6Errors.material_class ? "border-red-500" : "border-slate-200"}`}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Comment</label>
                                    <input
                                        placeholder="Enter Comment"
                                        value={afis6Form.comment}
                                        onChange={(e) => handleAfis6Change("comment", e.target.value)}
                                        className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6Errors.comment ? "border-red-500" : "border-slate-200"}`}
                                    />
                                </div>
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

                            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <h4 className="text-[15px] font-semibold text-slate-800">Submitted Records</h4>
                                    {afis6RecordsLoading ? (
                                        <span className="text-sm text-slate-500">Loading...</span>
                                    ) : null}
                                </div>
                                {afis6RecordsError ? (
                                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                        {afis6RecordsError}
                                    </div>
                                ) : null}
                                <div className="overflow-x-auto">
                                    <table className="min-w-full border-collapse text-[12px] text-slate-700">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                                                <th className="px-2 py-2 font-semibold">Inspection Date</th>
                                                <th className="px-2 py-2 font-semibold">Material Class</th>
                                                <th className="px-2 py-2 font-semibold">Comment</th>
                                                <th className="px-2 py-2 font-semibold">Entry ID</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {afis6Records.length ? (
                                                afis6Records.map((record, index) => (
                                                    <tr key={`${record.entry_id || record.id || index}`} className="border-b border-slate-100 last:border-b-0">
                                                        <td className="px-2 py-2">{record.inspection_date || record.inspectionDate || "-"}</td>
                                                        <td className="px-2 py-2">{record.material_class || record.materialClass || "-"}</td>
                                                        <td className="px-2 py-2">{record.comment || "-"}</td>
                                                        <td className="px-2 py-2">{record.entry_id || record.entryId || record.id || "-"}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                                                        No AFIS-6 Cotton records available.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
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
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Material Class</label>
                                    <input
                                        placeholder="Enter Material Class"
                                        value={afis6MmfForm.material_class}
                                        onChange={(e) => handleAfis6MmfChange("material_class", e.target.value)}
                                        className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6MmfErrors.material_class ? "border-red-500" : "border-slate-200"}`}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-[14px] font-semibold text-slate-700">Comment</label>
                                    <input
                                        placeholder="Enter Comment"
                                        value={afis6MmfForm.comment}
                                        onChange={(e) => handleAfis6MmfChange("comment", e.target.value)}
                                        className={`h-[38px] px-3 py-2 border rounded-lg bg-slate-50 text-[14px] ${afis6MmfErrors.comment ? "border-red-500" : "border-slate-200"}`}
                                    />
                                </div>
                                {afis6MmfFieldDefs.map((field) => (
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

                            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <h4 className="text-[15px] font-semibold text-slate-800">Submitted Records</h4>
                                    {afis6MmfRecordsLoading ? (
                                        <span className="text-sm text-slate-500">Loading...</span>
                                    ) : null}
                                </div>
                                {afis6MmfRecordsError ? (
                                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                        {afis6MmfRecordsError}
                                    </div>
                                ) : null}
                                <div className="overflow-x-auto">
                                    <table className="min-w-full border-collapse text-[12px] text-slate-700">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                                                <th className="px-2 py-2 font-semibold">Inspection Date</th>
                                                <th className="px-2 py-2 font-semibold">Material Class</th>
                                                <th className="px-2 py-2 font-semibold">Comment</th>
                                                <th className="px-2 py-2 font-semibold">Entry ID</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {afis6MmfRecords.length ? (
                                                afis6MmfRecords.map((record, index) => (
                                                    <tr key={`${record.entry_id || record.id || index}`} className="border-b border-slate-100 last:border-b-0">
                                                        <td className="px-2 py-2">{record.inspection_date || record.inspectionDate || "-"}</td>
                                                        <td className="px-2 py-2">{record.material_class || record.materialClass || "-"}</td>
                                                        <td className="px-2 py-2">{record.comment || "-"}</td>
                                                        <td className="px-2 py-2">{record.entry_id || record.entryId || record.id || "-"}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                                                        No AFIS-6 MMF records available.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
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
                            savedVersionsTargetId="mixing-process-parameter-saved-versions"
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
                        onSave={isAfis6Cotton ? handleAfis6Submit : isAfis6Mmf ? handleAfis6MmfSubmit : openPreview}
                        saveLabel={actionLoading ? "Submitting..." : "Save Record"}
                        disabled={actionLoading || entryIdLoading}
                    />
                </div>

                {isProcessParameter && SelectedComponent ? (
                    <div id="mixing-process-parameter-saved-versions" className="mt-5" />
                ) : null}
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


