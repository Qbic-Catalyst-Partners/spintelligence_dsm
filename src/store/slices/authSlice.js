import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getAccessibleScreensByRole, loginAPI } from '../../apis/login';
import { setAuthToken } from '../../apis/apiConfig';

const AUTH_USER_STORAGE_KEY = 'authUser';
const AUTH_USER_ID_STORAGE_KEY = 'authUserId';
const AUTH_TOKEN_STORAGE_KEY = 'token';
const ACCESSIBLE_SCREENS_STORAGE_KEY = 'accessibleScreens';
const ACCESS_BY_DEPARTMENT_STORAGE_KEY = 'accessByDepartment';

const normalizeUser = (payload, employeeIdFallback) => {
    const rawUser = payload?.user && typeof payload.user === 'object'
        ? payload.user
        : payload && typeof payload === 'object'
            ? payload
            : {};

    const fullName = rawUser.full_name || rawUser.name || rawUser.fullName || '';

    return {
        ...rawUser,
        employee_id:
            rawUser.employee_id ||
            rawUser.employeeId ||
            rawUser.emp_id ||
            employeeIdFallback ||
            '',
        full_name: fullName,
        name: fullName || rawUser.name || '',
    };
};

const getRoleIdFromPayload = (payload) => {
    const user = payload?.user && typeof payload.user === 'object'
        ? payload.user
        : payload;

    return (
        user?.role_id ||
        user?.roleId ||
        user?.role?.id ||
        payload?.role_id ||
        payload?.roleId ||
        null
    );
};

const normalizeAccessibleScreensPayload = (payload) => {
    const accessGroups = Array.isArray(payload?.access) ? payload.access : [];
    const accessByDepartment = accessGroups.map((department) => ({
        department_id: String(department?.department_id || ''),
        department_name: department?.department_name || '',
        screens: Array.isArray(department?.screens)
            ? department.screens.map((screen) => ({
                id: String(screen?.id || ''),
                name: screen?.name || '',
              }))
            : [],
    }));

    const accessibleScreens = accessByDepartment.flatMap((department) =>
        department.screens.map((screen) => ({
            ...screen,
            department_id: department.department_id,
            department_name: department.department_name,
        }))
    );

    return {
        accessibleScreens,
        accessByDepartment,
    };
};

const getStoredJson = (key, fallbackValue) => {
    if (typeof window === 'undefined') {
        return fallbackValue;
    }

    const rawValue = localStorage.getItem(key);
    if (!rawValue) {
        return fallbackValue;
    }

    try {
        return JSON.parse(rawValue);
    } catch {
        return fallbackValue;
    }
};

const getUserStorageId = (user) =>
    user?.id ||
    user?.user_id ||
    user?.userId ||
    user?.employee_id ||
    user?.employeeId ||
    '';

const persistAuthToStorage = ({ token, user, accessibleScreens, accessByDepartment }) => {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token || '');
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user || null));
    localStorage.setItem(AUTH_USER_ID_STORAGE_KEY, String(getUserStorageId(user) || ''));
    localStorage.setItem(
        ACCESSIBLE_SCREENS_STORAGE_KEY,
        JSON.stringify(Array.isArray(accessibleScreens) ? accessibleScreens : [])
    );
    localStorage.setItem(
        ACCESS_BY_DEPARTMENT_STORAGE_KEY,
        JSON.stringify(accessByDepartment || null)
    );
};

const clearLegacyStoredAuth = () => {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(ACCESSIBLE_SCREENS_STORAGE_KEY);
    localStorage.removeItem(ACCESS_BY_DEPARTMENT_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_ID_STORAGE_KEY);
};

// Async thunk action creator for login
export const loginUser = createAsyncThunk(
    'auth/loginUser',
    async ({ employee_id, password, authMode = 'auto' }, { rejectWithValue }) => {
        try {
            const data = await loginAPI(employee_id, password);
            const roleId = getRoleIdFromPayload(data);
            let accessData = {
                accessibleScreens: Array.isArray(data?.accessibleScreens) ? data.accessibleScreens : [],
                accessByDepartment: data?.accessByDepartment || null,
            };

            if ((!accessData.accessibleScreens.length || !accessData.accessByDepartment) && roleId) {
                const accessibleScreensResponse = await getAccessibleScreensByRole(roleId);
                accessData = normalizeAccessibleScreensPayload(accessibleScreensResponse);
            }

            return {
                ...data,
                user: normalizeUser(data, employee_id),
                ...accessData,
            };
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const initialState = {
    user: null,
    token: null,
    accessibleScreens: [],
    accessByDepartment: null,
    isHydrated: false,
    isLoading: false,
    error: null,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        logout: (state) => {
            state.user = null;
            state.token = null;
            state.accessibleScreens = [];
            state.accessByDepartment = null;
            state.error = null;
            state.isHydrated = true;
            setAuthToken(null);
            clearLegacyStoredAuth();
        },
        hydrateAuthFromStorage: (state) => {
            const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
            const storedUser = getStoredJson(AUTH_USER_STORAGE_KEY, null);
            const storedAccessibleScreens = getStoredJson(ACCESSIBLE_SCREENS_STORAGE_KEY, []);
            const storedAccessByDepartment = getStoredJson(ACCESS_BY_DEPARTMENT_STORAGE_KEY, null);

            state.token = storedToken || null;
            state.user = storedUser ? normalizeUser(storedUser) : null;
            state.accessibleScreens = Array.isArray(storedAccessibleScreens) ? storedAccessibleScreens : [];
            state.accessByDepartment = storedAccessByDepartment || null;
            setAuthToken(state.token);
            state.isHydrated = true;
        },
        clearError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(loginUser.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(loginUser.fulfilled, (state, action) => {
                state.isLoading = false;
                state.token = action.payload.token;
                state.user = normalizeUser(action.payload);
                state.accessibleScreens = action.payload.accessibleScreens || [];
                state.accessByDepartment = action.payload.accessByDepartment || null;
                state.isHydrated = true;
                setAuthToken(action.payload.token);
                persistAuthToStorage({
                    token: state.token,
                    user: state.user,
                    accessibleScreens: state.accessibleScreens,
                    accessByDepartment: state.accessByDepartment,
                });
            })
            .addCase(loginUser.rejected, (state, action) => {
                state.isLoading = false;
                state.isHydrated = true;
                state.error = action.payload; 
            });
    },
});

export const { logout, hydrateAuthFromStorage, clearError } = authSlice.actions;
export default authSlice.reducer;
