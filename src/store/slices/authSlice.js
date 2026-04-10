import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getAccessibleScreensByRole, loginAPI } from '../../apis/login';
import { setAuthToken } from '../../apis/apiConfig';

const AUTH_USER_STORAGE_KEY = 'authUser';
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

const clearLegacyStoredAuth = () => {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.removeItem('token');
    localStorage.removeItem(ACCESSIBLE_SCREENS_STORAGE_KEY);
    localStorage.removeItem(ACCESS_BY_DEPARTMENT_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
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
            clearLegacyStoredAuth();
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
                clearLegacyStoredAuth();
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
