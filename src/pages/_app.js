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
import {
  getDefaultTicketingLabel,
  getDefaultTicketingRoute,
  hasReportAccess,
  hasRouteAccess,
  isFullAccessUser,
  isSubmittedNotebookManagerUser,
  routeDepartmentMap,
} from "@/utils/accessControl";
import { store } from '../store';
import "../styles/globals.css";

const THEME_STORAGE_KEY = "spintelligence-theme";

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
  const isDepartmentFlow =
    router.pathname === "/departments/quality-control" ||
    router.pathname === "/departments/[department]" ||
    router.pathname === "/departments/[department]/[subDepartment]";
  const isLoginScreen = isHomeFlow && !token;
  const showHeader = !isLoginScreen;
  const isTicketingFlow =
    router.pathname === "/operator" ||
    router.pathname.startsWith("/operator/") ||
    router.pathname === "/operatordash" ||
    router.pathname.startsWith("/operatordetail") ||
    router.pathname === "/supervisordashboard" ||
    router.pathname === "/supervisordetails" ||
    router.pathname === "/submitted-notebooks" ||
    router.pathname === "/submitted-notebook-threshold" ||
    router.pathname === "/ticket-calendar" ||
    router.pathname === "/ticket-calendar-l2" ||
    router.pathname === "/l1-analysis" ||
    router.pathname === "/l2-analysis";
  const isAdminFlow =
    router.pathname === "/usermanagement" ||
    router.pathname.startsWith("/umadduser") ||
    router.pathname.startsWith("/umedit") ||
    router.pathname.startsWith("/umchangepassword") ||
    router.pathname === "/rolespermission" ||
    router.pathname === "/threshold-values" ||
    router.pathname === "/submission-threshold" ||
    router.pathname === "/settings" ||
    router.pathname.startsWith("/Createrole") ||
    router.pathname.startsWith("/editrole");
  const isReportsFlow = router.pathname === "/reports" || router.pathname.startsWith("/reports/");
  const canAccessManagementFlow = isFullAccessUser(user);
  const canAccessSubmittedNotebooks = isSubmittedNotebookManagerUser(user);
  const defaultTicketingRoute = getDefaultTicketingRoute(user);
  const defaultTicketingLabel = getDefaultTicketingLabel(user);
  const managementNavLinks = [
    { href: "/", label: "Home" },
    { href: "/ticket-calendar", label: "Analytic" },
    { href: "/usermanagement", label: "User Management" },
    { href: "/rolespermission", label: "Roles & Permissions" },
    { href: "/threshold-values", label: "Threshold Values" },
    { href: "/submission-threshold", label: "Submission Threshold" },
    { href: "/reports/custom", label: "Reports" },
    { href: "/submitted-notebooks", label: "Submitted Notebooks" },
    { href: "/submitted-notebook-threshold", label: "Acknowledgement Threshold" },
    { href: "/ticket-calendar", label: "Ticket Calendar" },
    { href: "/settings", label: "Settings" },
  ];
  const headerNavLinks = canAccessManagementFlow
    ? managementNavLinks
    : isHomeFlow || isDepartmentFlow || isTicketingFlow || Boolean(token)
    ? [
        { href: "/", label: "Home" },
        { href: defaultTicketingRoute, label: defaultTicketingLabel },
        { href: "/submitted-notebooks", label: "Submitted Notebooks" },
        { href: "/ticket-calendar", label: "Analytic" },
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
    return subscribeToGlobalSuccessModal(({ message }) => {
      if (isInputScreen) {
        return;
      }

      setSuccessModal({
        open: true,
        message: message || "Data Submitted",
      });
    });
  }, [isInputScreen]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const inputDepartment = routeDepartmentMap[router.pathname];
    document.documentElement.dataset.inputScreen = isInputScreen ? "true" : "false";
    document.documentElement.dataset.inputDepartment =
      isInputScreen && inputDepartment
        ? String(inputDepartment).trim().toLowerCase().replace(/\s+/g, "-")
        : "";

    if (isLoginScreen) {
      document.documentElement.dataset.theme = "light";
      return;
    }

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    document.documentElement.dataset.theme =
      savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light";
  }, [isInputScreen, isLoginScreen, router.pathname]);

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

    if (token && isReportsFlow && !hasReportAccess(accessByDepartment, user)) {
      router.replace("/");
      return;
    }

    if (
      token &&
      (router.pathname === "/submitted-notebooks" || router.pathname === "/submitted-notebook-threshold") &&
      !canAccessSubmittedNotebooks
    ) {
      router.replace("/");
      return;
    }

    if (token && isAdminFlow && !canAccessManagementFlow) {
      router.replace("/");
      return;
    }

    if (token && !isAdminFlow && !isReportsFlow && !hasRouteAccess(router.pathname, accessByDepartment, user)) {
      router.replace("/");
    }
  }, [accessByDepartment, canAccessManagementFlow, canAccessSubmittedNotebooks, isAdminFlow, isHomeFlow, isHydrated, isReportsFlow, router, token, user]);

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
