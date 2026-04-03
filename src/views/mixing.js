import React, { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/router";
import CottonHVIDataEntry from "./mixing/cottonHVIDataEntry";
import FibreDataEntry from "./mixing/fibreDataEntry";
import CustomInput from "@/components/CustomInput";
import AfisDataEntry from "./mixing/afisDataEntry";
import MoistureDataEntry from "./mixing/moistureDataEntry";
import OpennessDataEntry from "./mixing/opennessDataEntry";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { clearMixingState } from "@/store/slices/mixing";

const mixingDepartmentTypes = [
    { id: 1, name: "Cotton HVI Data Entry", component: CottonHVIDataEntry, needsLotNo: true },
    { id: 2, name: "Fibre Data Entry", component: FibreDataEntry, needsLotNo: true },
    { id: 3, name: "AFIS Data Entry", component: AfisDataEntry, needsLotNo: true },
    { id: 4, name: "Moisture Data Entry", component: MoistureDataEntry, needsLotNo: true },
    { id: 5, name: "Openness Data Entry", component: OpennessDataEntry, needsLotNo: false },
];

const today = new Date().toISOString().split("T")[0];

function Mixing() {
    const router = useRouter();
    const childRef = useRef(null);
    const dispatch = useDispatch();
    const { actionLoading, actionSuccess } = useSelector((state) => state.mixing);

    const [selectedTypeName, setSelectedTypeName] = useState("Cotton HVI Data Entry");
    const [date, setDate] = useState(today);
    const [lotNo, setLotNo] = useState("");
    const [mixingValue, setMixingValue] = useState("");
    const [headerErrors, setHeaderErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);

    const selectedType = mixingDepartmentTypes.find((item) => item.name === selectedTypeName);
    const SelectedComponent = selectedType?.component ?? null;

    useEffect(() => {
        if (actionSuccess) {
            setShowSuccess(true);
        }
    }, [actionSuccess]);

    const buildHeaderPreview = () => {
        const list = [
            { label: "Type", value: selectedTypeName },
            { label: "Date", value: date },
        ];
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
        if (!date) errors.date = true;
        if (selectedType?.needsLotNo !== false && !lotNo) errors.lotNo = true;
        if (selectedTypeName === "Openness Data Entry" && !mixingValue) errors.mixing = true;

        setHeaderErrors(errors);

        const childValid = childRef.current?.validate ? childRef.current.validate() : true;
        const hasErrors = Object.keys(errors).length > 0 || childValid === false;
        if (hasErrors) return;

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

    return (
        <div className="min-h-screen bg-slate-50 flex justify-center">
            <div className="w-full max-w-5xl pt-8 px-4 pb-8">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                    <button type="button" className="transition-colors hover:text-[#3d539f]" onClick={() => router.push("/")}>
                        Home
                    </button>
                    <span>&rsaquo;</span>
                    <button type="button" className="transition-colors hover:text-[#3d539f]" onClick={() => router.push("/dashboard")}>
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
                                        value={selectedTypeName}
                                        onChange={(e) => setSelectedTypeName(e.target.value)}
                                    >
                                        <option value="">Select Type</option>
                                        {mixingDepartmentTypes.map((item) => (
                                            <option key={item.id} value={item.name}>
                                                {item.name}
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
                    onChange={(value) => setDate(value)}
                    error={headerErrors.date}
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

                            {SelectedComponent && (
                                <SelectedComponent
                                    ref={childRef}
                                    date={date}
                                    lotNo={lotNo}
                                    mixing={mixingValue}
                                />
                            )}
                        </div>
                    </div>

                    <Footer
                        onBack={() => router.push("/dashboard")}
                        onClear={() => childRef.current?.clear()}
                        onSave={openPreview}
                        saveLabel={actionLoading ? "Saving..." : "Save Record"}
                        disabled={actionLoading}
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
            />
        </div>
    );
}

export default Mixing;
