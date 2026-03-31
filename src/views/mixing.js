import React, { useState, useRef } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/router";
import CottonHVIDataEntry from "./mixing/cottonHVIDataEntry";
import FibreDataEntry from "./mixing/fibreDataEntry";
import CustomInput from "@/components/CustomInput";
import AfisDataEntry from "./mixing/afisDataEntry";
import MoistureDataEntry from "./mixing/moistureDataEntry";
import BrWasteStudyEntry from "./mixing/brWasteStudyEntry";
import DropTestDataEntry from "./mixing/dropTestDataEntry";
import Footer from "@/components/Footer";

const mixingDepartmentTypes = [
    { id: 1, name: "Cotton HVI Data Entry", component: CottonHVIDataEntry },
    { id: 2, name: "Fibre Data Entry", component: FibreDataEntry },
    { id: 3, name: "AFIS Data Entry", component: AfisDataEntry },
    { id: 4, name: "Moisture Data Entry", component: MoistureDataEntry },
    { id: 5, name: "BR Waste Study Entry", component: BrWasteStudyEntry },
    { id: 6, name: "Drop Test Data Entry", component: DropTestDataEntry },
];

const today = new Date().toISOString().split("T")[0];

function Mixing() {
    const router = useRouter();
    const childRef = useRef(null);
    const { actionLoading, error } = useSelector((state) => state.mixing);

    const [selectedTypeName, setSelectedTypeName] = useState("Cotton HVI Data Entry");
    const [date, setDate] = useState(today);
    const [lotNo, setLotNo] = useState("");

    const selectedType = mixingDepartmentTypes.find((item) => item.name === selectedTypeName);
    const SelectedComponent = selectedType?.component ?? null;

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
                    <h1 className="text-[26px] font-extrabold text-slate-900 m-0">
                        Quality Control - Mixing Notebook
                    </h1>
                    <p className="text-[13px] text-slate-500 mt-1.5 mb-0">
                        Record and manage industrial machine quality inspections.
                    </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200">
                    <div className="p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-[#3d539f] text-xl leading-none">&#8801;&#9998;</span>
                            <span className="text-[15px] font-bold text-slate-900">Inspection Data Entry</span>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-[18px]">
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <label className="text-xs font-semibold text-slate-700">Type</label>
                                    <select
                                        className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
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

                                <CustomInput
                                    label="Date"
                                    type="date"
                                    value={date}
                                    onChange={(value) => setDate(value)}
                                />

                                <CustomInput
                                    label="Lot No"
                                    placeholder="Enter Lot Number"
                                    value={lotNo}
                                    onChange={(value) => setLotNo(value)}
                                />
                            </div>

                            {SelectedComponent && (
                                <SelectedComponent ref={childRef} date={date} lotNo={lotNo} />
                            )}
                        </div>
                    </div>

                    <Footer
                        onBack={() => router.push("/dashboard")}
                        onClear={() => childRef.current?.clear()}
                        onSave={() => childRef.current?.submit()}
                        saveLabel={actionLoading ? "Saving..." : "Save Record"}
                        disabled={actionLoading}
                    />
                </div>
            </div>
        </div>
    );
}

export default Mixing;
