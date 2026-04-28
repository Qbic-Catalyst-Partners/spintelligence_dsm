import React, { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/router";
import CottonHVIDataEntry from "./mixing/cottonHVIDataEntry";
import FibreDataEntry from "./mixing/fibreDataEntry";
import CustomInput from "@/components/CustomInput";
import AfisDataEntry from "./mixing/afisDataEntry";
import MoistureDataEntry from "./mixing/moistureDataEntry";
import OpennessDataEntry from "./mixing/opennessDataEntry";
import ProcessParameterDataEntry from "./mixing/processParameterDataEntry";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { clearMixingState } from "@/store/slices/mixing";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";

const mixingDepartmentTypes = [
    { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry, needsLotNo: false },
    { id: 1, name: "Cotton HVI Data Entry", aliases: ["Cotton HVI Data Entry", "Cotton HVI"], component: CottonHVIDataEntry, needsLotNo: true },
    { id: 2, name: "Fibre Data Entry", aliases: ["Fibre Data Entry", "Fiber Data Entry"], component: FibreDataEntry, needsLotNo: true },
    { id: 3, name: "AFIS Data Entry", aliases: ["AFIS Data Entry", "Afis Data Entry"], component: AfisDataEntry, needsLotNo: true },
    { id: 4, name: "Moisture Data Entry", aliases: ["Moisture Data Entry"], component: MoistureDataEntry, needsLotNo: true },
    { id: 5, name: "Openness Data Entry", aliases: ["Openness Data Entry"], component: OpennessDataEntry, needsLotNo: false },
];

export const MIXING_INPUT_SCREEN_COUNT = mixingDepartmentTypes.length;

const getCurrentDate = () => new Date().toISOString().split("T")[0];

function Mixing() {
    const router = useRouter();
    const childRef = useRef(null);
    const dispatch = useDispatch();
    const { actionLoading, actionSuccess } = useSelector((state) => state.mixing);
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const currentDate = getCurrentDate();
    const typeOptions = filterOptionsByDepartmentAccess(
        mixingDepartmentTypes,
        accessByDepartment,
        user,
        "Mixing"
    );
    const [selectedTypeName, setSelectedTypeName] = useState(typeOptions[0]?.name || "");
    const [date, setDate] = useState(getCurrentDate);
    const [lotNo, setLotNo] = useState("");
    const [mixingValue, setMixingValue] = useState("");
    const [headerErrors, setHeaderErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [validationMessage, setValidationMessage] = useState("");

    const selectedType = typeOptions.find((item) => item.name === selectedTypeName) || null;
    const SelectedComponent = selectedType?.component ?? null;
    const isProcessParameter = selectedTypeName === "Process Parameter";

    useEffect(() => {
        if (!typeOptions.some((item) => item.name === selectedTypeName)) {
            setSelectedTypeName(typeOptions[0]?.name || "");
        }
    }, [selectedTypeName, typeOptions]);

    useEffect(() => {
        if (actionSuccess) {
            setShowSuccess(true);
        }
    }, [actionSuccess]);

    useEffect(() => {
        setDate(getCurrentDate());
    }, [router.asPath]);

    const handleDateChange = (value) => {
        const nextDate = getCurrentDate();
        setDate(value === nextDate ? value : nextDate);
        setHeaderErrors((prev) => {
            if (!prev.date) return prev;
            const next = { ...prev };
            delete next.date;
            return next;
        });
    };

    const handleTypeChange = (value) => {
        setSelectedTypeName(value);
        setLotNo("");
        setMixingValue("");
        setHeaderErrors({});
        setValidationMessage("");
        childRef.current?.clear?.();
    };

    const handleClear = () => {
        setDate(getCurrentDate());
        setLotNo("");
        setMixingValue("");
        setHeaderErrors({});
        setValidationMessage("");
        childRef.current?.clear?.();
    };

    const buildHeaderPreview = () => {
        const list = [
            { label: "Type", value: selectedTypeName },
        ];
        if (!isProcessParameter) {
            list.push({ label: "Date", value: date });
        }
        if (selectedType?.needsLotNo !== false) {
            list.push({ label: "Lot No", value: lotNo });
        }
        if (selectedTypeName === "Openness Data Entry") {
            list.push({ label: "Mixing", value: mixingValue });
        }
        return list;
    };

    const openPreview = () => {
        const errors = {};
        if (!isProcessParameter && !date) errors.date = true;
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

    const confirmSubmit = () => {
        setShowPreview(false);
        childRef.current?.submit?.();
    };

    const handleSuccessClose = () => {
        setShowSuccess(false);
        dispatch(clearMixingState());
    };

    const handleOpennessSubmitSuccess = () => {
        setShowSuccess(true);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex justify-center">
            <div className="w-full max-w-5xl pt-8 px-4 pb-8">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                    <button type="button" className="transition-colors hover:text-[#3d539f]" onClick={() => router.push("/")}>
                        Home
                    </button>
                    <span>&rsaquo;</span>
                    <button type="button" className="transition-colors hover:text-[#3d539f]" onClick={() => router.push("/departments")}>
                        Dashboard
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className="transition-colors hover:text-[#3d539f]"
                        onClick={() => router.push("/departments/quality-control")}
                    >
                        Quality Control
                    </button>
                    <span>&rsaquo;</span>
                    <span className="text-slate-900 font-semibold">Mixing Notebook QC</span>
                </div>

                <div className="mb-5">
                    <h1 className="text-[24px] font-extrabold text-slate-900 m-0">
                        Quality Control - Mixing Notebook
                    </h1>
                    <p className="text-[14px] text-slate-500 mt-1.5 mb-0">
                        Record and manage industrial machine quality inspections.
                    </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200">
                    {!isProcessParameter ? (
                        <div className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-[#3d539f] text-xl leading-none">&#8801;&#9998;</span>
                                <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
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
                                        label="Date"
                                        type="date"
                                        value={date}
                                        onChange={handleDateChange}
                                        error={headerErrors.date}
                                        min={currentDate}
                                        max={currentDate}
                                    />

                                    {selectedType?.needsLotNo !== false && (
                                        <CustomInput
                                            label="Lot No"
                                            placeholder="Enter Lot Number"
                                            value={lotNo}
                                            onChange={(value) => setLotNo(value)}
                                            error={headerErrors.lotNo}
                                        />
                                    )}
                                </div>

                                {SelectedComponent ? (
                                    <SelectedComponent
                                        ref={childRef}
                                        date={date}
                                        lotNo={lotNo}
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
                        disabled={actionLoading}
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
            />
        </div>
    );
}

export default Mixing;
