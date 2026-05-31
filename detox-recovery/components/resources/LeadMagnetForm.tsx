"use client";

import { useId, useRef, useState } from "react";
import { HoneypotInput } from "@/components/forms/HoneypotInput";

interface LeadMagnetFormProps {
  title: string;
  description: string;
  tag: string;
  buttonLabel?: string;
}

export function LeadMagnetForm({
  title,
  description,
  tag,
  buttonLabel = "Send me the guide",
}: LeadMagnetFormProps) {
  const uid = useId();
  const inputId = `lead-magnet-email-${uid}`;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const honeypotRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          tag,
          website: honeypotRef.current?.value ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 p-6">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>

      {status === "success" ? (
        <p className="mt-4 text-sm font-medium text-teal-700">
          You&apos;re in. Check your inbox.
        </p>
      ) : (
        <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
          <HoneypotInput ref={honeypotRef} />
          <label htmlFor={inputId} className="sr-only">
            Email address
          </label>
          <input
            id={inputId}
            type="email"
            value={email}
            onChange={(e) => {
              if (status === "error") {
                setStatus("idle");
                setErrorMsg("");
              }
              setEmail(e.target.value);
            }}
            placeholder="Your email address"
            required
            disabled={status === "loading"}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {status === "loading" ? "Sending…" : buttonLabel}
          </button>
        </form>
      )}

      <p role="alert" className="mt-2 min-h-[1rem] text-xs text-red-600">
        {status === "error" ? errorMsg : ""}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
