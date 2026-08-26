import { Navigate, Outlet } from "react-router-dom";

function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem("access_token"));
}

export default function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
