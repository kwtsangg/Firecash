import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { ApiError, post } from "../utils/apiClient";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="muted">Sign in to track your assets.</p>
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setIsSubmitting(true);
            try {
              const response = await post<{ token: string }>(
                "/api/login",
                { email, password },
                undefined,
                { skipAuth: true },
              );
              login(response.token);
              navigate("/dashboard");
            } catch (err) {
              if (err instanceof ApiError) {
                setError(err.message);
              } else {
                setError("Unable to sign in. Please try again.");
              }
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <label>
            Email
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="pill primary" type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="muted">
          Don’t have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
