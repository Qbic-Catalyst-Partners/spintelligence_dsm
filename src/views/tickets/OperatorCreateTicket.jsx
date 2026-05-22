import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { FiSave, FiX } from "react-icons/fi";

import { createOperatorTicket, submitManualTicketInputScreen } from "@/apis/operatorApi";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { sanitizeNumericInput } from "@/utils/inputValidation";

import styles from "../../styles/operator.module.css";

const initialForm = {
  departmentSlug: "quality-control",
  subDepartmentSlug: "mixing",
  inputScreen: "Process Parameter",
  machineName: "",
  parameterName: "",
  actualValue: "",
  standardValue: "",
  plusThreshold: "",
  minusThreshold: "",
  severity: "Low",
  description: "",
};

const COTTON_HVI_NUMERIC_FIELDS = new Set([
  "SCI",
  "Span Length (2.5%)",
  "Mic",
  "GTEX",
  "Maturity",
  "UR",
  "SFI",
  "Elongation",
  "Yellow + B",
  "Trash",
  "RD",
  "Colour Grade",
]);

const DATE_FIELDS = new Set(["Date", "Entry Date", "Invoice Date", "Inspection Date", "Record Date"]);

const SELECT_OPTIONS_BY_FIELD = {
  Variety: ["Bunny", "MCU5", "DCH32"],
};

const FIELD_PAYLOAD_KEYS = {
  "Invoice No": "invoice_no",
  "Invoice Date": "invoice_date",
  "Span Length (2.5%)": "span_length",
  "Yellow + B": "yellow_b",
  "Colour Grade": "colour_grade",
  "Machine No.": "machine_no",
  "MC No.": "mc_no",
  "MC Name": "mc_name",
  "U%": "u_percent",
  "CV%": "cv_percent",
  "No. of Readings": "no_of_readings",
  "S. No.": "serial_no",
  "Entry Date": "entry_date",
  "Record Date": "record_date",
};

const getCurrentTicketUser = () => {
  if (typeof window === "undefined") {
    return { userId: null, userName: null };
  }

  try {
    const rawUser = window.localStorage.getItem("authUser");
    const user = rawUser ? JSON.parse(rawUser) : null;

    return {
      userId:
        user?.id ||
        user?.user_id ||
        user?.userId ||
        user?.employee_id ||
        user?.employeeId ||
        null,
      userName:
        user?.full_name ||
        user?.fullName ||
        user?.name ||
        null,
    };
  } catch {
    return { userId: null, userName: null };
  }
};

const normalizeTicketIdForRoute = (ticketId) =>
  String(ticketId || "")
    .replace(/^#/, "")
    .trim();

const toSnakeKey = (value) =>
  String(value || "")
    .trim()
    .replace(/%/g, "percent")
    .replace(/\+/g, "plus")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const normalizePayloadValue = (value) => {
  const trimmedValue = String(value ?? "").trim();
  if (trimmedValue === "") return "";

  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(trimmedValue)
    ? numericValue
    : trimmedValue;
};

const resolveCreatedTicketId = (response) => {
  const ticket =
    response?.ticket ||
    response?.data?.ticket ||
    response?.data ||
    response;

  return (
    ticket?.ticket_id ||
    ticket?.id ||
    response?.ticket_id ||
    response?.id ||
    ""
  );
};

export default function OperatorCreateTicket({ onClose, onCreated }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [screenValues, setScreenValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDepartment = useMemo(
    () => departmentDirectory.find((item) => item.slug === form.departmentSlug),
    [form.departmentSlug]
  );

  const subDepartments = selectedDepartment?.subDepartments || [];
  const selectedSubDepartment = useMemo(
    () => subDepartments.find((item) => item.slug === form.subDepartmentSlug),
    [form.subDepartmentSlug, subDepartments]
  );

  const inputScreens = useMemo(
    () => getThresholdScreensForSubDepartment(form.departmentSlug, form.subDepartmentSlug),
    [form.departmentSlug, form.subDepartmentSlug]
  );

  const screenFields = useMemo(
    () => getThresholdFieldsForScreen(form.inputScreen),
    [form.inputScreen]
  );

  const hasScreenFields = screenFields.length > 0;

  const updateField = (field, value) => {
    setForm((current) => {
      if (field === "departmentSlug") {
        const nextDepartment = departmentDirectory.find((item) => item.slug === value);
        const nextSubDepartment = nextDepartment?.subDepartments?.[0]?.slug || "";
        const nextScreens = getThresholdScreensForSubDepartment(value, nextSubDepartment);

        return {
          ...current,
          departmentSlug: value,
          subDepartmentSlug: nextSubDepartment,
          inputScreen: nextScreens[0] || "",
          parameterName: "",
          actualValue: "",
          standardValue: "",
        };
      }

      if (field === "subDepartmentSlug") {
        const nextScreens = getThresholdScreensForSubDepartment(current.departmentSlug, value);

        return {
          ...current,
          subDepartmentSlug: value,
          inputScreen: nextScreens[0] || "",
          parameterName: "",
          actualValue: "",
          standardValue: "",
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });

    if (["departmentSlug", "subDepartmentSlug", "inputScreen"].includes(field)) {
      setScreenValues({});
    }

    setErrors((current) => ({ ...current, [field]: false }));
    setSubmitError("");
  };

  const updateScreenField = (fieldName, value) => {
    const nextValue = COTTON_HVI_NUMERIC_FIELDS.has(fieldName)
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;

    setScreenValues((current) => ({
      ...current,
      [fieldName]: nextValue,
    }));
    setErrors((current) => ({ ...current, [`screen:${fieldName}`]: false }));
    setSubmitError("");
  };

  const validateForm = () => {
    const nextErrors = {};

    const requiredFormFields = [
      "departmentSlug",
      "subDepartmentSlug",
      "inputScreen",
      "machineName",
      "description",
    ];

    if (!hasScreenFields) {
      requiredFormFields.push("parameterName", "actualValue", "standardValue");
    }

    requiredFormFields.forEach((field) => {
      if (!String(form[field] || "").trim()) {
        nextErrors[field] = true;
      }
    });

    if (hasScreenFields) {
      screenFields.forEach((fieldName) => {
        if (!String(screenValues[fieldName] || "").trim()) {
          nextErrors[`screen:${fieldName}`] = true;
        }
      });
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      setSubmitError("Please fill all required fields.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    const { userId, userName } = getCurrentTicketUser();
    const parameterNames = hasScreenFields
      ? screenFields
      : [form.parameterName.trim()];
    const actualValues = hasScreenFields
      ? screenFields.reduce((acc, fieldName) => {
          acc[fieldName] = String(screenValues[fieldName] || "").trim();
          return acc;
        }, {})
      : {
          [form.parameterName.trim()]: form.actualValue.trim(),
        };
    const thresholdValues = hasScreenFields
      ? screenFields.reduce((acc, fieldName) => {
          acc[fieldName] = {
            actual_value: null,
            plus_threshold: null,
            minus_threshold: null,
          };
          return acc;
        }, {})
      : {
          [form.parameterName.trim()]: {
            actual_value: form.standardValue.trim(),
            plus_threshold: form.plusThreshold.trim() || null,
            minus_threshold: form.minusThreshold.trim() || null,
          },
        };

    const payload = {
      user_id: userId,
      user_name: userName,
      department: selectedDepartment?.name || form.departmentSlug,
      management_field: selectedDepartment?.name || form.departmentSlug,
      sub_department: selectedSubDepartment?.name || form.subDepartmentSlug,
      erp_product_code: selectedSubDepartment?.name || form.subDepartmentSlug,
      input_screen: form.inputScreen,
      machine_name: form.machineName.trim(),
      parameter_name: parameterNames,
      actual_value: actualValues,
      threshold_value: thresholdValues,
      severity: form.severity,
      status: "Open",
      description: form.description.trim(),
      source: "Manual",
    };

    const inputScreenPayload = hasScreenFields
      ? screenFields.reduce(
          (acc, fieldName) => {
            const payloadKey = FIELD_PAYLOAD_KEYS[fieldName] || toSnakeKey(fieldName);
            acc[payloadKey] = normalizePayloadValue(screenValues[fieldName]);
            return acc;
          },
          {
            user_id: userId,
            user_name: userName,
            department: selectedDepartment?.name || form.departmentSlug,
            sub_department: selectedSubDepartment?.name || form.subDepartmentSlug,
            input_screen: form.inputScreen,
            screen_name: form.inputScreen,
            machine_name: form.machineName.trim(),
            description: form.description.trim(),
            source: "Manual Ticket",
          }
        )
      : {
          user_id: userId,
          user_name: userName,
          department: selectedDepartment?.name || form.departmentSlug,
          sub_department: selectedSubDepartment?.name || form.subDepartmentSlug,
          input_screen: form.inputScreen,
          screen_name: form.inputScreen,
          machine_name: form.machineName.trim(),
          parameter_name: form.parameterName.trim(),
          actual_value: normalizePayloadValue(form.actualValue),
          standard_value: normalizePayloadValue(form.standardValue),
          plus_threshold: normalizePayloadValue(form.plusThreshold),
          minus_threshold: normalizePayloadValue(form.minusThreshold),
          description: form.description.trim(),
          source: "Manual Ticket",
        };

    if (inputScreenPayload.invoice_date && !inputScreenPayload.inspection_date) {
      inputScreenPayload.inspection_date = inputScreenPayload.invoice_date;
    }

    if (inputScreenPayload.invoice_no && !inputScreenPayload.lot_no) {
      inputScreenPayload.lot_no = inputScreenPayload.invoice_no;
    }

    try {
      await submitManualTicketInputScreen({
        departmentSlug: form.departmentSlug,
        subDepartmentSlug: form.subDepartmentSlug,
        inputScreen: form.inputScreen,
        payload: inputScreenPayload,
      });

      const response = await createOperatorTicket(payload);
      const createdTicketId = normalizeTicketIdForRoute(resolveCreatedTicketId(response));

      if (createdTicketId) {
        router.push(`/operatordetail?ticketId=${encodeURIComponent(createdTicketId)}`);
        return;
      }

      onCreated?.();
      onClose?.();
    } catch (error) {
      setSubmitError(error.message || "Failed to create manual ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={styles["manual-popup-overlay"]}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-ticket-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose?.();
        }
      }}
    >
      <div className={styles["manual-popup-modal"]}>
        <div className={styles["manual-popup-header"]}>
          <div>
            <h2 id="manual-ticket-title">Create Manual Ticket</h2>
            <p>Fill the specific ticket fields and create an operator ticket.</p>
          </div>
          <button
            type="button"
            className={styles["manual-popup-close"]}
            onClick={() => onClose?.()}
            disabled={isSubmitting}
            aria-label="Close manual ticket popup"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>

        <form className={styles["manual-ticket-form"]} onSubmit={handleSubmit}>
          <div className={styles["manual-form-grid"]}>
            <Field label="Department" required error={errors.departmentSlug}>
              <select
                value={form.departmentSlug}
                onChange={(event) => updateField("departmentSlug", event.target.value)}
              >
                {departmentDirectory.map((department) => (
                  <option key={department.slug} value={department.slug}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sub Department" required error={errors.subDepartmentSlug}>
              <select
                value={form.subDepartmentSlug}
                onChange={(event) => updateField("subDepartmentSlug", event.target.value)}
              >
                {subDepartments.map((subDepartment) => (
                  <option key={subDepartment.slug} value={subDepartment.slug}>
                    {subDepartment.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Input Screen" required error={errors.inputScreen}>
              {inputScreens.length ? (
                <select
                  value={form.inputScreen}
                  onChange={(event) => updateField("inputScreen", event.target.value)}
                >
                  {inputScreens.map((screen) => (
                    <option key={screen} value={screen}>
                      {screen}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.inputScreen}
                  onChange={(event) => updateField("inputScreen", event.target.value)}
                  placeholder="Enter screen name"
                />
              )}
            </Field>

            <Field label="Severity" required>
              <select
                value={form.severity}
                onChange={(event) => updateField("severity", event.target.value)}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </Field>

            <Field label="Machine" required error={errors.machineName}>
              <input
                value={form.machineName}
                onChange={(event) => updateField("machineName", event.target.value)}
                placeholder="Machine name or number"
              />
            </Field>

            {!hasScreenFields && (
              <>
                <Field label="Parameter" required error={errors.parameterName}>
                  <input
                    value={form.parameterName}
                    onChange={(event) => updateField("parameterName", event.target.value)}
                    placeholder="Parameter name"
                  />
                </Field>

                <Field label="Actual Value" required error={errors.actualValue}>
                  <input
                    value={form.actualValue}
                    onChange={(event) => updateField("actualValue", event.target.value)}
                    placeholder="Observed value"
                  />
                </Field>

                <Field label="Standard Value" required error={errors.standardValue}>
                  <input
                    value={form.standardValue}
                    onChange={(event) => updateField("standardValue", event.target.value)}
                    placeholder="Expected value"
                  />
                </Field>

                <Field label="Plus Threshold">
                  <input
                    value={form.plusThreshold}
                    onChange={(event) => updateField("plusThreshold", event.target.value)}
                    placeholder="Optional"
                  />
                </Field>

                <Field label="Minus Threshold">
                  <input
                    value={form.minusThreshold}
                    onChange={(event) => updateField("minusThreshold", event.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </>
            )}
          </div>

          {hasScreenFields && (
            <div className={styles["manual-screen-fields"]}>
              <div className={styles["manual-screen-fields-title"]}>
                <h3>{form.inputScreen} Fields</h3>
              </div>

              <div className={styles["manual-form-grid"]}>
                {screenFields.map((fieldName) => (
                  <Field
                    key={fieldName}
                    label={fieldName}
                    required
                    error={errors[`screen:${fieldName}`]}
                  >
                    {SELECT_OPTIONS_BY_FIELD[fieldName] ? (
                      <select
                        value={screenValues[fieldName] || ""}
                        onChange={(event) => updateScreenField(fieldName, event.target.value)}
                      >
                        <option value="">Select {fieldName}</option>
                        {SELECT_OPTIONS_BY_FIELD[fieldName].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={DATE_FIELDS.has(fieldName) ? "date" : "text"}
                        value={screenValues[fieldName] || ""}
                        onChange={(event) => updateScreenField(fieldName, event.target.value)}
                        placeholder={`Enter ${fieldName}`}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </div>
          )}

          <Field label="Description" required error={errors.description} fullWidth>
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="Describe the issue"
              maxLength={500}
            />
          </Field>

          {submitError && <p className={styles["manual-form-error"]}>{submitError}</p>}

          <div className={styles["manual-form-actions"]}>
            <button
              type="button"
              className={styles["manual-secondary-btn"]}
              onClick={() => onClose?.()}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles["manual-submit-btn"]}
              disabled={isSubmitting}
            >
              <FiSave aria-hidden="true" />
              <span>{isSubmitting ? "Creating..." : "Create Ticket"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required = false, error = false, fullWidth = false, children }) {
  return (
    <label className={`${styles["manual-field"]} ${fullWidth ? styles["manual-field-wide"] : ""}`}>
      <span>
        {label}
        {required && <strong>*</strong>}
      </span>
      <div className={error ? styles["manual-field-error"] : ""}>{children}</div>
    </label>
  );
}
