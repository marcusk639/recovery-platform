import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { CAN_HELP_WITH, CANNOT_HELP_WITH } from "@/lib/scope-of-practice";

export const metadata: Metadata = {
  title: "Terms of Service — NextStep Recovery",
  description: "The terms governing your use of NextStep Recovery.",
};

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900 first:mt-0">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed text-slate-600">{children}</p>;
}

export default function TermsPage() {
  return (
    <Section className="max-w-3xl">
      <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">
        NextStep Recovery · Last updated: July 4, 2026
      </p>

      <div className="mt-6 rounded-lg border-l-4 border-red-500 bg-red-50 p-4">
        <p className="text-sm text-slate-700">
          <strong>
            If you are experiencing a medical emergency, call 911 or go to your
            nearest emergency room.
          </strong>{" "}
          NextStep Recovery is a non-clinical peer support service. We are not a
          substitute for emergency, medical, or crisis care.
        </p>
      </div>

      <H2>1. Acceptance of Terms</H2>
      <P>
        By using nextsteprecovery.io (the &quot;Site&quot;), submitting our
        contact form, subscribing to our email list, or purchasing a support
        call or digital guide, you agree to be bound by these Terms of Service
        (&quot;Terms&quot;). If you do not agree, do not use the Site.
      </P>

      <H2>2. Description of Service</H2>
      <P>
        NextStep Recovery provides <strong>non-clinical peer support</strong>{" "}
        for people navigating withdrawal and detox, and for their families. We
        are not a healthcare provider, treatment center, or crisis service. We
        do not diagnose, treat, prescribe, or provide medical advice.
      </P>
      <P>What we can help with:</P>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-600">
        {CAN_HELP_WITH.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <P>What we cannot help with:</P>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-600">
        {CANNOT_HELP_WITH.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <P>
        Certain situations you describe to us (see our referral criteria) will
        always be directed to emergency or medical care rather than a scheduled
        call.
      </P>

      <H2>3. Eligibility</H2>
      <P>
        You must be at least 18 years old to use the Site or book a call. If you
        are seeking guidance on behalf of a family member of any age, the adult
        using our services and entering into these Terms must still be 18 or
        older.
      </P>

      <H2>4. Acceptable Use</H2>
      <P>You agree not to:</P>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-600">
        <li>Use the Site for any unlawful purpose</li>
        <li>Submit false, misleading, or fraudulent information</li>
        <li>Harass or threaten us through any communication channel</li>
        <li>
          Attempt to reverse-engineer, scrape, or interfere with the Site or its
          security features
        </li>
      </ul>

      <H2>5. Payments and Billing</H2>
      <P>
        Support calls and donations are processed by Stripe via payment links.
        Digital guides are sold through Lemon Squeezy, which acts as merchant of
        record and handles applicable tax and file delivery. All payment
        processing is governed by Stripe&apos;s and Lemon Squeezy&apos;s own
        terms and privacy policies; we do not store your full payment card
        number.
      </P>
      <P>
        Digital guide purchases are delivered electronically and are generally
        non-refundable once delivered, except where required by law. Call
        bookings may be rescheduled or canceled per the instructions in your
        booking confirmation.
      </P>

      <H2>6. Data and Privacy</H2>
      <P>
        Your use of the Site is governed by our{" "}
        <Link href="/privacy" className="text-teal-700 hover:underline">
          Privacy Policy
        </Link>
        , which is incorporated into these Terms by reference.
      </P>

      <H2>7. Intellectual Property</H2>
      <P>
        The Site and its content — including text, guides, graphics, and
        branding — are owned by or licensed to NextStep Recovery and are
        protected by copyright and other intellectual property laws. Purchased
        digital guides are licensed for your personal use only and may not be
        redistributed or resold.
      </P>

      <H2>8. Third-Party Services</H2>
      <P>
        The Site integrates with Stripe and Lemon Squeezy (payments), MailerLite
        (email), Resend (contact form delivery), and Calendly (scheduling). Your
        use of those services is also governed by their respective terms. We are
        not responsible for the practices of third-party services.
      </P>

      <H2>9. Disclaimers</H2>
      <P>
        THE SITE AND OUR SERVICES ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
        AVAILABLE.&quot; TO THE MAXIMUM EXTENT PERMITTED BY LAW:
      </P>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-600">
        <li>
          We do not warrant that the Site will be uninterrupted, error-free, or
          secure
        </li>
        <li>We do not provide medical, clinical, legal, or financial advice</li>
        <li>
          We are not responsible for the outcome of your or a family
          member&apos;s recovery journey
        </li>
      </ul>

      <H2>10. Limitation of Liability</H2>
      <P>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEXTSTEP RECOVERY
        WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
        OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SITE, EVEN IF WE HAVE
        BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </P>
      <P>
        OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM YOUR USE OF THE
        SITE WILL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS
        PRECEDING THE CLAIM, OR $100, WHICHEVER IS GREATER.
      </P>

      <H2>11. Indemnification</H2>
      <P>
        You agree to indemnify and hold harmless NextStep Recovery from any
        claims, liabilities, or costs arising from your use of the Site in
        violation of these Terms or your violation of any third-party rights.
      </P>

      <H2>12. Termination</H2>
      <P>
        You may stop using the Site or unsubscribe from our email list at any
        time. We may suspend access for anyone who violates these Terms or
        engages in fraudulent or abusive activity.
      </P>

      <H2>13. Governing Law and Dispute Resolution</H2>
      <P>
        These Terms are governed by the laws of{" "}
        <strong>
          [State — to be confirmed once the business entity is formed]
        </strong>
        , without regard to conflict of law principles. We encourage resolution
        of any dispute through direct negotiation first — contact us and we will
        attempt to resolve the issue within 30 days.
      </P>

      <H2>14. Changes to These Terms</H2>
      <P>
        We may update these Terms from time to time. The &quot;Last
        updated&quot; date above reflects the most recent revision. Continued
        use of the Site after a change takes effect constitutes acceptance of
        the updated Terms.
      </P>

      <H2>15. Severability</H2>
      <P>
        If any provision of these Terms is held invalid or unenforceable, the
        remaining provisions will continue in full force and effect.
      </P>

      <H2>16. Contact</H2>
      <P>
        Questions about these Terms: <strong>admin@nextsteprecovery.io</strong>,
        or via our{" "}
        <Link href="/contact" className="text-teal-700 hover:underline">
          contact form
        </Link>
        .
      </P>

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs italic text-slate-400">
        This document is a working draft prepared for launch and has not been
        reviewed by an attorney. It does not constitute legal advice. Have a
        qualified attorney review these Terms — particularly Section 13
        (Governing Law) once your business entity is formed — before relying on
        them as your sole compliance measure.
      </p>
    </Section>
  );
}
