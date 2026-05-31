import Link from "next/link";
import { NewsletterSignup } from "@/components/nav/NewsletterSignup";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-900">Withdrawal Support</p>
            <p className="mt-2 text-sm text-slate-600">
              Non-clinical support for people navigating withdrawal and the
              people who care about them.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Services</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>
                <Link
                  href="/services#fit-check"
                  className="hover:text-teal-700"
                >
                  Free Fit Check
                </Link>
              </li>
              <li>
                <Link
                  href="/services#support-call"
                  className="hover:text-teal-700"
                >
                  Support Call
                </Link>
              </li>
              <li>
                <Link href="/consulting" className="hover:text-teal-700">
                  For Clinicians
                </Link>
              </li>
              <li>
                <Link href="/resources" className="hover:text-teal-700">
                  Resources
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Withdrawal Field Notes
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Practical notes on withdrawal, treatment, and recovery.
            </p>
            <NewsletterSignup />
          </div>
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
          <p>
            This service provides non-clinical support only. It is not medical
            care, crisis intervention, diagnosis, or treatment. If you are
            experiencing a medical emergency, call 911 or go to your nearest
            emergency room.
          </p>
        </div>
      </div>
    </footer>
  );
}
