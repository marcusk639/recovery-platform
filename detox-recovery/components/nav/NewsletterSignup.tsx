"use client";

import { useId, useRef, useState } from "react";
import { HoneypotInput } from "@/components/forms/HoneypotInput";

export function NewsletterSignup() {
  const uid = useId();
  const inputId = `newsletter-email-${uid}`;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "subscribed" | "error"
  >("idle");
  const honeypotRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        tag: "newsletter-withdrawal-field-notes",
        website: honeypotRef.current?.value ?? "",
      }),
    }).catch(() => null);
    if (res?.ok) {
      setStatus("subscribed");
    } else {
      setStatus("error");
    }
  };

  if (status === "subscribed") {
    return (
      <p className="mt-2 text-sm font-medium text-teal-700">Subscribed.</p>
    );
  }

  return (
    <form className="mt-3 flex flex-col gap-1" onSubmit={handleSubmit}>
      <HoneypotInput ref={honeypotRef} />
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="email"
          value={email}
          onChange={(e) => {
            if (status === "error") setStatus("idle");
            setEmail(e.target.value);
          }}
          placeholder="Your email"
          required
          disabled={status === "loading"}
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {status === "loading" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      <p role="alert" className="min-h-[1rem] text-xs text-red-600">
        {status === "error" ? "Something went wrong. Please try again." : ""}
      </p>
    </form>
  );
}
