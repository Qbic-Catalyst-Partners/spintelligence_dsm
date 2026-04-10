import "@/styles/globals.css";
import "@/views/carding/betweenWithinCardEntry.css";
import { Provider } from 'react-redux';
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/router";
import FailureModal from "@/components/FailureModal";
import Header from "@/components/Header";
import { subscribeToGlobalFailureModal } from "@/utils/globalFailureModal";
import { hydrateAuthFromStorage } from "@/store/slices/authSlice";
import { hasRouteAccess, isFullAccessUser } from "@/utils/accessControl";
import { store } from '../store';
import "../styles/globals.css";

function AppShell({ Component, pageProps }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth?.token);
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const [failureModal, setFailureModal] = useState({ open: false, message: "Error Occured" });
  const showHeader = router.pathname !== "/";
  const isProtectedRoute = router.pathname !== "/";
  const isDepartmentFlow =
    router.pathname === "/dashboard" || router.pathname.startsWith("/departments");
  const isTicketingFlow =
    router.pathname === "/operator" ||
    router.pathname.startsWith("/operator/") ||
    router.pathname === "/operatordash" ||
    router.pathname.startsWith("/operatordetail") ||
    router.pathname === "/supervisordashboard" ||
    router.pathname === "/supervisordetails";
  const isAdminFlow =
    router.pathname === "/usermanagement" ||
    router.pathname.startsWith("/umadduser") ||
    router.pathname.startsWith("/umedit") ||
    router.pathname.startsWith("/umchangepassword") ||
    router.pathname === "/rolespermission" ||
    router.pathname.startsWith("/Createrole") ||
    router.pathname.startsWith("/editrole");
  const canAccessManagementFlow = isFullAccessUser(user);
  const headerNavLinks = canAccessManagementFlow
    ? [
        { href: "/dashboard", label: "Home" },
        { href: "/usermanagement", label: "User Management" },
        { href: "/rolespermission", label: "Roles & Permissions" },
      ]
    : isDepartmentFlow || isTicketingFlow
    ? [
        { href: "/dashboard", label: "Home" },
        { href: "/operator", label: "Ticketing System" },
      ]
      : undefined;

  useEffect(() => {
    dispatch(hydrateAuthFromStorage());
  }, [dispatch]);

  useEffect(() => {
    return subscribeToGlobalFailureModal(({ message, status }) => {
      const fallbackMessage =
        status >= 500
          ? "Internal Server Error"
          : status === 404
            ? "API Not Found"
            : message || "Error Occured";

      setFailureModal({
        open: true,
        message: fallbackMessage,
      });
    });
  }, []);

  useEffect(() => {
    if (!router.isReady || !isHydrated) {
      return;
    }

    if (!token && isProtectedRoute) {
      router.replace("/");
      return;
    }

    if (token && isAdminFlow && !canAccessManagementFlow) {
      router.replace("/dashboard");
      return;
    }

    if (token && !isAdminFlow && !hasRouteAccess(router.pathname, accessByDepartment, user)) {
      router.replace("/dashboard");
      return;
    }

    if (token && router.pathname === "/") {
      router.replace("/dashboard");
    }
  }, [accessByDepartment, canAccessManagementFlow, isAdminFlow, isHydrated, isProtectedRoute, router, token, user]);

  return (
    <>
      {showHeader && isHydrated && token && <Header navLinks={headerNavLinks} />}
      <Component {...pageProps} />
      <FailureModal
        open={failureModal.open}
        message={failureModal.message}
        onClose={() => setFailureModal({ open: false, message: "Error Occured" })}
      />
    </>
  );
}

export default function App(props) {
  return (
    <Provider store={store}>
      <AppShell {...props} />
    </Provider>
  );
}

