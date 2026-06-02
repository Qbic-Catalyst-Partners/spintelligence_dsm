import apiConfig from './apiConfig';

const extractMixingApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }

    if (error?.response?.data?.error) {
        return error.response.data.error;
    }

    if (error?.request) {
        return "Network Error: unable to reach the API server. Check backend availability and API URL.";
    }

    return error?.message || fallbackMessage;
};

const uniqueStrings = (values = []) =>
    Array.from(new Set(
        values
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    ));

export const fetchMixingMasterVarieties = async ({ prefix = "" } = {}) => {
    const parseVarietyPayload = (payload) => {
        const namesList = Array.isArray(payload?.names)
            ? payload.names
            : Array.isArray(payload?.variety_names)
                ? payload.variety_names
                : [];

        if (namesList.length) {
            return uniqueStrings(namesList);
        }

        const optionRows = Array.isArray(payload?.options) ? payload.options : [];
        const optionNames = optionRows
            .map((option) => option?.text || option?.label || option?.value)
            .filter((name) => String(name || "").trim() && !String(name).includes('-- Select'));
        if (optionNames.length) {
            return uniqueStrings(optionNames);
        }

        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        return uniqueStrings(rows.map((row) => row?.variety_name || row?.name || row));
    };

    const endpoints = [
        '/mixing/master/varieties',
        '/carding/master/varieties',
        '/comber/master/varieties',
    ];
    let lastError = null;

    try {
        for (const endpoint of endpoints) {
            try {
                const response = await apiConfig.get(
                    endpoint,
                    { prefix },
                    { skipGlobalErrorModal: true }
                );
                const options = parseVarietyPayload(response?.data);
                if (options.length || endpoint === endpoints[endpoints.length - 1]) {
                    return options;
                }
            } catch (error) {
                lastError = error;
                if (error?.response?.status && error.response.status !== 404) {
                    throw error;
                }
            }
        }

        return [];
    } catch (error) {
        throw new Error(extractMixingApiError(error || lastError, 'Unable to fetch mixing variety options.'));
    }
};

const normalizeLotRows = (payload) => {
    const rows = Array.isArray(payload?.lots)
        ? payload.lots
        : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
                ? payload
                : [];

    const seen = new Set();
    return rows
        .map((row) => {
            const lotNo = String(row?.lot_no ?? row?.lotNo ?? row?.value ?? "").trim();
            if (!lotNo) return null;
            return {
                lot_no: lotNo,
                value: lotNo,
                label: lotNo,
                variety: String(row?.variety ?? "").trim(),
                lot_date: row?.lot_date || row?.date || "",
                date: row?.date || row?.lot_date || "",
                ref_no: String(row?.ref_no ?? row?.refno ?? "").trim(),
                dc_no: String(row?.dc_no ?? row?.dcno ?? "").trim(),
                dc_date: row?.dc_date || row?.dcdate || "",
                invoice_no: String(row?.invoice_no ?? row?.ref_no ?? row?.refno ?? row?.dc_no ?? row?.dcno ?? "").trim(),
                invoice_date: row?.invoice_date || row?.dc_date || row?.dcdate || "",
            };
        })
        .filter((lot) => {
            if (!lot || seen.has(lot.lot_no)) return false;
            seen.add(lot.lot_no);
            return true;
        });
};

const MIXING_LOT_ENDPOINTS_BY_SCREEN = {
    "Cotton HVI Data Entry": [
        "/mixing/cotton-hvi/master/lot-dropdown",
        "/mixing/cotton-hvi/master/lots",
        "/mixing/cotton-hvi/lots",
    ],
    "Fibre Data Entry": [
        "/mixing/fibre/master/lot-dropdown",
        "/mixing/fibre/master/dropdown",
        "/mixing/fibre/master/lots",
        "/mixing/fibre/lots",
        "/mixing/mmf-hvi/master/lot-dropdown",
        "/mixing/mmf-hvi/master/dropdown",
        "/mixing/mmf-hvi/master/lots",
        "/mixing/mmf-hvi/lots",
    ],
    "AFIS Data Entry": [
        "/mixing/cotton-hvi/master/lot-dropdown",
        "/mixing/cotton-hvi/master/lots",
        "/mixing/cotton-hvi/lots",
    ],
    "Moisture Data Entry": [
        "/mixing/moisture/master/lot-dropdown",
        "/mixing/moisture/master/lots",
        "/mixing/moisture/lots",
    ],
};

export const fetchMixingLotOptions = async ({ screenName = "", prefix = "" } = {}) => {
    const endpoints = MIXING_LOT_ENDPOINTS_BY_SCREEN[screenName] || [
        "/mixing/cotton-hvi/master/lot-dropdown",
    ];
    let lastError = null;

    try {
        for (const endpoint of endpoints) {
            try {
                const response = await apiConfig.get(
                    endpoint,
                    { prefix, lot_prefix: prefix },
                    { skipGlobalErrorModal: true }
                );
                const lots = normalizeLotRows(response?.data);
                if (lots.length || endpoint === endpoints[endpoints.length - 1]) {
                    return lots;
                }
            } catch (error) {
                lastError = error;
                if (error?.response?.status && error.response.status !== 404) {
                    throw error;
                }
            }
        }

        return [];
    } catch (error) {
        throw new Error(extractMixingApiError(error || lastError, "Unable to fetch mixing lot options."));
    }
};

const normalizeCountRows = (payload) => {
    const optionRows = Array.isArray(payload?.options?.count_name)
        ? payload.options.count_name
        : Array.isArray(payload?.options)
            ? payload.options
            : [];
    const rows = [
        ...(Array.isArray(payload?.data) ? payload.data : []),
        ...(Array.isArray(payload?.counts) ? payload.counts : []),
        ...(Array.isArray(payload?.count_names) ? payload.count_names : []),
        ...(Array.isArray(payload) ? payload : []),
        ...optionRows,
    ];

    const seen = new Set();
    return rows
        .map((row) => {
            if (row && typeof row === "object") {
                const countName = String(
                    row.count_name ?? row.countName ?? row.cntname ?? row.text ?? row.label ?? row.value ?? ""
                ).trim();
                const countCode = String(row.count_code ?? row.countCode ?? row.cntcode ?? "").trim();
                return countName
                    ? {
                        count_code: countCode,
                        count_name: countName,
                        value: countName,
                        label: countName,
                    }
                    : null;
            }

            const countName = String(row || "").trim();
            return countName
                ? {
                    count_code: "",
                    count_name: countName,
                    value: countName,
                    label: countName,
                }
                : null;
        })
        .filter((count) => {
            if (!count || seen.has(count.count_name)) return false;
            seen.add(count.count_name);
            return true;
        });
};

export const fetchMixingCountOptions = async ({ prefix = "" } = {}) => {
    const endpoints = [
        "/mixing/qc/master/dropdown",
        "/mixing/qc/master/count-dropdown",
        "/mixing/qc/master/counts",
        "/mixing/qc/master/count-names",
        "/mixing/master/count-dropdown",
        "/mixing/master/counts",
        "/mixing/master/count-names",
    ];
    let lastError = null;

    try {
        for (const endpoint of endpoints) {
            try {
                const response = await apiConfig.get(
                    endpoint,
                    { prefix, count_prefix: prefix },
                    { skipGlobalErrorModal: true }
                );
                const counts = normalizeCountRows(response?.data);
                if (counts.length || endpoint === endpoints[endpoints.length - 1]) {
                    return counts;
                }
            } catch (error) {
                lastError = error;
                if (error?.response?.status && error.response.status !== 404) {
                    throw error;
                }
            }
        }

        return [];
    } catch (error) {
        throw new Error(extractMixingApiError(error || lastError, "Unable to fetch mixing count options."));
    }
};

/* ===== Process Parameter ===== */
export const mixingProcessParameterDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/qc', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const updateMixingProcessParameterEntry = async (qcId, payload) => {
    try {
        const response = await apiConfig.put(`/mixing/qc/${qcId}`, payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const getMixingProcessParameterEntries = async (params = {}) => {
    try {
        const response = await apiConfig.get('/mixing/qc', params);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Failed to load Mixing QC entries.');
        throw new Error(error.message || 'Server error occurred');
    }
};

const fetchMixingEntries = async (endpoint, params = {}, fallbackMessage = 'Failed to load Mixing entries.') => {
    try {
        const response = await apiConfig.get(endpoint, params);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || fallbackMessage);
        throw new Error(error.message || 'Server error occurred');
    }
};

/* ===== Cotton HVI ===== */
export const mixingCottonHVIDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/cotton-hvi', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingCottonHviEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/cotton-hvi', params, 'Failed to load Cotton HVI entries.');

/* ===== Fibre ===== */
export const mixingFibreDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/fibre', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingFibreEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/fibre', params, 'Failed to load Fibre entries.');

/* ===== AFIS ===== */
export const mixingAfisDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/afis', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingAfisEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/afis', params, 'Failed to load AFIS entries.');

/* ===== Moisture ===== */
export const mixingMoistureDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/moisture', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingMoistureEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/moisture', params, 'Failed to load Moisture entries.');

/* ===== BR Waste Study ===== */
export const mixingBrWasteStudyEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/br-waste', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

/* ===== Drop Test (single tuft per call) ===== */
export const mixingDropTestDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/drop-test', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

/* ===== Openness ===== */
export const mixingOpennessDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/openness', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingOpennessEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/openness', params, 'Failed to load Openness entries.');
