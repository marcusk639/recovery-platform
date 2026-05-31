"use client";

import { useRef, useState } from "react";
import { Section } from "@/components/ui/Section";
import { HoneypotInput } from "@/components/forms/HoneypotInput";

export function B2BLeadMagnet() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
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
        tag: "lead-magnet-b2b",
        website: honeypotRef.current?.value ?? "",
      }),
    }).catch(() => null);
    setStatus(res?.ok ? "success" : "error");
  };

  return (
    <Section className="bg-teal-50">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-slate-900">
          10 Ways Detox Programs Lose Patient Trust Before Treatment Even Starts
        </h2>
        <p className="mt-4 text-slate-600">
          A free guide — pattern recognition from hundreds of patient-side
          withdrawal experiences.
        </p>
        {status === "success" ? (
          <p className="mt-8 text-sm font-medium text-teal-700">
            Check your inbox for the guide.
          </p>
        ) : (
          <form
            className="mx-auto mt-8 flex max-w-md gap-2"
            onSubmit={handleSubmit}
          >
            <HoneypotInput ref={honeypotRef} />
            <label htmlFor="b2b-email" className="sr-only">
              Work email address
            </label>
            <input
              id="b2b-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your work email"
              required
              disabled={status === "loading"}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {status === "loading" ? "Sending…" : "Download free guide"}
            </button>
          </form>
        )}
        <p role="alert" className="mt-3 min-h-[1rem] text-xs text-red-600">
          {status === "error" ? "Something went wrong. Please try again." : ""}
        </p>
      </div>
    </Section>
  );
}
