import "@/styles/globals.css";
import "@/views/carding/betweenWithinCardEntry.css";
import { Provider } from 'react-redux';
import { useRouter } from "next/router";
import Header from "@/components/Header";
import { store } from '../store';
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const showHeader = router.pathname !== "/";
  const isDepartmentFlow =
    router.pathname === "/dashboard" || router.pathname.startsWith("/departments");
  const headerNavLinks = isDepartmentFlow
    ? [
        { href: "/dashboard", label: "Home" },
        { href: "/operator", label: "Ticketing System" },
      ]
    : undefined;

  return (
    <Provider store={store}>
      {showHeader && <Header navLinks={headerNavLinks} />}
      <Component {...pageProps} />
    </Provider>
  );
}

