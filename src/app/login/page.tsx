"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { FloatingParticles } from "@/components/floating-particles";

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

const PROMPTS = [
  "What's on your mind right now?",
  "What are you grateful for today?",
  "What would you tell your future self?",
  "What's a small win from today?",
];

/** Subtle pointer-driven 3D tilt for the sign-in card — cheap, dependency-light
 * "3D motion" feel without pulling in a full 3D engine or feeling gimmicky. */
function TiltCard({ children }: { children: React.ReactNode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 120, damping: 22 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 120, damping: 22 });
  const glow = useMotionTemplate`radial-gradient(500px circle at ${x}px ${y}px, rgba(255,179,123,0.16), transparent 70%)`;

  return (
    <motion.div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        x.set(px);
        y.set(py);
        rotateY.set(((px - rect.width / 2) / rect.width) * 6);
        rotateX.set(-((py - rect.height / 2) / rect.height) * 6);
      }}
      onMouseLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className="paper-card relative rounded-[2rem] border border-black/5 p-10 shadow-[0_20px_60px_-15px_rgba(120,80,40,0.25)] dark:border-white/10"
    >
      <motion.div className="pointer-events-none absolute inset-0 rounded-[2rem]" style={{ background: glow }} />
      {children}
    </motion.div>
  );
}

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

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
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div className="aurora-bg" />
      <FloatingParticles />
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <TiltCard>
          <div className="relative flex flex-col items-center gap-6 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <span className="breathe absolute inset-0 rounded-full bg-gradient-to-br from-amber-200 via-orange-200 to-violet-200 blur-xl dark:from-amber-900/40 dark:via-orange-900/30 dark:to-violet-900/40" />
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 180 }}
                className="relative text-4xl"
              >
                🌿
              </motion.span>
            </div>
            <div>
              <h1 className="font-journal text-3xl font-semibold tracking-tight text-stone-800 dark:text-stone-100">
                Personal Gemini Journal
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                A quiet space to think out loud. Write freely, brainstorm, or just
                let your thoughts wander — Gemini listens, and everything here
                stays yours alone.
              </p>
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="font-journal text-base italic text-stone-500 dark:text-stone-400"
            >
              &ldquo;{prompt}&rdquo;
            </motion.p>

            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSignIn}
              disabled={loading || signingIn}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-orange-300 to-rose-300 px-7 py-3 font-medium text-stone-900 shadow-lg shadow-orange-300/30 transition-opacity disabled:opacity-50"
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
            <p className="text-xs text-stone-400 dark:text-stone-500">
              Private by design — only you can ever read your entries.
            </p>
          </div>
        </TiltCard>
      </motion.div>
    </div>
  );
}
