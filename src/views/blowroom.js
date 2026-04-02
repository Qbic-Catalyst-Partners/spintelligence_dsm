import React, { useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";
import CustomInput from "@/components/CustomInput";
import Footer from "@/components/Footer";
import BlowRoomSync from "./blowroom/BlowRoomSync";
import BrWasteStudyEntry from "./blowroom/brWasteStudyEntry";
import DropTestDataEntry from "./blowroom/dropTestDataEntry";

const blowroomTypes = [
  { id: 1, name: "Blow Room Sync", component: BlowRoomSync, needsLotNo: false },
  { id: 2, name: "BR Waste Study Entry", component: BrWasteStudyEntry, needsLotNo: true },
  { id: 3, name: "Drop Test Data Entry", component: DropTestDataEntry, needsLotNo: true },
];

const today = new Date().toISOString().split("T")[0];

function BlowRoom() {
  const router = useRouter();
  const childRef = useRef(null);
  const [selectedTypeName, setSelectedTypeName] = useState("Blow Room Sync");
  const [date, setDate] = useState(today);
  const [lotNo, setLotNo] = useState("");

  const mixingState = useSelector((state) => state.mixing);
  const blowroomState = useSelector((state) => state.blowroom);

  const selectedType = useMemo(
    () => blowroomTypes.find((item) => item.name === selectedTypeName),
    [selectedTypeName]
  );
  const SelectedComponent = selectedType?.component ?? null;

  const actionLoading =
    selectedTypeName === "Blow Room Sync"
      ? blowroomState?.loading
      : mixingState?.actionLoading;
  const isSyncType = selectedTypeName === "Blow Room Sync";
  const isDropTestType = selectedTypeName === "Drop Test Data Entry";

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
          <span className="text-slate-900 font-semibold">Blow Room Notebook QC</span>
        </div>

        <div className="mb-5">
          <h1 className="text-[24px] font-extrabold text-slate-900 m-0">
            Quality Control - Blow Room Notebook
          </h1>
          <p className="text-[14px] text-slate-500 mt-1.5 mb-0">
            Record and manage blow room quality inspections.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[#3d539f] text-xl leading-none">
                <MdOutlineEditNote />
              </span>
              <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
            </div>

            <div className="flex flex-col gap-4">
              {!isSyncType && !isDropTestType && (
                <div className={`grid gap-[18px] ${selectedType?.needsLotNo ? "grid-cols-3" : "grid-cols-2"}`}>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[14px] font-semibold text-slate-700">Type</label>
                    <select
                      className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                      value={selectedTypeName}
                      onChange={(e) => setSelectedTypeName(e.target.value)}
                    >
                      {blowroomTypes.map((item) => (
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

                  {selectedType?.needsLotNo && (
                    <CustomInput
                      label="Lot No"
                      placeholder="Enter Lot Number"
                      value={lotNo}
                      onChange={(value) => setLotNo(value)}
                    />
                  )}
                </div>
              )}

              {SelectedComponent && (
                <SelectedComponent
                  ref={childRef}
                  date={date}
                  lotNo={lotNo}
                  selectedTypeName={selectedTypeName}
                  onTypeChange={setSelectedTypeName}
                  onDateChange={setDate}
                  onLotNoChange={setLotNo}
                />
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

export default BlowRoom;
