const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.8:4000";

const BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_SYNC_URL ||
    `${API_BASE_URL}/drawframe/yarn-cv`;  

export const submitDrawFrameInspection = async (payload) => {
    try {
        const response = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(data?.message || "Failed to save draw frame sync data");
        }

        return data;
    } catch (error) {
        throw new Error(error.message || "Server error occurred");
    }
};
