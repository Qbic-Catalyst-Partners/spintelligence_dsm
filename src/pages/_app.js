import "@/styles/globals.css";
import "@/views/carding/betweenWithinCardEntry.css";
import { Provider } from 'react-redux';
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/router";
import FailureModal from "@/components/FailureModal";
import Header from "@/components/Header";
import SuccessModal from "@/components/SuccessModal";
import { subscribeToGlobalFailureModal } from "@/utils/globalFailureModal";
import { subscribeToGlobalSuccessModal } from "@/utils/globalSuccessModal";
import { hydrateAuthFromStorage } from "@/store/slices/authSlice";
import { hasRouteAccess, isFullAccessUser, routeDepartmentMap } from "@/utils/accessControl";
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
  const [successModal, setSuccessModal] = useState({ open: false, message: "Data Submitted" });
  const isInputScreen = Boolean(routeDepartmentMap[router.pathname]);
  const isHomeFlow = router.pathname === "/";
  const isLoginScreen = isHomeFlow && !token;
  const showHeader = !isLoginScreen;
  const isDepartmentFlow =
    router.pathname === "/departments/quality-control" ||
    router.pathname.startsWith("/departments") ||
    isInputScreen;
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
    router.pathname === "/threshold-values" ||
    router.pathname === "/submission-threshold" ||
    router.pathname === "/submission-frequency" ||
    router.pathname === "/reports" ||
    router.pathname === "/settings" ||
    router.pathname.startsWith("/Createrole") ||
    router.pathname.startsWith("/editrole");
  const canAccessManagementFlow = isFullAccessUser(user);
  const managementNavLinks = [
    { href: "/", label: "Home" },
    { href: "/usermanagement", label: "User Management" },
    { href: "/rolespermission", label: "Roles & Permissions" },
    { href: "/threshold-values", label: "Threshold Values" },
    { href: "/submission-threshold", label: "Submission Threshold" },
    { href: "/submission-frequency", label: "Submission Frequency" },
    { href: "/reports", label: "Reports" },
    { href: "/settings", label: "Settings" },
  ];
  const headerNavLinks = canAccessManagementFlow || isAdminFlow
    ? managementNavLinks
    : isHomeFlow || isDepartmentFlow || isTicketingFlow
    ? [
        { href: "/", label: "Home" },
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
    return subscribeToGlobalSuccessModal(() => {
      setSuccessModal({
        open: true,
        message: "Data Submitted",
      });
    });
  }, []);

  useEffect(() => {
    if (!router.isReady || !isHydrated) {
      return;
    }

    if (!token) {
      if (!isHomeFlow) {
        router.replace("/");
      }
      return;
    }

    if (token && isAdminFlow && !canAccessManagementFlow) {
      router.replace("/");
      return;
    }

    if (token && !isAdminFlow && !hasRouteAccess(router.pathname, accessByDepartment, user)) {
      router.replace("/");
    }
  }, [accessByDepartment, canAccessManagementFlow, isAdminFlow, isHomeFlow, isHydrated, router, token, user]);

  return (
    <>
      {showHeader && isHydrated && <Header navLinks={headerNavLinks} />}
      <main className={showHeader ? "app-shell-content" : undefined}>
        <Component {...pageProps} />
      </main>
      <FailureModal
        open={failureModal.open}
        message={failureModal.message}
        onClose={() => setFailureModal({ open: false, message: "Error Occured" })}
      />
      <SuccessModal
        open={successModal.open}
        message={successModal.message}
        scope="global"
        onClose={() => setSuccessModal({ open: false, message: "Data Submitted" })}
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
