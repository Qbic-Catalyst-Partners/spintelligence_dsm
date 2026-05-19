import { useSelector } from "react-redux";

import HomeDashboard from "@/views/home/HomeDashboard";
import Login from "../views/Login";

export default function Home() {
  const token = useSelector((state) => state.auth?.token);

  if (!token) {
    return <Login />;
  }

  return <HomeDashboard />;
}
