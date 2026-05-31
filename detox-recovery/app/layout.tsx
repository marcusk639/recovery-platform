import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header } from "@/components/nav/Header";
import { Footer } from "@/components/nav/Footer";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

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
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
