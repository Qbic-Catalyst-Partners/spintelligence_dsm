import { useEffect, useState } from "react";
import CustomInput from "@/components/CustomInput";
import {
    fetchNotebookCustomFieldsApi,
    fetchNotebookCustomFieldValuesApi,
} from "@/apis/notebookCustomFieldsApi";

// Renders active custom fields defined for a department/sub-department/notebook via the
// New Field Creation admin screen, and exposes their current values through onChange.
// entryId (when provided) preloads previously saved values for that row.
const NotebookCustomFields = ({ department, subDepartment, notebook, entryId, values, onChange, onFieldsLoaded }) => {
    const [fields, setFields] = useState([]);

    useEffect(() => {
        let cancelled = false;
        if (!department || !subDepartment || !notebook) {
            setFields([]);
            onFieldsLoaded?.([]);
            return undefined;
        }
        fetchNotebookCustomFieldsApi({
            department,
            sub_department: subDepartment,
            notebook,
            status: "active",
        }).then((data) => {
            if (cancelled) return;
            const nextFields = Array.isArray(data?.fields) ? data.fields : [];
            setFields(nextFields);
            onFieldsLoaded?.(nextFields);
        }).catch(() => {
            if (!cancelled) {
                setFields([]);
                onFieldsLoaded?.([]);
            }
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [department, subDepartment, notebook]);

    useEffect(() => {
        let cancelled = false;
        if (!entryId || !fields.length) return undefined;
        fetchNotebookCustomFieldValuesApi(entryId).then((data) => {
            if (cancelled) return;
            const rows = Array.isArray(data?.values) ? data.values : [];
            rows.forEach((row) => onChange?.(row.custom_field_id, row.value ?? ""));
        }).catch(() => {});
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entryId, fields]);

    if (!fields.length) return null;

    return (
        <div className="mixx-row" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {fields.map((field) => {
                const value = values?.[field.id] ?? "";
                if (field.field_type === "dropdown") {
                    return (
                        <div key={field.id} className="flex flex-col gap-1.5 min-w-0 w-full" style={{ maxWidth: 220 }}>
                            <label className="text-[14px] font-semibold text-slate-700 truncate">{field.field_label}</label>
                            <select
                                className="w-full h-9.5 px-3 py-2 rounded-lg text-[14px] border border-slate-200 bg-slate-100"
                                value={value}
                                onChange={(event) => onChange?.(field.id, event.target.value)}
                            >
                                <option value="">Select</option>
                                {(field.field_options || []).map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                    );
                }
                return (
                    <CustomInput
                        key={field.id}
                        label={field.field_label}
                        type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                        value={value}
                        onChange={(v) => onChange?.(field.id, v)}
                    />
                );
            })}
        </div>
    );
};

export default NotebookCustomFields;
