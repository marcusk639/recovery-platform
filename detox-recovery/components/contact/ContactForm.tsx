"use client";

import { useRef, useState } from "react";
import { HoneypotInput } from "@/components/forms/HoneypotInput";

const INTERESTS = [
  "Patient-Experience Training",
  "Withdrawal Journey Mapping",
  "Communication Workshops",
  "Dropout / Friction Analysis",
  "Patient Education Review",
  "Digital Health Startup Advisory",
  "Sober Living / Housing",
  "12-Step / Homegroup Support",
  "Other",
] as const;

type Interest = (typeof INTERESTS)[number];

interface Fields {
  name: string;
  email: string;
  organization: string;
  interest: Interest | "";
  message: string;
}

const INITIAL: Fields = {
  name: "",
  email: "",
  organization: "",
  interest: "",
  message: "",
};

interface ContactFormProps {
  defaultInterest?: string;
}

export function ContactForm({ defaultInterest = "" }: ContactFormProps) {
  const resolvedInterest = INTERESTS.includes(defaultInterest as Interest)
    ? (defaultInterest as Interest)
    : "";
  const [fields, setFields] = useState<Fields>({
    ...INITIAL,
    interest: resolvedInterest,
  });
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const honeypotRef = useRef<HTMLInputElement>(null);

  const set =
    (key: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      if (status === "error") {
        setStatus("idle");
        setErrorMsg("");
      }
      setFields((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          website: honeypotRef.current?.value ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
      } else {
        setStatus("success");
        setFields(INITIAL);
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50";

  if (status === "success") {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-8 text-center">
        <p className="text-lg font-semibold text-teal-800">Message received.</p>
        <p className="mt-2 text-sm text-slate-600">
          I&apos;ll be in touch within 2 business days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <HoneypotInput ref={honeypotRef} />
      <p className="text-xs text-slate-500">
        <span aria-hidden="true" className="text-red-500">
          *
        </span>{" "}
        Required
      </p>

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          Name{" "}
          <span aria-hidden="true" className="text-red-500">
            *
          </span>
        </label>
        <input
          id="name"
          type="text"
          value={fields.name}
          onChange={set("name")}
          required
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700"
        >
          Email{" "}
          <span aria-hidden="true" className="text-red-500">
            *
          </span>
        </label>
        <input
          id="email"
          type="email"
          value={fields.email}
          onChange={set("email")}
          required
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="organization"
          className="block text-sm font-medium text-slate-700"
        >
          Organization{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="organization"
          type="text"
          value={fields.organization}
          onChange={set("organization")}
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="interest"
          className="block text-sm font-medium text-slate-700"
        >
          Area of interest{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <select
          id="interest"
          value={fields.interest}
          onChange={set("interest")}
          disabled={status === "loading"}
          className={inputClass}
        >
          <option value="">Select an area…</option>
          {INTERESTS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="message"
          className="block text-sm font-medium text-slate-700"
        >
          Message{" "}
          <span aria-hidden="true" className="text-red-500">
            *
          </span>
        </label>
        <textarea
          id="message"
          value={fields.message}
          onChange={set("message")}
          required
          rows={5}
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      <p role="alert" className="text-sm text-red-600 min-h-[1.25rem]">
        {status === "error" ? errorMsg : ""}
      </p>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {status === "loading" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
