import React, { useMemo, useRef, useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";
import CustomInput from "@/components/CustomInput";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import Footer from "@/components/Footer";
import BlowRoomSync from "./blowroom/BlowRoomSync";
import BrWasteStudyEntry from "./mixing/brWasteStudyEntry";
import DropTestDataEntry from "./blowroom/dropTestDataEntry";
import ProcessParameter from "./blowroom/ProcessParameter";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { resetState as resetBlowroom } from "@/store/slices/blowroomSlice";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";

const blowroomTypes = [
  { id: 1, name: "Blow Room Sync", aliases: ["Blow Room Sync"], component: BlowRoomSync, needsLotNo: false },
  { id: 2, name: "Process Parameter", aliases: ["Process Parameter"], component: ProcessParameter, needsLotNo: false },
  { id: 3, name: "BR Waste Study Entry", aliases: ["BR Waste Study Entry", "Blow Room Waste Study Entry"], component: BrWasteStudyEntry, needsLotNo: false },
  { id: 4, name: "Drop Test Data Entry", aliases: ["Drop Test Data Entry", "Drop Test"], component: DropTestDataEntry, needsLotNo: true },
];

export const BLOWROOM_INPUT_SCREEN_COUNT = blowroomTypes.length;

const today = new Date().toISOString().split("T")[0];
const BLOWROOM_ENTRY_ID_CONFIG = {
  "Blow Room Sync": { prefix: "BRS", width: 4, routePath: "/blowroom/sync" },
  "Process Parameter": { prefix: "PP", width: 4, routePath: "/blowroom/header" },
  "BR Waste Study Entry": { prefix: "BWS", width: 4, routePath: "/blowroom/br-waste-study" },
  "Drop Test Data Entry": { prefix: "BDT", width: 4, routePath: "/blowroom/drop-test" },
};

const getBlowRoomEntryConfig = (typeName) =>
  BLOWROOM_ENTRY_ID_CONFIG[typeName] || { prefix: "BLR" };

const normalizeTypeName = (value = "") =>
  String(value).trim().toLowerCase();

function BlowRoom() {
  const currentDateLabel = new Date().toLocaleDateString("en-IN");
  const router = useRouter();
  const dispatch = useDispatch();
  const childRef = useRef(null);
  const successHandledRef = useRef(false);
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const requestedType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
  const isProcessParameterRequest = normalizeTypeName(requestedType) === "process parameter";
  const fullTypeOptions = useMemo(
    () =>
      filterOptionsByDepartmentAccess(
        blowroomTypes,
        accessByDepartment,
        user,
        "Blow Room"
      ),
    [accessByDepartment, user]
  );
  const typeOptions = useMemo(
    () => isProcessParameterRequest
      ? fullTypeOptions
      : fullTypeOptions.filter((item) => item.name !== "Process Parameter"),
    [fullTypeOptions, isProcessParameterRequest]
  );
  const [selectedTypeName, setSelectedTypeName] = useState(typeOptions[0]?.name || "");
  const [date, setDate] = useState(today);
  const [lotNo, setLotNo] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [headerErrors, setHeaderErrors] = useState({});
  const [validationMessage, setValidationMessage] = useState("");

  const blowroomState = useSelector((state) => state.blowroom);

  const selectedType = useMemo(
    () => typeOptions.find((item) => item.name === selectedTypeName) || null,
    [selectedTypeName, typeOptions]
  );
  const SelectedComponent = selectedType?.component ?? null;
  const { entryId, reserveEntryId } = useDatabaseEntryId({
    department: "Blow Room",
    typeName: selectedTypeName,
    config: getBlowRoomEntryConfig(selectedTypeName),
  });

  useEffect(() => {
    if (!typeOptions.some((item) => item.name === selectedTypeName)) {
      setSelectedTypeName(typeOptions[0]?.name || "");
    }
  }, [selectedTypeName, typeOptions]);

  useEffect(() => {
    if (!requestedType || !typeOptions.length) return;

    const normalizedRequest = normalizeTypeName(requestedType);
    const matchedType = typeOptions.find((item) => {
      const names = [item.name, ...(item.aliases || [])].map(normalizeTypeName);
      return names.includes(normalizedRequest);
    });

    if (matchedType && matchedType.name !== selectedTypeName) {
      setSelectedTypeName(matchedType.name);
    }
  }, [requestedType, selectedTypeName, typeOptions]);

  const actionLoading = blowroomState?.loading;

  const showSuccessOnce = () => {
    if (successHandledRef.current) return;
    successHandledRef.current = true;
    setShowSuccess(true);
  };

  useEffect(() => {
    if (blowroomState?.success) {
      showSuccessOnce();
    }
  }, [blowroomState?.success]);

  const validateHeader = () => {
    const errs = {};
    if (selectedType?.needsLotNo && selectedTypeName !== "Drop Test Data Entry" && !lotNo) errs.lotNo = true;
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
      { label: "Entry ID", value: entryId },
    ];
    if (selectedType?.needsLotNo && selectedTypeName !== "Drop Test Data Entry") {
      headerItems.push({ label: "Lot No", value: lotNo });
    }
    const childItems = childRef.current.getPreviewData() || [];
    setPreviewItems([...headerItems, ...childItems]);
    setShowPreview(true);
  };

  const confirmSubmit = async () => {
    setShowPreview(false);
    try {
      await childRef.current?.submit?.();
      await recordSubmittedNotebook({
        department: "Quality Control",
        subDepartment: "Blow Room",
        notebookName: selectedTypeName,
        entryId,
        lotNo,
        childRef,
        previewItems,
        user,
      });
      await reserveEntryId();
      showSuccessOnce();
    } catch (e) {
      // submission error is shown via the global error modal; refresh the
      // reserved entry ID so a duplicate-ID rejection doesn't repeat on retry
      await reserveEntryId();
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    successHandledRef.current = false;
    dispatch(resetBlowroom());
  };
  const isSyncType = selectedTypeName === "Blow Room Sync";
  const isDropTestType = selectedTypeName === "Drop Test Data Entry";
  const isProcessParameterType = selectedTypeName === "Process Parameter";
  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-7xl pt-8 px-4 pb-8">
        <div className="mb-5">
          <h1 className="text-[24px] font-extrabold text-slate-900 m-0">
            Quality Control - Blow Room Notebook
          </h1>
          <div className="mt-2 text-right text-base font-semibold text-slate-600">Current Date: {currentDateLabel}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[#3d539f] text-xl leading-none">
                  <MdOutlineEditNote />
                </span>
                <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
              </div>
              <InputScreenUploadButton />
            </div>

            <div className="flex flex-col gap-4">
              {!isSyncType && !isDropTestType && !isProcessParameterType && (
                <div className={`grid gap-[18px] ${selectedType?.needsLotNo ? "grid-cols-3" : "grid-cols-2"}`}>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[14px] font-semibold text-slate-700">Type</label>
                    <select
                      className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                      style={{ backgroundColor: "#f1f5f9" }}
                      value={selectedTypeName}
                      onChange={(e) => setSelectedTypeName(e.target.value)}
                    >
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

              {SelectedComponent ? (
                <SelectedComponent
                  ref={childRef}
                  date={date}
                  entryId={entryId}
                  lotNo={lotNo}
                  selectedTypeName={selectedTypeName}
                  typeOptions={typeOptions}
                  onTypeChange={setSelectedTypeName}
                  onDateChange={setDate}
                  onLotNoChange={setLotNo}
                  savedVersionsTargetId="blowroom-process-parameter-history"
                  postFooterPortalTargetId="blowroom-post-footer-slot"
                />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No accessible input screens are available for this department.
                </div>
              )}
            </div>
          </div>

          {validationMessage ? (
            <div className={isProcessParameterType ? "px-5 pt-6" : "px-5 pb-4"}>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
                {validationMessage}
              </div>
            </div>
          ) : null}

          {isProcessParameterType ? (
            <div className="mt-6 border-t border-slate-100 px-5 pt-4">
              <Footer
                onBack={() => router.push("/departments/quality-control")}
                onClear={() => {
                  setValidationMessage("");
                  childRef.current?.clear();
                }}
                onSave={openPreview}
                saveLabel={actionLoading ? "Saving..." : "Save Record"}
                disabled={actionLoading}
              />
            </div>
          ) : (
            <Footer
              onBack={() => router.push("/departments/quality-control")}
              onClear={() => {
                setValidationMessage("");
                childRef.current?.clear();
              }}
              onSave={openPreview}
              saveLabel={actionLoading ? "Saving..." : "Save Record"}
              disabled={actionLoading}
            />
          )}
        </div>

        <div id="blowroom-post-footer-slot" className="w-full max-w-7xl pt-5" />
        {isProcessParameterType ? (
          <div id="blowroom-process-parameter-history" className="w-full max-w-7xl pt-5" />
        ) : null}
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
        closeLabel="OK"
      />
    </div>
  );
}

export default BlowRoom;


