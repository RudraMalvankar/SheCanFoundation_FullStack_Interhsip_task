import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Keep the name shorter."),
  email: z.string().trim().email("Enter a valid email address."),
  message: z.string().trim().min(10, "Write a slightly longer message.").max(500, "Message is too long."),
});

const defaultValues = {
  name: "",
  email: "",
  message: "",
};

const adminLoginSchema = z.object({
  username: z.string().trim().min(2, "Enter the admin username."),
  password: z.string().min(4, "Enter the admin password."),
});

const ADMIN_TOKEN_KEY = "she-can-admin-token";
const ADMIN_USER_KEY = "she-can-admin-user";

function formatDate(value) {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getInitialPathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function navigateTo(pathname) {
  if (typeof window === "undefined") {
    return;
  }

  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [pathname, setPathname] = useState(getInitialPathname);
  const [adminToken, setAdminToken] = useState(() => (typeof window === "undefined" ? "" : window.localStorage.getItem(ADMIN_TOKEN_KEY) || ""));
  const [adminUser, setAdminUser] = useState(() => (typeof window === "undefined" ? "" : window.localStorage.getItem(ADMIN_USER_KEY) || ""));
  const [adminFetchState, setAdminFetchState] = useState("idle");
  const [adminMessage, setAdminMessage] = useState("Log in to view form submissions.");
  const [submissions, setSubmissions] = useState([]);
  const [adminDb, setAdminDb] = useState("memory");
  const [submitState, setSubmitState] = useState("idle");
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: "onTouched",
  });

  const {
    register: registerAdmin,
    handleSubmit: handleAdminSubmit,
    formState: { errors: adminErrors },
    reset: resetAdminForm,
  } = useForm({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
    mode: "onTouched",
  });

  const canSubmit = submitState !== "loading";
  const statusText = useMemo(() => {
    if (submitState === "success") {
      return "Form Submitted Successfully";
    }

    if (submitState === "error") {
      return "Something went wrong. Please try again.";
    }

    return "Tell us who you are and why you're reaching out.";
  }, [submitState]);

  const dashboardStats = useMemo(() => {
    const latestSubmission = submissions[0];

    return [
      {
        label: "Total submissions",
        value: submissions.length.toString().padStart(2, "0"),
      },
      {
        label: "Storage",
        value: adminDb === "mongo" ? "MongoDB" : "In-memory",
      },
      {
        label: "Latest entry",
        value: latestSubmission ? formatDate(latestSubmission.createdAt) : "None yet",
      },
    ];
  }, [adminDb, submissions]);

  async function loadAdminSubmissions(token) {
    setAdminFetchState("loading");
    setAdminMessage("Loading submissions...");

    try {
      const response = await fetch("/api/admin/submissions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to load submissions.");
      }

      setSubmissions(data.submissions || []);
      setAdminDb(data.database || "memory");
      setAdminMessage("Admin dashboard ready.");
      setAdminFetchState("success");
    } catch (error) {
      setSubmissions([]);
      setAdminFetchState("error");
      setAdminMessage(error.message || "Unable to load submissions.");
    }
  }

  useEffect(() => {
    if (!isAdminRoute || !adminToken) {
      return;
    }

    loadAdminSubmissions(adminToken);
  }, [adminToken, isAdminRoute]);

  const onSubmit = async (values) => {
    setSubmitState("loading");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Submission failed.");
      }

      reset(defaultValues);
      setSubmitState("success");
    } catch (_error) {
      setSubmitState("error");
    }
  };

  const onAdminLogin = async (values) => {
    setAdminFetchState("loading");
    setAdminMessage("Checking credentials...");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Login failed.");
      }

      window.localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      window.localStorage.setItem(ADMIN_USER_KEY, data.username);
      setAdminToken(data.token);
      setAdminUser(data.username);
      resetAdminForm();
      setAdminMessage(`Welcome back, ${data.username}.`);
      await loadAdminSubmissions(data.token);
    } catch (error) {
      setAdminFetchState("error");
      setAdminMessage(error.message || "Invalid admin credentials.");
    }
  };

  const logoutAdmin = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.localStorage.removeItem(ADMIN_USER_KEY);
    setAdminToken("");
    setAdminUser("");
    setSubmissions([]);
    setAdminDb("memory");
    setAdminMessage("Logged out. Admin session cleared.");
    setAdminFetchState("idle");
  };

  const openAdminPage = () => navigateTo("/admin");
  const openHomePage = () => navigateTo("/");

  if (isAdminRoute) {
    return (
      <main className="page-shell admin-shell">
        <section className="admin-card">
          <div className="admin-hero">
            <div>
              <span className="eyebrow admin-eyebrow">Admin Panel</span>
              <h1>Review form submissions in one simple dashboard.</h1>
              <p>Sign in with the admin credentials from your root <span>.env</span> file to view protected messages.</p>
            </div>

            <div className="admin-actions">
              <button type="button" className="secondary-button" onClick={openHomePage}>
                Back to form
              </button>
              {adminToken ? (
                <button type="button" className="secondary-button" onClick={logoutAdmin}>
                  Logout
                </button>
              ) : null}
            </div>
          </div>

          <div className={`status-banner ${adminFetchState}`} aria-live="polite">
            {adminMessage}
          </div>

          {!adminToken ? (
            <div className="admin-login-layout">
              <div className="admin-panel-copy">
                <strong>Protected access</strong>
                <p>Use the values set in the root <span>.env</span> file. The login returns a short-lived JWT token.</p>
                <div className="mini-notes">
                  <div>
                    <span>Route</span>
                    <strong>/admin</strong>
                  </div>
                  <div>
                    <span>Hint</span>
                    <strong>admin / admin123</strong>
                  </div>
                </div>
              </div>

              <div className="form-panel admin-login-panel">
                <form className="contact-form" onSubmit={handleAdminSubmit(onAdminLogin)} noValidate>
                  <label>
                    <span>Admin username</span>
                    <input type="text" placeholder="admin" aria-describedby="admin-username-hint" {...registerAdmin("username")} />
                    <small id="admin-username-hint" className="input-hint">Hint: admin</small>
                    {adminErrors.username ? <em>{adminErrors.username.message}</em> : null}
                  </label>

                  <label>
                    <span>Password</span>
                    <input type="password" placeholder="admin123" aria-describedby="admin-password-hint" {...registerAdmin("password")} />
                    <small id="admin-password-hint" className="input-hint">Hint: admin123</small>
                    {adminErrors.password ? <em>{adminErrors.password.message}</em> : null}
                  </label>

                  <button type="submit" disabled={adminFetchState === "loading"}>
                    {adminFetchState === "loading" ? "Signing in..." : "Open admin dashboard"}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="admin-dashboard">
              <div className="admin-welcome">
                <div>
                  <span className="dashboard-kicker">Signed in as</span>
                  <h2>{adminUser || "admin"}</h2>
                </div>
                <button type="button" className="secondary-button" onClick={() => loadAdminSubmissions(adminToken)}>
                  Refresh
                </button>
              </div>

              <div className="stats-grid">
                {dashboardStats.map((stat) => (
                  <article className="stat-card" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </article>
                ))}
              </div>

              <div className="submissions-panel">
                <div className="submissions-header">
                  <div>
                    <span className="dashboard-kicker">Protected records</span>
                    <h3>Recent form submissions</h3>
                  </div>
                  <span className="submissions-count">{submissions.length} entries</span>
                </div>

                {adminFetchState === "loading" && submissions.length === 0 ? (
                  <p className="empty-state">Loading submissions...</p>
                ) : submissions.length === 0 ? (
                  <p className="empty-state">No submissions yet. When someone submits the form, their message will appear here.</p>
                ) : (
                  <div className="submissions-list">
                    {submissions.map((submission) => (
                      <article className="submission-card" key={submission.id}>
                        <div className="submission-meta">
                          <div>
                            <strong>{submission.name}</strong>
                            <span>{submission.email}</span>
                          </div>
                          <time>{formatDate(submission.createdAt)}</time>
                        </div>
                        <p>{submission.message}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <div>
          <span className="brand-name">She Can Foundation</span>
          <p className="site-subtitle">Simple contact form and secure admin access</p>
        </div>

        <div className="site-header-actions">
          <button type="button" className="secondary-button" onClick={openAdminPage}>
            Admin page
          </button>
        </div>
      </header>

      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">She Can Foundation</span>
          <h1>Support women through education, health, and opportunity.</h1>
          <p>
            A minimal MERN site with a dependable contact form, validated submission flow, and a protected admin view.
          </p>
        </div>

        <div className="form-panel">
          <div className={`status-banner ${submitState}`} aria-live="polite">
            {statusText}
          </div>

          <div className="form-intro">
            <span className="eyebrow form-eyebrow">Contact us</span>
            <h2>Send a message to the foundation team.</h2>
            <p>Use this form for volunteer interest, partnership ideas, or general questions.</p>
          </div>

          <form className="contact-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <label>
              <span>Name</span>
              <input type="text" placeholder="Your full name" {...register("name")} />
              {errors.name ? <em>{errors.name.message}</em> : null}
            </label>

            <label>
              <span>Email</span>
              <input type="email" placeholder="you@example.com" {...register("email")} />
              {errors.email ? <em>{errors.email.message}</em> : null}
            </label>

            <label>
              <span>Message</span>
              <textarea rows="5" placeholder="Write your message here" {...register("message")} />
              {errors.message ? <em>{errors.message.message}</em> : null}
            </label>

            <button type="submit" disabled={!canSubmit}>
              {submitState === "loading" ? "Submitting..." : "Submit"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}