import "@/styles/globals.css";
import "@/views/carding/betweenWithinCardEntry.css";
import { Provider } from 'react-redux';
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import FailureModal from "@/components/FailureModal";
import Header from "@/components/Header";
import { subscribeToGlobalFailureModal } from "@/utils/globalFailureModal";
import { store } from '../store';
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [failureModal, setFailureModal] = useState({ open: false, message: "Error Occured" });
  const showHeader = router.pathname !== "/";
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
  const headerNavLinks = isDepartmentFlow || isTicketingFlow
    ? [
        { href: "/dashboard", label: "Home" },
        { href: "/operator", label: "Ticketing System" },
      ]
    : isAdminFlow
      ? [
          { href: "/dashboard", label: "Home" },
          { href: "/usermanagement", label: "User Management" },
          { href: "/rolespermission", label: "Roles & Permissions" },
        ]
      : undefined;

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

  return (
    <Provider store={store}>
      {showHeader && <Header navLinks={headerNavLinks} />}
      <Component {...pageProps} />
      <FailureModal
        open={failureModal.open}
        message={failureModal.message}
        onClose={() => setFailureModal({ open: false, message: "Error Occured" })}
      />
    </Provider>
  );
}

