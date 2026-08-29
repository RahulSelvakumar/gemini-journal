"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { useAuth } from "@/lib/auth-context";

// Maps common Firebase Auth error codes to actionable messages, since the raw
// codes ("auth/operation-not-allowed", "auth/unauthorized-domain") are only
// meaningful to whoever owns the Firebase project's console settings.
function describeAuthError(code: string): string {
  switch (code) {
    case "auth/operation-not-allowed":
      return "Google sign-in isn't enabled yet for this project. Enable it in Firebase Console → Authentication → Sign-in method.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorized for sign-in yet. Add it in Firebase Console → Authentication → Settings → Authorized domains.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
    default:
      return `Sign-in failed (${code}). Please try again.`;
  }
}

/** Subtle pointer-driven 3D tilt for the sign-in card — cheap, dependency-light
 * "3D motion" feel without pulling in a full 3D engine. */
function TiltCard({ children }: { children: React.ReactNode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 150, damping: 20 });
  const glow = useMotionTemplate`radial-gradient(500px circle at ${x}px ${y}px, rgba(124,58,237,0.18), transparent 70%)`;

  return (
    <motion.div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        x.set(px);
        y.set(py);
        rotateY.set(((px - rect.width / 2) / rect.width) * 10);
        rotateX.set(-((py - rect.height / 2) / rect.height) * 10);
      }}
      onMouseLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className="relative rounded-3xl border border-white/20 bg-white/70 p-10 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/60"
    >
      <motion.div className="pointer-events-none absolute inset-0 rounded-3xl" style={{ background: glow }} />
      {children}
    </motion.div>
  );
}

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/journal");
  }, [user, loading, router]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(describeAuthError(err.code));
      } else {
        setError("Unexpected error during sign-in. Please try again.");
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-16">
      <div className="aurora-bg" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <TiltCard>
          <div className="relative flex flex-col items-center gap-6 text-center">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
              className="text-4xl"
            >
              ✨
            </motion.span>
            <div>
              <h1 className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                Personal Gemini Journal
              </h1>
              <p className="mt-3 max-w-sm text-sm text-zinc-600 dark:text-zinc-300">
                Brainstorm and journal privately with Gemini. Sign in to get a space
                that&apos;s isolated to only you — no one else can see your entries.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSignIn}
              disabled={loading || signingIn}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 px-7 py-3 font-medium text-white shadow-lg shadow-fuchsia-500/25 transition-opacity disabled:opacity-50"
            >
              {signingIn ? "Signing in…" : "Sign in with Google"}
            </motion.button>
            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-sm text-sm text-red-500"
              >
                {error}
              </motion.p>
            )}
          </div>
        </TiltCard>
      </motion.div>
    </div>
  );
}
