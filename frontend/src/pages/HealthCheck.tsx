import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type HealthResponse = {
  status: string;
  db: string;
};

export default function HealthCheck() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: HealthResponse) => setHealth(data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white shadow-md rounded-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold">Traceable PDF Notes Platform</h1>
        {error && <p className="text-red-600 font-medium">Connection failed: {error}</p>}
        {!error && !health && <p className="text-slate-500">Checking backend connection...</p>}
        {health && (
          <div className="space-y-1">
            <p className="text-slate-700">
              API status: <span className="font-semibold">{health.status}</span>
            </p>
            <p className={health.db === "connected" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
              Database: {health.db}
            </p>
          </div>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Link to="/login" className="bg-blue-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-blue-700">
            Log In
          </Link>
          <Link to="/register" className="bg-slate-800 text-white rounded-lg px-4 py-2 font-medium hover:bg-slate-900">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
