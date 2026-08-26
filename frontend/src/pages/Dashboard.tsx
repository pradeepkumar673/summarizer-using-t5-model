import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMe, type UserPublic } from "../api/auth";

export default function Dashboard() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [error] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("access_token");
        navigate("/login");
      });
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem("access_token");
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white shadow-md rounded-xl p-8 w-full max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {error && <p className="text-red-600">{error}</p>}
        {!user && !error && <p className="text-slate-500">Loading...</p>}
        {user && (
          <div>
            <p className="text-slate-700">
              Logged in as <span className="font-semibold">{user.email}</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">User ID: {user.id}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="bg-slate-800 text-white rounded-lg px-4 py-2 font-medium hover:bg-slate-900"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
