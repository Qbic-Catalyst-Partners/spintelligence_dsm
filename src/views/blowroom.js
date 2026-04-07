import React, { useMemo, useRef, useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";
import CustomInput from "@/components/CustomInput";
import Footer from "@/components/Footer";
import BlowRoomSync from "./blowroom/BlowRoomSync";
import BrWasteStudyEntry from "./mixing/brWasteStudyEntry";
import DropTestDataEntry from "./blowroom/dropTestDataEntry";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { resetState as resetBlowroom } from "@/store/slices/blowroomSlice";

const blowroomTypes = [
  { id: 1, name: "Blow Room Sync", component: BlowRoomSync, needsLotNo: false },
  { id: 2, name: "BR Waste Study Entry", component: BrWasteStudyEntry, needsLotNo: true },
  { id: 3, name: "Drop Test Data Entry", component: DropTestDataEntry, needsLotNo: true },
];

export const BLOWROOM_INPUT_SCREEN_COUNT = blowroomTypes.length;

const today = new Date().toISOString().split("T")[0];

function BlowRoom() {
  const router = useRouter();
  const dispatch = useDispatch();
  const childRef = useRef(null);
  const [selectedTypeName, setSelectedTypeName] = useState("Blow Room Sync");
  const [date, setDate] = useState(today);
  const [lotNo, setLotNo] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [headerErrors, setHeaderErrors] = useState({});
  const [validationMessage, setValidationMessage] = useState("");

  const blowroomState = useSelector((state) => state.blowroom);

  const selectedType = useMemo(
    () => blowroomTypes.find((item) => item.name === selectedTypeName),
    [selectedTypeName]
  );
  const SelectedComponent = selectedType?.component ?? null;

  const actionLoading = blowroomState?.loading;

  useEffect(() => {
    if (blowroomState?.success) {
      setShowSuccess(true);
    }
  }, [blowroomState?.success]);

  const validateHeader = () => {
    const errs = {};
    if (selectedType?.needsLotNo && !lotNo) errs.lotNo = true;
    if (!date) errs.date = true;
    setHeaderErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openPreview = () => {
    const headerValid = validateHeader();
    const childValid = childRef.current?.validate ? childRef.current.validate() : true;
    if (!headerValid || childValid === false) {
      setValidationMessage("Please fill all required fields before saving.");
      return;
    }
    setValidationMessage("");

    if (!childRef.current?.getPreviewData) {
      childRef.current?.submit?.();
      return;
    }
    const headerItems = [
      { label: "Type", value: selectedTypeName },
      { label: "Date", value: date },
    ];
    if (selectedType?.needsLotNo) headerItems.push({ label: "Lot No", value: lotNo });
    const childItems = childRef.current.getPreviewData() || [];
    setPreviewItems([...headerItems, ...childItems]);
    setShowPreview(true);
  };

  const confirmSubmit = async () => {
    setShowPreview(false);
    try {
      await childRef.current?.submit?.();
      setShowSuccess(true);
    } catch (e) {
      // submission error handled by slices/toasts; keep modal closed
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    dispatch(resetBlowroom());
  };
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
                      style={{ backgroundColor: "#f1f5f9" }}
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
                error={headerErrors.date}
              />

              {selectedType?.needsLotNo && (
                <CustomInput
                  label="Lot No"
                  placeholder="Enter Lot Number"
                  value={lotNo}
                  onChange={(value) => setLotNo(value)}
                  error={headerErrors.lotNo}
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
                  typeOptions={blowroomTypes}
                  onTypeChange={setSelectedTypeName}
                  onDateChange={setDate}
                  onLotNoChange={setLotNo}
                />
              )}
            </div>
          </div>

          {validationMessage ? (
            <div className="px-5 pb-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
                {validationMessage}
              </div>
            </div>
          ) : null}

          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={() => {
              setValidationMessage("");
              childRef.current?.clear();
            }}
            onSave={openPreview}
            saveLabel={actionLoading ? "Saving..." : "Save Record"}
            disabled={actionLoading}
          />
        </div>
      </div>

      <PreviewModal
        open={showPreview}
        title="Quality Control - Blow Room Notebook"
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

export default BlowRoom;
