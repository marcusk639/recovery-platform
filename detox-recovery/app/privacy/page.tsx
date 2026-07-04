import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Privacy Policy — NextStep Recovery",
  description:
    "How NextStep Recovery collects, uses, and protects your information.",
};

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900 first:mt-0">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-lg font-semibold text-slate-800">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed text-slate-600">{children}</p>;
}

export default function PrivacyPage() {
  return (
    <Section className="max-w-3xl">
      <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">
        NextStep Recovery · Last updated: July 4, 2026
      </p>

      <div className="mt-6 rounded-lg border-l-4 border-teal-600 bg-teal-50 p-4">
        <p className="text-sm text-slate-700">
          NextStep Recovery is a{" "}
          <strong>non-clinical peer support navigation practice</strong>. This
          policy covers our website, contact forms, email lists, and paid
          services. It does not make us a healthcare provider, and nothing here
          changes that scope — see{" "}
          <Link href="/terms" className="text-teal-700 hover:underline">
            Terms of Service
          </Link>{" "}
          for details.
        </p>
      </div>

      <H2>1. Introduction</H2>
      <P>
        This Privacy Policy explains how NextStep Recovery (&quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;) collects, uses, and discloses
        information when you use nextsteprecovery.io (the &quot;Site&quot;),
        submit our contact form, subscribe to our email list, or purchase a
        support call or digital guide.
      </P>

      <H2>2. Information We Collect</H2>

      <H3>2.1 Contact Form Submissions</H3>
      <P>
        When you submit our contact form, we collect your name, email address,
        message, and the topic you selected (e.g. support call, family guidance,
        B2B consulting). This is sent to us via email (Resend) so we can respond
        to you directly.
      </P>

      <H3>2.2 Newsletter and Guide Signups</H3>
      <P>
        When you subscribe to our newsletter or request a free guide, we collect
        your email address and store it with MailerLite, our email provider,
        tagged by which list or guide you signed up for.
      </P>

      <H3>2.3 Payment Information</H3>
      <P>
        Support calls and donations are processed by Stripe via payment links.
        Digital guides (PDFs) are sold through Lemon Squeezy, which acts as
        merchant of record and handles checkout, tax, and file delivery. We do
        not receive or store your full card number in either case — Stripe and
        Lemon Squeezy handle payment data under their own PCI-DSS-compliant
        systems.
      </P>

      <H3>2.4 Usage and Technical Data</H3>
      <P>
        We may collect standard technical data (IP address, browser type, pages
        visited, referring page) to keep the Site secure and understand how
        it&apos;s used. See{" "}
        <Link href="#analytics" className="text-teal-700 hover:underline">
          Section 8, Analytics
        </Link>
        .
      </P>

      <H2>3. How We Use Your Information</H2>
      <P>We use the information we collect to:</P>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-600">
        <li>Respond to your contact form submission or booking request</li>
        <li>Deliver the guide or newsletter content you signed up for</li>
        <li>Process and confirm payment for a call or digital product</li>
        <li>Maintain the security and reliability of the Site</li>
        <li>Understand aggregate usage to improve our content and services</li>
      </ul>
      <P>We do not sell your personal information to third parties.</P>

      <H2>4. Non-Clinical Scope</H2>
      <P>
        NextStep Recovery provides non-clinical peer support and navigation
        guidance only. We are not a healthcare provider, and information you
        share with us through the contact form or a call is not medical
        information, protected health information (PHI) under HIPAA, or a
        substitute for medical or emergency care.
      </P>
      <P>
        <strong>
          If you are experiencing a medical emergency, call 911 or go to your
          nearest emergency room.
        </strong>{" "}
        Certain situations you describe to us may prompt a referral to emergency
        or medical care rather than a scheduled call — see our{" "}
        <Link href="/terms" className="text-teal-700 hover:underline">
          Terms of Service
        </Link>{" "}
        for the full scope of what we can and cannot help with.
      </P>

      <H2>5. Information Sharing</H2>
      <P>We share information only in the following circumstances:</P>

      <H3>5.1 Service Providers</H3>
      <P>
        We use the following third-party processors to operate the Site and
        deliver our services:
      </P>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-slate-700">
              <th className="py-2 pr-4">Service</th>
              <th className="py-2 pr-4">Purpose</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">Resend</td>
              <td className="py-2 pr-4">Contact form email delivery</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">MailerLite</td>
              <td className="py-2 pr-4">Newsletter and guide delivery</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">Stripe</td>
              <td className="py-2 pr-4">
                Payment processing for calls and donations
              </td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">Lemon Squeezy</td>
              <td className="py-2 pr-4">
                Payment, tax, and delivery for digital guides
              </td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">Calendly</td>
              <td className="py-2 pr-4">Scheduling for booked calls</td>
            </tr>
          </tbody>
        </table>
      </div>

      <H3>5.2 Cross-Platform Referrals (currently inactive)</H3>
      <P>
        NextStep Recovery is part of a small family of recovery-focused
        products. We have built, but not yet activated, the ability to refer a
        contact-form submission to a sibling product (for sober-living housing
        or 12-step meeting support) when you explicitly indicate that&apos;s
        what you&apos;re looking for. This feature is currently disabled. If and
        when it is activated, this policy will be updated first, and a referral
        will only ever be created based on the specific interest you select —
        not automatically or without your input.
      </P>

      <H3>5.3 Legal Requirements</H3>
      <P>
        We may disclose information if required by law, court order, or to
        protect the safety of a user or the public.
      </P>

      <H3>5.4 Business Transfers</H3>
      <P>
        If NextStep Recovery is acquired or merges with another entity, your
        information may transfer to the successor entity under the same
        confidentiality obligations described here.
      </P>

      <H2>6. Data Retention</H2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-slate-700">
              <th className="py-2 pr-4">Data Type</th>
              <th className="py-2 pr-4">Retention</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">Contact form submissions</td>
              <td className="py-2 pr-4">
                Retained in email until manually deleted
              </td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">Newsletter / guide subscribers</td>
              <td className="py-2 pr-4">
                Until you unsubscribe or request deletion
              </td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-4">Payment records</td>
              <td className="py-2 pr-4">
                7 years (accounting/tax requirements)
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <H2>7. Your Rights</H2>
      <P>You may request to:</P>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-600">
        <li>Access a copy of the personal data we hold about you</li>
        <li>Correct inaccurate data</li>
        <li>Delete your data, including unsubscribing from all email lists</li>
        <li>Receive your data in a portable format</li>
      </ul>
      <P>
        To exercise any of these rights, contact us via the{" "}
        <Link href="/contact" className="text-teal-700 hover:underline">
          contact form
        </Link>{" "}
        or email <strong>privacy@nextsteprecovery.io</strong>.
      </P>

      <h2
        id="analytics"
        className="mt-10 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900"
      >
        8. Analytics
      </h2>
      <P>
        We use privacy-focused analytics to understand aggregate Site usage
        (e.g. which pages are visited, not who visits them individually). We do
        not use analytics for advertising or resell any usage data.
      </P>

      <H2>9. Children</H2>
      <P>
        The Site is intended for adults 18 and older, or family members seeking
        guidance on behalf of a loved one. We do not knowingly collect personal
        information directly from anyone under 18. If you believe a minor has
        submitted personal information to us, contact us and we will delete it.
      </P>

      <H2>10. Security</H2>
      <P>
        All data in transit is encrypted via HTTPS/TLS. Our contact and
        subscription forms are protected against automated abuse (origin checks,
        rate limiting, and a honeypot field). No system is completely secure —
        if you discover a vulnerability, please report it to{" "}
        <strong>security@nextsteprecovery.io</strong> rather than disclosing it
        publicly.
      </P>

      <H2>11. Changes to This Policy</H2>
      <P>
        We may update this Privacy Policy from time to time. Material changes
        will be reflected by updating the &quot;Last updated&quot; date above.
        Continued use of the Site after a change takes effect constitutes
        acceptance of the update.
      </P>

      <H2>12. Contact</H2>
      <P>
        Questions about this policy or your data:{" "}
        <strong>privacy@nextsteprecovery.io</strong>, or via our{" "}
        <Link href="/contact" className="text-teal-700 hover:underline">
          contact form
        </Link>
        .
      </P>

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs italic text-slate-400">
        This document is a working draft prepared for launch and has not been
        reviewed by an attorney. It does not constitute legal advice. Have a
        qualified attorney review this policy before relying on it as your sole
        compliance measure.
      </p>
    </Section>
  );
}
