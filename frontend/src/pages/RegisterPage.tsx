import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { ApiError, post } from "../utils/apiClient";
import { pageTitles } from "../utils/pageTitles";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{pageTitles.register}</h1>
        <p className="muted">Start tracking your net worth today.</p>
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setIsSubmitting(true);
            try {
              const response = await post<{ token: string }>(
                "/api/register",
                { name, email, password },
                undefined,
                { skipAuth: true },
              );
              login(response.token);
              navigate("/dashboard");
            } catch (err) {
              if (err instanceof ApiError) {
                setError(err.message);
              } else {
                setError("Unable to create account. Please try again.");
              }
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <label>
            Name
            <input
              type="text"
              placeholder="Jane Doe"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
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
            {isSubmitting ? "Creating..." : "Create account"}
          </button>
        </form>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
