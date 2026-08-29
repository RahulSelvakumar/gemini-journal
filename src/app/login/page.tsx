"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/journal");
  }, [user, loading, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center dark:bg-black">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Personal Gemini Journal</h1>
        <p className="mt-2 max-w-md text-zinc-600 dark:text-zinc-400">
          Brainstorm and journal privately with Gemini. Sign in to get a space that&apos;s
          isolated to only you — no one else can see your entries.
        </p>
      </div>
      <button
        onClick={() => signIn()}
        disabled={loading}
        className="flex items-center gap-2 rounded-full bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        Sign in with Google
      </button>
    </div>
  );
}
