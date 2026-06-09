import apiConfig, { resolvedBaseUrl } from "./apiConfig";
import { emitGlobalSuccessModal } from "@/utils/globalSuccessModal";

const API_BASE_URL = resolvedBaseUrl;

const YARN_CV_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_SYNC_URL ||
    `${API_BASE_URL}/drawframe/yarn-cv`;

const COTS_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_COTS_URL ||
    `${API_BASE_URL}/drawframe/cots`;

const UQC_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_UQC_URL ||
    `${API_BASE_URL}/drawframe/uqc`;
const MACHINE_MASTER_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_MACHINE_MASTER_URL ||
    `${API_BASE_URL}/drawframe/yarn-cv/machine-numbers`;
const MACHINE_MASTER_FALLBACK_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_MACHINE_MASTER_FALLBACK_URL ||
    `${API_BASE_URL}/drawframe/machine-numbers`;
const COTS_MACHINE_MASTER_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_COTS_MACHINE_MASTER_URL ||
    `${API_BASE_URL}/drawframe/cots/machine-numbers`;

const parseJson = async (response) => response.json().catch(() => null);
const DRAW_FRAME_UQC_ENDPOINTS = ["/drawframe/uqc", "/draw-frame/uqc"];
const DRAW_FRAME_UQC_MASTER_DROPDOWN_ENDPOINTS = [
    "/drawframe/uqc/master/dropdown",
    "/drawframe/master/dropdown",
    "/draw-frame/uqc/master/dropdown",
];
const DRAW_FRAME_UQC_MASTER_VARIETY_ENDPOINTS = [
    "/drawframe/uqc/master/varieties",
    "/drawframe/master/varieties",
];
const DRAW_FRAME_UQC_MASTER_DEPARTMENT_ENDPOINTS = [
    "/drawframe/uqc/master/departments",
    "/drawframe/master/departments",
];
const DRAW_FRAME_UQC_MASTER_MC_NO_ENDPOINTS = [
    "/drawframe/uqc/master/mc-nos",
    "/drawframe/uqc/master/machine-nos",
    "/drawframe/uqc/master/machine-numbers",
    "/drawframe/master/mc-nos",
    "/drawframe/master/machine-nos",
    "/drawframe/master/machine-numbers",
];
const DRAW_FRAME_MACHINE_MASTER_ENDPOINTS = [
    "/drawframe/master/mc-nos",
    "/drawframe/master/machine-nos",
    "/drawframe/master/machine-numbers",
    "/drawframe/uqc/master/mc-nos",
    "/drawframe/uqc/master/machine-nos",
];

const emitFetchSuccess = () => {
    emitGlobalSuccessModal({
        message: "Data Submitted",
    });
};

const buildFetchNetworkError = (endpoint) =>
    `Unable to reach ${endpoint}. Check backend availability and NEXT_PUBLIC_API_URL.`;

const extractApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }

    if (error?.request) {
        const method = String(error.config?.method || "request").toUpperCase();
        const path = error.config?.url || "unknown endpoint";
        const base = error.config?.baseURL || API_BASE_URL;
        const endpoint = `${base}${path.startsWith("/") ? path : `/${path}`}`;
        return `Unable to reach ${method} ${endpoint}`;
    }

    return error?.message || fallbackMessage;
};

const uniqueStrings = (values) =>
    Array.from(new Set(
        values
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    ));

const cleanMcNoLabel = (value) =>
    String(value || "")
        .trim()
        .replace(/^\d+\s*\/\s*/, "");

const uniqueOptions = (options = []) => {
    const seen = new Set();
    return options
        .map((option) => {
            if (!option || typeof option !== "object") {
                const value = String(option || "").trim();
                return value ? { value, label: cleanMcNoLabel(value) || value } : null;
            }
            const value = String(option.value ?? option.mc_no ?? option.text ?? option.label ?? "").trim();
            const label = cleanMcNoLabel(option.label ?? option.text ?? option.mc_name ?? option.machine_number ?? value);
            return value ? { value, label: label || value } : null;
        })
        .filter((option) => {
            if (!option || seen.has(option.value)) return false;
            seen.add(option.value);
            return true;
        });
};

const normalizeOptionRows = (rows = []) =>
    rows
        .map((row) => {
            if (typeof row === "string") {
                const value = row.trim();
                return value ? { label: value, value } : null;
            }

            const value = String(row?.value ?? row?.text ?? "").trim();
            const label = String(row?.text ?? row?.label ?? row?.value ?? "").trim();
            if (!value && !label) return null;
            return { label: label || value, value: value || label };
        })
        .filter(Boolean);

const pickFirstValue = (row, keys = []) => {
    if (!row || typeof row !== "object") return row;
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim()) return value;
    }
    return row.value ?? row.text ?? row.label ?? row.name;
};

const mapRowsToValues = (rows = [], keys = []) =>
    uniqueStrings(
        (Array.isArray(rows) ? rows : [])
            .map((row) => pickFirstValue(row, keys))
    );

const normalizeMachineMasterRows = (payload = {}) => {
    const options = payload.options || payload.dropdown_options || {};
    const optionRows = [
        ...(Array.isArray(options) ? options : []),
        ...(Array.isArray(options.mc_no) ? options.mc_no : []),
        ...(Array.isArray(options.mc_nos) ? options.mc_nos : []),
        ...(Array.isArray(options.machine_no) ? options.machine_no : []),
        ...(Array.isArray(options.machine_nos) ? options.machine_nos : []),
        ...(Array.isArray(options.machine_number) ? options.machine_number : []),
        ...(Array.isArray(options.machine_numbers) ? options.machine_numbers : []),
        ...(Array.isArray(options.machines) ? options.machines : []),
    ];
    const rows = [
        ...optionRows,
        ...(Array.isArray(payload.data) ? payload.data : []),
        ...(Array.isArray(payload.mc_nos) ? payload.mc_nos : []),
        ...(Array.isArray(payload.mc_no_values) ? payload.mc_no_values : []),
        ...(Array.isArray(payload.machine_nos) ? payload.machine_nos : []),
        ...(Array.isArray(payload.machine_numbers) ? payload.machine_numbers : []),
        ...(Array.isArray(payload.machines) ? payload.machines : []),
        ...(Array.isArray(payload.values) ? payload.values : []),
        ...(Array.isArray(payload.names) ? payload.names : []),
    ];

    return rows
        .map((row) => {
            const mcNo = String(
                row?.value ??
                    row?.full_mc_no ??
                    row?.fullMcNo ??
                    row?.mc_full_no ??
                    row?.mc_no_full ??
                    row?.mc_no ??
                    row?.mcNo ??
                    row?.machine_no ??
                    row?.machineNo ??
                    row?.machine_number ??
                    row?.machineNumber ??
                    row?.mccode ??
                    row?.text ??
                    row?.label ??
                    row ??
                    ""
            ).trim();
            const rawMachineName = String(
                row?.mc_name ??
                    row?.mcName ??
                    row?.machine_name ??
                    row?.machineName ??
                    row?.machine_number ??
                    row?.machineNumber ??
                    row?.label ??
                    row?.text ??
                    row?.value ??
                    mcNo
            ).trim();
            const machineName = cleanMcNoLabel(rawMachineName || mcNo);
            return mcNo || machineName
                ? {
                    mc_no: mcNo || machineName,
                    mc_name: machineName || cleanMcNoLabel(mcNo),
                    machine_number: machineName || cleanMcNoLabel(mcNo),
                    value: mcNo || machineName,
                    label: machineName || cleanMcNoLabel(mcNo),
                }
                : null;
        })
        .filter(Boolean);
};

const fetchFirstDropdownPayload = async (endpoints, params) => {
    let lastError;

    for (const endpoint of endpoints) {
        try {
            const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
            return response?.data || {};
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError;
};

export const submitDrawFrameYarnCvInspection = async (payload) => {
    try {
        const response = await fetch(YARN_CV_BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data?.message || "Failed to save draw frame sync data");
        }

        emitFetchSuccess(data);
        return data;
    } catch (error) {
        throw new Error(error.message === "Failed to fetch" ? buildFetchNetworkError(YARN_CV_BASE_URL) : error.message || "Server error occurred");
    }
};

export const submitDrawFrameCotsInspection = async (payload) => {
    try {
        const response = await fetch(COTS_BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data?.message || "Failed to save draw frame cots data");
        }

        emitFetchSuccess(data);
        return data;
    } catch (error) {
        throw new Error(error.message === "Failed to fetch" ? buildFetchNetworkError(COTS_BASE_URL) : error.message || "Server error occurred");
    }
};

export const fetchDrawFrameCotsEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await fetch(`${COTS_BASE_URL}?page=${page}&limit=${limit}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data?.message || "Failed to fetch draw frame cots entries");
        }

        return Array.isArray(data) ? data : [];
    } catch (error) {
        throw new Error(error.message === "Failed to fetch" ? buildFetchNetworkError(COTS_BASE_URL) : error.message || "Server error occurred");
    }
};

export const submitDrawFrameUqcInspection = async (payload) => {
    let lastError;

    for (const endpoint of DRAW_FRAME_UQC_ENDPOINTS) {
        try {
            const response = await apiConfig.post(endpoint, payload);
            return response.data;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to save draw frame UQC data"));
};

export const submitDrawFrameAPercentInspection = async (payload) => {
    const endpoints = [
        "/drawframe/a-percent",
        "/drawframe/a-percent-inspection",
        "/drawframe/wrapping/a-percent",
        "/drawframe/wrapping/drawframe/a-percent",
    ];
    let lastError;

    for (const endpoint of endpoints) {
        try {
            const response = await apiConfig.post(endpoint, payload);
            return response.data;
        } catch (error) {
            lastError = error;
            if (error.response?.status !== 404) break;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to save draw frame A% data"));
};

export const submitWrappingOcrPercentInspection = async (docType, payload) => {
    const normalizedDocType = String(docType || "").trim().toLowerCase();
    const endpointMap = {
        strech: [
            "/drawframe/stretch-percent",
            "/drawframe/stretch-percent-inspection",
            "/drawframe/wrapping/stretch-percent",
            "/drawframe/wrapping/stretch-percentage",
            "/drawframe/wrapping/drawframe/stretch-percent",
        ],
        stretch: [
            "/drawframe/stretch-percent",
            "/drawframe/stretch-percent-inspection",
            "/drawframe/wrapping/stretch-percent",
            "/drawframe/wrapping/stretch-percentage",
            "/drawframe/wrapping/drawframe/stretch-percent",
        ],
        noils: [
            "/drawframe/comber-noil-percent",
            "/drawframe/noil-percent",
            "/drawframe/wrapping/comber-noil-percent",
            "/drawframe/wrapping/noil-percent",
        ],
        noil: [
            "/drawframe/comber-noil-percent",
            "/drawframe/noil-percent",
            "/drawframe/wrapping/comber-noil-percent",
            "/drawframe/wrapping/noil-percent",
        ],
    };
    const endpoints = endpointMap[normalizedDocType] || endpointMap.strech;
    let lastError;

    for (const endpoint of endpoints) {
        try {
            const response = await apiConfig.post(endpoint, payload);
            return response.data;
        } catch (error) {
            lastError = error;
            if (error.response?.status !== 404) break;
        }
    }

    throw new Error(extractApiError(lastError, `Failed to save ${docType || "OCR"} percent data`));
};

export const fetchDrawFrameUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
    let lastError;

    for (const endpoint of DRAW_FRAME_UQC_ENDPOINTS) {
        try {
            const response = await apiConfig.get(endpoint, { page, limit });
            return response.data;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to fetch draw frame UQC entries"));
};

export const fetchDrawFrameUqcMasterDropdown = async ({
    prefix = "",
    variety_prefix = "",
    department_prefix = "",
    mc_no_prefix = "",
    department = "",
    department_code = "",
} = {}) => {
    let lastError;
    const params = {
        prefix,
        variety_prefix,
        department_prefix,
        mc_no_prefix,
        department,
        department_code,
    };

    for (const endpoint of DRAW_FRAME_UQC_MASTER_DROPDOWN_ENDPOINTS) {
        try {
            const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
            const payload = response?.data || {};
            const options = payload.options || payload.dropdown_options || {};
            const optionShifts = normalizeOptionRows(options.shift || options.shifts);
            const optionVarieties = normalizeOptionRows(options.variety || options.varieties);
            const optionDepartments = normalizeOptionRows(options.department || options.departments);
            const optionMcNos = normalizeOptionRows(options.mc_no || options.mc_nos || options.machines);

            const shifts = Array.isArray(payload.shifts) && payload.shifts.length
                ? payload.shifts.map((row) => row?.value || row?.label || row).filter(Boolean)
                : optionShifts.map((row) => row.value);

            const varietyNames = uniqueStrings([
                ...(Array.isArray(payload.variety_names) ? payload.variety_names : []),
                ...(Array.isArray(payload.names) ? payload.names : []),
                ...(Array.isArray(payload.varieties)
                    ? mapRowsToValues(payload.varieties, [
                        "variety_name",
                        "prep_variety_name",
                        "VARIETY_NAME",
                        "variety",
                        "VARIETY",
                        "name",
                    ])
                    : []),
                ...mapRowsToValues(payload.data, [
                    "variety_name",
                    "prep_variety_name",
                    "VARIETY_NAME",
                    "variety",
                    "VARIETY",
                    "name",
                ]),
                ...optionVarieties.map((row) => row.value),
            ]);

            const departmentNames = uniqueStrings([
                ...(Array.isArray(payload.department_names) ? payload.department_names : []),
                ...(Array.isArray(payload.departments)
                    ? mapRowsToValues(payload.departments, [
                        "dept_name",
                        "deptname",
                        "DEPTNAME",
                        "department_name",
                        "department",
                        "DEPARTMENT",
                        "name",
                    ])
                    : []),
                ...mapRowsToValues(payload.data, [
                    "dept_name",
                    "deptname",
                    "DEPTNAME",
                    "department_name",
                    "department",
                    "DEPARTMENT",
                    "name",
                ]),
                ...optionDepartments.map((row) => row.value),
            ]);

            const mcNos = uniqueOptions([
                ...normalizeMachineMasterRows(payload),
                ...optionMcNos,
                ...(Array.isArray(payload.mc_no_values) ? payload.mc_no_values : []),
            ]);

            const dropdown = {
                shifts: uniqueStrings(shifts),
                varietyNames,
                departmentNames,
                mcNos,
            };

            if (!dropdown.varietyNames.length) {
                const varietyPayload = await fetchFirstDropdownPayload(DRAW_FRAME_UQC_MASTER_VARIETY_ENDPOINTS, params).catch(() => null);
                dropdown.varietyNames = uniqueStrings([
                    ...(Array.isArray(varietyPayload?.names) ? varietyPayload.names : []),
                    ...(Array.isArray(varietyPayload?.variety_names) ? varietyPayload.variety_names : []),
                    ...(Array.isArray(varietyPayload?.prep_variety_names) ? varietyPayload.prep_variety_names : []),
                    ...mapRowsToValues(varietyPayload?.data, [
                        "variety_name",
                        "prep_variety_name",
                        "VARIETY_NAME",
                        "variety",
                        "VARIETY",
                        "name",
                    ]),
                ]);
            }

            if (!dropdown.departmentNames.length) {
                const departmentPayload = await fetchFirstDropdownPayload(DRAW_FRAME_UQC_MASTER_DEPARTMENT_ENDPOINTS, params).catch(() => null);
                dropdown.departmentNames = uniqueStrings([
                    ...(Array.isArray(departmentPayload?.names) ? departmentPayload.names : []),
                    ...(Array.isArray(departmentPayload?.department_names) ? departmentPayload.department_names : []),
                    ...mapRowsToValues(departmentPayload?.data, [
                        "dept_name",
                        "deptname",
                        "DEPTNAME",
                        "department_name",
                        "department",
                        "DEPARTMENT",
                        "name",
                    ]),
                ]);
            }

            if (!dropdown.mcNos.length) {
                const mcNoPayload = await fetchFirstDropdownPayload(DRAW_FRAME_UQC_MASTER_MC_NO_ENDPOINTS, params).catch(() => null);
                dropdown.mcNos = uniqueOptions([
                    ...normalizeMachineMasterRows(mcNoPayload),
                    ...(Array.isArray(mcNoPayload?.names) ? mcNoPayload.names : []),
                    ...(Array.isArray(mcNoPayload?.mc_no_values) ? mcNoPayload.mc_no_values : []),
                    ...(Array.isArray(mcNoPayload?.mc_nos) ? mcNoPayload.mc_nos : []),
                ]);
            }

            return dropdown;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to fetch draw frame UQC dropdown options"));
};

export const submitDrawFrameHeaderEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/drawframe/header", payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to create draw frame header entry"));
    }
};

export const fetchDrawFrameHeaderEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/drawframe/header", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to fetch draw frame header entries"));
    }
};

export const submitDrawFrameFinisherEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/drawframe/finisher", payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to create draw frame finisher entry"));
    }
};

export const fetchDrawFrameFinisherEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/drawframe/finisher", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to fetch draw frame finisher entries"));
    }
};

export const fetchDrawFrameMachineMaster = async ({ prefix = "" } = {}) => {
    const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    let lastError = null;

    for (const endpoint of DRAW_FRAME_MACHINE_MASTER_ENDPOINTS) {
        try {
            const response = await apiConfig.get(
                endpoint,
                { prefix, mc_no_prefix: prefix, machine_prefix: prefix },
                { skipGlobalErrorModal: true }
            );
            const rows = normalizeMachineMasterRows(response?.data);
            if (rows.length) return rows;
        } catch (error) {
            lastError = error;
            if (error.response?.status && error.response.status !== 404) break;
        }
    }

    const candidateUrls = [MACHINE_MASTER_BASE_URL, MACHINE_MASTER_FALLBACK_URL];

    for (const baseUrl of candidateUrls) {
        try {
            const response = await fetch(`${baseUrl}${query}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const data = await parseJson(response);
            if (!response.ok) {
                lastError = new Error(data?.message || "Failed to fetch draw frame machine master");
                continue;
            }
            if (Array.isArray(data?.data)) return data.data;
            const normalizedRows = normalizeMachineMasterRows(data);
            if (normalizedRows.length) return normalizedRows;
            if (Array.isArray(data?.machine_numbers)) {
                return data.machine_numbers.map((machineNumber) => ({
                    machine_number: String(machineNumber || "").trim(),
                    mc_name: cleanMcNoLabel(machineNumber),
                }));
            }
            return [];
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to fetch draw frame machine master"));
};

export const fetchDrawFrameCotsMachineMaster = async ({ prefix = "", subType = "" } = {}) => {
    const queryParams = new URLSearchParams();
    if (prefix) queryParams.set("prefix", prefix);
    if (subType) queryParams.set("sub_type", subType);
    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";

    const response = await fetch(`${COTS_MACHINE_MASTER_URL}${query}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    });
    const data = await parseJson(response);

    if (!response.ok) {
        throw new Error(data?.message || "Failed to fetch draw frame cots machine master");
    }

    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.machine_numbers)) {
        return data.machine_numbers.map((mcName) => ({
            mc_name: String(mcName || "").trim(),
        }));
    }
    return [];
};

export const updateDrawFrameHeaderEntry = async (insId, payload) => {
    try {
        const response = await apiConfig.put(`/drawframe/header/${insId}`, payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to update draw frame header entry"));
    }
};

export const updateDrawFrameFinisherEntry = async (id, payload) => {
    try {
        const response = await apiConfig.put(`/drawframe/finisher/${id}`, payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to update draw frame finisher entry"));
    }
};
