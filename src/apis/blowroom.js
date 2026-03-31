const BASE_URL = "http://192.168.1.8:4000/blowroom/sync";

// ✅ GET DATA
export const fetchBlowroomDataApi = async () => {
  try {
    const res = await fetch(BASE_URL);

    if (!res.ok) {
      throw new Error("Failed to fetch data");
    }

    return await res.json();
  } catch (error) {
    throw error;
  }
};

// ✅ POST DATA
export const saveBlowroomDataApi = async (payload) => {
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Failed to save data");
    }

    return await res.json(); // { message, syncId }
  } catch (error) {
    throw error;
  }
};