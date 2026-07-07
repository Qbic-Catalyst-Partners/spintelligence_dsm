import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";

import SuccessModal from "@/components/SuccessModal";
import {
  approveWheelChangeApproval,
  fetchPendingWheelChangeApprovals,
} from "@/apis/wheelChangeApprovals";
import { isWheelChangeApproverUser } from "@/utils/accessControl";

const trimValue = (value) => String(value ?? "").trim();

// The backend identifies the source table via `department` codes such as
// "type1"–"type4" (spinning wheel change tables); the raw code is still sent
// back on approve, but readers get a friendly department name.
const formatDepartmentLabel = (value) => {
  const normalized = trimValue(value).toLowerCase().replace(/[\s_-]+/g, "");
  if (/^(wheelchange)?type\d+$/.test(normalized) || /^sw\d+$/.test(normalized)) return "Spinning";
  return trimValue(value);
};

const formatCreatedOn = (value) => {
  if (!trimValue(value)) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return trimValue(value);
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} | ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const normalizeParameters = (item) => {
  const source = Array.isArray(item?.parameters)
    ? item.parameters
    : Array.isArray(item?.parameter_rows)
      ? item.parameter_rows
      : item?.rows && typeof item.rows === "object"
        ? Object.values(item.rows)
        : [];

  return source
    .map((row, index) => ({
      key: trimValue(row?.key) || `param-${index}`,
      label: trimValue(row?.label) || trimValue(row?.key) || `Parameter ${index + 1}`,
      value: trimValue(row?.proposed ?? row?.value ?? row?.existing ?? ""),
    }))
    .filter((row) => row.label);
};

const normalizeApprovalItem = (item, index) => ({
  id: trimValue(item?.id ?? item?.approval_id ?? item?.entry_id ?? index),
  department: trimValue(item?.department ?? item?.department_name ?? ""),
  title:
    trimValue(item?.title ?? item?.wheel_change_type_label ?? item?.type ?? "") || "Wheel Change",
  operator:
    trimValue(item?.operator ?? item?.operator_name ?? item?.user_name ?? item?.created_by ?? "") || "-",
  createdOn: item?.created_at ?? item?.created_on ?? item?.entry_date ?? "",
  remarks: trimValue(item?.remarks ?? item?.comment ?? ""),
  parameters: normalizeParameters(item),
});

const extractApprovalRows = (payload) => {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
  return rows.map(normalizeApprovalItem);
};

function WheelChangeApprovals() {
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const canApprove = isWheelChangeApproverUser(user);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [approving, setApproving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchPendingWheelChangeApprovals();
      setApprovals(extractApprovalRows(payload));
    } catch (err) {
      setError(err?.message || "Unable to load pending wheel change approvals.");
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated || !canApprove) return;
    loadApprovals();
  }, [canApprove, isHydrated, loadApprovals]);

  const handleApprove = async () => {
    if (!selected || approving) return;
    setApproving(true);
    setError("");
    try {
      await approveWheelChangeApproval(selected.id, { department: selected.department });
      setApprovals((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setShowSuccess(true);
    } catch (err) {
      setError(err?.message || "Unable to approve wheel change entry.");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-8">
        <h1 className="text-[18px] font-bold text-slate-900">Proposed Wheel Change Approvals</h1>

        {isHydrated && !canApprove ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
            Only L2 users can view and approve proposed wheel changes. Please contact your
            administrator if you need access.
          </div>
        ) : null}

        {error && canApprove ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3" hidden={isHydrated && !canApprove}>
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              Loading pending approvals...
            </div>
          ) : null}

          {!loading && !approvals.length ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              No wheel change entries are waiting for approval.
            </div>
          ) : null}

          {approvals.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-slate-900">{item.title}</div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {item.department ? `${formatDepartmentLabel(item.department)} Department` : "-"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-8">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Operator
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-slate-900">{item.operator}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Created On
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-slate-900">
                    {formatCreatedOn(item.createdOn)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold text-slate-900">{selected.title}</h2>
                <div className="mt-1 text-[12px] text-slate-500">
                  Quality Control &gt; {formatDepartmentLabel(selected.department) || "-"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-8">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Operator
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-slate-900">{selected.operator}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Created On
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-slate-900">
                    {formatCreatedOn(selected.createdOn)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {selected.parameters.map((row) => (
                <div
                  key={row.key}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="text-[10px] font-semibold text-slate-500">{row.label}</div>
                  <div className="mt-1 break-words text-[13px] font-bold text-slate-900">
                    {row.value || "-"}
                  </div>
                </div>
              ))}
              {selected.remarks ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
                  <div className="text-[10px] font-semibold text-slate-500">Remarks</div>
                  <div className="mt-1 break-words text-[13px] font-bold text-slate-900">
                    {selected.remarks}
                  </div>
                </div>
              ) : null}
              {!selected.parameters.length && !selected.remarks ? (
                <div className="text-sm text-slate-500 sm:col-span-2 lg:col-span-5">
                  No proposed values were captured for this entry.
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={approving}
                className="rounded-lg border border-slate-300 bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving}
                className="rounded-lg bg-[#3d539f] px-5 py-2 text-sm font-semibold text-white hover:bg-[#33468a] disabled:opacity-60"
              >
                {approving ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SuccessModal
        open={showSuccess}
        message="Wheel Change Approved"
        onClose={() => setShowSuccess(false)}
        closeLabel="OK"
      />
    </div>
  );
}

export default WheelChangeApprovals;
