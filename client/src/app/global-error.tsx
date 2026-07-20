"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: "#475569", marginBottom: 16 }}>{error.message || "Unknown error"}</p>
        {error.digest ? (
          <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 16 }}>Digest: {error.digest}</p>
        ) : null}
        <button
          onClick={() => reset()}
          style={{
            background: "#0f172a",
            color: "white",
            padding: "8px 16px",
            borderRadius: 6,
            border: 0,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
