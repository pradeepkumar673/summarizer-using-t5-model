import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser } from "../api/auth";
import axios from "axios";
import Logo from "../components/sketch/Logo";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token } = await registerUser(email, password);
      localStorage.setItem("access_token", access_token);
      navigate("/dashboard");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-checkered flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-sm p-8 space-y-6 relative"
        style={{
          border: "3px solid #1c1b1b",
          borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
          boxShadow: "5px 5px 0px #1c1b1b",
          transform: "rotate(1deg)",
        }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <Logo size="lg" />
        </div>

        <h1
          className="font-marker text-2xl text-center text-on-surface"
          style={{ transform: "rotate(-0.5deg)" }}
        >
          Create Account
        </h1>

        {error && (
          <div
            className="bg-error-container px-3 py-2 font-body text-body-md text-on-error-container"
            style={{ border: "1px solid #ba1a1a", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
          >
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-surface-container-lowest border-b-2 border-on-surface px-2 py-2 font-body text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
            Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-container-lowest border-b-2 border-on-surface px-2 py-2 font-body text-body-md text-on-surface focus:outline-none focus:border-primary transition-colors"
            placeholder="Min. 8 characters"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 font-label-caps text-label-caps text-on-surface transition-colors disabled:opacity-50 hover:bg-tertiary/10 active:scale-95"
          style={{
            border: "3px solid #1c1b1b",
            borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
            boxShadow: "3px 3px 0px #1c1b1b",
          }}
        >
          {loading ? "Registering..." : "Register"}
        </button>

        <p className="font-body text-body-md text-center text-on-surface-variant">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-semibold hover:underline underline-offset-2">
            Log In
          </Link>
        </p>
      </form>
    </div>
  );
}
