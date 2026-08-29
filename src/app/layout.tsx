import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// A warm, handwriting-adjacent serif used for journal entries and headings —
// intentionally different from the UI chrome font so the words the user
// actually writes feel personal, not like they're filling out a form.
const lora = Lora({
  variable: "--font-serif-journal",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Gemini Journal",
  description: "A calm, private space to think out loud with Gemini — just for you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
