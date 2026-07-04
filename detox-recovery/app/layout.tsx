import type { Metadata } from "next";
import Script from "next/script";
import { Geist } from "next/font/google";
import { Header } from "@/components/nav/Header";
import { Footer } from "@/components/nav/Footer";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export const metadata: Metadata = {
  title: "Withdrawal Support — Find Your Next Safe Step",
  description:
    "Non-clinical support for people navigating withdrawal and the people who care about them.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-white text-slate-900`}>
        {PLAUSIBLE_DOMAIN ? (
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        ) : null}
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
