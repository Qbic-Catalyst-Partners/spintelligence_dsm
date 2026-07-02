import React, { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/router";
import CottonHVIDataEntry from "./mixing/cottonHVIDataEntry";
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
import useMixingLotOptions from "@/hooks/useMixingLotOptions";
import { fetchMixingLotDetails } from "@/apis/mixing";

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
    {
        id: 1,
        name: "Cotton HVI Data Entry",
        aliases: ["Cotton HVI Data Entry", "Cotton HVI", "Cotton HVI Entry", "HVI"],
        component: CottonHVIDataEntry,
        needsLotNo: true,
    },
    {
        id: 2,
        name: "Fibre Data Entry",
        aliases: ["Fibre Data Entry", "Fiber Data Entry", "Fibre"],
        component: FibreDataEntry,
        needsLotNo: true,
    },
    {
        id: 3,
        name: "AFIS Data Entry",
        aliases: ["AFIS Data Entry", "Afis Data Entry", "AFIS"],
        component: AfisDataEntry,
        needsLotNo: true,
    },
    {
        id: 4,
        name: "Moisture Data Entry",
        aliases: ["Moisture Data Entry", "Moisture"],
        component: MoistureDataEntry,
        needsLotNo: true,
    },
    {
        id: 5,
        name: "Openness Data Entry",
        aliases: ["Openness Data Entry", "Openness"],
        component: OpennessDataEntry,
        needsLotNo: false,
    },
];

export const MIXING_INPUT_SCREEN_COUNT = mixingDepartmentTypes.length;

const getCurrentDate = () => new Date().toISOString().split("T")[0];
const normalizeTypeName = (value = "") => String(value).trim().toLowerCase();
const MIXING_ENTRY_ID_CONFIG = {
    "Cotton HVI Data Entry": { prefix: "COT", width: 4, routePath: "/mixing/cotton-hvi" },
    "Fibre Data Entry": { prefix: "FIB", width: 4, routePath: "/mixing/fibre" },
    "AFIS Data Entry": { prefix: "AFI", width: 4, routePath: "/mixing/afis" },
    "Moisture Data Entry": { prefix: "MOI", width: 4, routePath: "/mixing/moisture" },
    "Openness Data Entry": { prefix: "OPN", width: 4, routePath: "/mixing/openness" },
    "Process Parameter": { prefix: "MIX", width: 4, routePath: "/mixing/qc" },
};

const getEntryConfigForType = (typeName) =>
    MIXING_ENTRY_ID_CONFIG[typeName] || { prefix: "MIX" };

function Mixing() {
    const router = useRouter();
    const childRef = useRef(null);
    const successHandledRef = useRef(false);
    const dispatch = useDispatch();
    const { actionLoading, actionSuccess } = useSelector((state) => state.mixing);
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const currentDate = getCurrentDate();
    const requestedType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
    const isProcessParameterRequest = normalizeTypeName(requestedType) === "process parameter";
    const fullTypeOptions = filterOptionsByDepartmentAccess(
        mixingDepartmentTypes,
        accessByDepartment,
        user,
        "Mixing"
    );
    const typeOptions = isProcessParameterRequest
        ? fullTypeOptions
        : fullTypeOptions.filter((item) => item.name !== "Process Parameter");
    const [selectedTypeName, setSelectedTypeName] = useState(typeOptions[0]?.name || "");
    const [date, setDate] = useState(getCurrentDate);
    const [lotNo, setLotNo] = useState("");
    const [selectedLotDetails, setSelectedLotDetails] = useState(null);
    const [mixingValue, setMixingValue] = useState("");
    const [headerErrors, setHeaderErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [validationMessage, setValidationMessage] = useState("");
    const [ocrBusy] = useState(false);
    const [pendingOcrValues, setPendingOcrValues] = useState(null);
    const [currentDateLabel, setCurrentDateLabel] = useState("");

    const selectedType = typeOptions.find((item) => item.name === selectedTypeName) || null;
    const SelectedComponent = selectedType?.component ?? null;
    const isProcessParameter = selectedTypeName === "Process Parameter";
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
        const requested = normalizeTypeName(requestedType);
        const matchedType = typeOptions.find((item) =>
            [item.name, ...(item.aliases || [])].map(normalizeTypeName).includes(requested)
        );
        if (matchedType && matchedType.name !== selectedTypeName) {
            setSelectedTypeName(matchedType.name);
        }
    }, [requestedType, selectedTypeName, typeOptions]);

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
    }, [actionSuccess]);

    useEffect(() => {
        setDate(getCurrentDate());
    }, [router.asPath]);

    useEffect(() => {
        setCurrentDateLabel(new Date().toLocaleDateString("en-IN"));
    }, []);
    const handleTypeChange = (value) => {
        setSelectedTypeName(value);
        setLotNo("");
        setSelectedLotDetails(null);
        setMixingValue("");
        setHeaderErrors({});
        setValidationMessage("");
        childRef.current?.clear?.();
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
        setMixingValue("");
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
        if (selectedTypeName === "Openness Data Entry") {
            list.push({ label: "Mixing", value: mixingValue });
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
        if (selectedTypeName === "Openness Data Entry" && !mixingValue) errors.mixing = true;

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
          <div className="mt-2 text-right text-base font-semibold text-slate-600">Current Date: {currentDateLabel}</div>
                    <p className="text-[14px] text-slate-500 mt-1.5 mb-0">
                    </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200">
                    {!isProcessParameter ? (
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
                                <div className="grid grid-cols-3 gap-[18px]">
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

                                    {selectedTypeName === "Openness Data Entry" && (
                                        <CustomInput
                                            label="Mixing"
                                            placeholder="Enter Mixing"
                                            value={mixingValue}
                                            onChange={(value) => setMixingValue(value)}
                                            error={headerErrors.mixing}
                                        />
                                    )}

                                    <CustomInput
                                        label="Entry ID"
                                        value={entryId}
                                        onChange={() => {}}
                                        disabled
                                    />

                                    {selectedType?.needsLotNo !== false && (
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
                                    )}
                                </div>

                                {SelectedComponent ? (
                                    <SelectedComponent
                                        ref={childRef}
                                        date={date}
                                        entryId={entryId}
                                        lotNo={lotNo}
                                        selectedLotDetails={selectedLotDetails}
                                        mixing={mixingValue}
                                        selectedTypeName={selectedTypeName}
                                        typeOptions={typeOptions}
                                        onTypeChange={handleTypeChange}
                                        onSubmitSuccess={handleOpennessSubmitSuccess}
                                    />
                                ) : (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                        No accessible input screens are available for this department.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : SelectedComponent ? (
                        <SelectedComponent
                            ref={childRef}
                            date={date}
                            entryId={entryId}
                            lotNo={lotNo}
                            mixing={mixingValue}
                            selectedTypeName={selectedTypeName}
                            typeOptions={typeOptions}
                            onTypeChange={handleTypeChange}
                            onSubmitSuccess={handleOpennessSubmitSuccess}
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
                        onClear={handleClear}
                        onSave={openPreview}
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


