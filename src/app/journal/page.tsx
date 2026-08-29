"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/api-client";
import { useVoiceInput } from "@/lib/use-voice-input";
import { FloatingParticles } from "@/components/floating-particles";

type Turn = { role: "user" | "model"; text: string };
type Entry = { id: string; summary: string; turnCount: number };

function timeOfDayGreeting(hour: number): string {
  if (hour < 5) return "Still up? I'm here whenever you're ready to write.";
  if (hour < 12) return "Good morning. What's on your mind?";
  if (hour < 17) return "Good afternoon. Take a breath — this space is yours.";
  if (hour < 21) return "Good evening. How was your day, really?";
  return "Good night. A few quiet thoughts before you rest?";
}

export default function JournalPage() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("Welcome back.");

  const voice = useVoiceInput();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    // Greeting depends on the viewer's local clock, which only exists after
    // mount — computing it here (rather than at module/render time) avoids a
    // server/client hydration mismatch on the initial paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(timeOfDayGreeting(new Date().getHours()));
  }, []);

  useEffect(() => {
    // Syncing an external system's state (speech recognition transcript) into
    // local input state is an intentional, standard effect use case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (voice.transcript) setInput(voice.transcript);
  }, [voice.transcript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const loadEntries = async () => {
    try {
      const res = await authedFetch("/api/entries");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
      }
    } catch {
      // Non-fatal — history is a convenience view, chat still works if this fails.
    }
  };

  useEffect(() => {
    // Data-fetch-on-mount/user-change effect — setState happens inside the
    // async loadEntries body (post-await), not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) loadEntries();
  }, [user]);

  const sendMessage = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setNotice(null);
    const nextTurns: Turn[] = [...turns, { role: "user", text: message }];
    setTurns(nextTurns);
    setInput("");
    voice.reset();

    try {
      const res = await authedFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: turns }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? "Something went wrong talking to Gemini.");
        return;
      }
      const data = await res.json();
      setTurns([...nextTurns, { role: "model", text: data.reply }]);
    } catch {
      setNotice("Network error reaching the server.");
    } finally {
      setSending(false);
    }
  };

  const saveAndSummarize = async () => {
    if (turns.length === 0 || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await authedFetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? "Failed to save journal entry.");
        return;
      }
      setTurns([]);
      setNotice("Saved — tucked away safely in your journal, just for you. 🌙");
      loadEntries();
    } catch {
      setNotice("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="relative flex flex-1 items-center justify-center text-stone-500">
        <div className="aurora-bg" />
        <span className="font-journal italic">Settling into your space…</span>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="aurora-bg" />
      <FloatingParticles count={8} />
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between border-b border-stone-300/40 pb-4 dark:border-stone-700/40"
      >
        <div>
          <h1 className="font-journal text-2xl font-semibold text-stone-800 dark:text-stone-100">
            {greeting}
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">{user.email}</p>
        </div>
        <button
          onClick={() => signOutUser()}
          className="rounded-full border border-stone-300/70 px-4 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
        >
          Sign out
        </button>
      </motion.header>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col md:col-span-2"
        >
          <div
            ref={scrollRef}
            className="paper-card flex-1 space-y-3 overflow-y-auto rounded-3xl border border-stone-300/40 p-5 shadow-[0_15px_45px_-20px_rgba(120,80,40,0.25)] dark:border-stone-700/40"
            style={{ minHeight: 320, maxHeight: 480 }}
          >
            {turns.length === 0 && (
              <p className="font-journal text-sm italic text-stone-500 dark:text-stone-400">
                Start writing below, or tap the mic and just talk. There&apos;s no
                wrong way to begin.
              </p>
            )}
            <AnimatePresence initial={false}>
              {turns.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className={t.role === "user" ? "text-right" : "text-left"}
                >
                  <span
                    className={
                      "font-journal inline-block max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm " +
                      (t.role === "user"
                        ? "bg-gradient-to-br from-amber-200/70 to-orange-100/70 text-stone-800 dark:from-amber-800/40 dark:to-orange-900/30 dark:text-stone-100"
                        : "bg-gradient-to-br from-violet-100/70 to-sky-100/70 text-stone-800 dark:from-violet-900/30 dark:to-sky-900/20 dark:text-stone-100")
                    }
                  >
                    {t.text}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {notice && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 text-sm text-amber-700 dark:text-amber-400"
              >
                {notice}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              placeholder="Let it out… whatever's on your mind."
              className="font-journal flex-1 resize-none rounded-2xl border border-stone-300/70 bg-white/70 p-3 text-[15px] backdrop-blur-md placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60 dark:border-stone-700 dark:bg-stone-900/60"
            />
            {voice.isSupported && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={voice.isListening ? voice.stop : voice.start}
                title="Voice journaling"
                className={
                  "relative shrink-0 rounded-full px-3 py-3 text-sm " +
                  (voice.isListening
                    ? "bg-gradient-to-br from-rose-400 to-orange-400 text-white"
                    : "border border-stone-300/70 dark:border-stone-700")
                }
              >
                {voice.isListening && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-rose-400"
                    animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <span className={`relative ${voice.isListening ? "breathe" : ""}`}>
                  {voice.isListening ? "● Listening" : "🎙️"}
                </span>
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="shrink-0 rounded-full bg-gradient-to-r from-amber-400 via-orange-300 to-rose-300 px-5 py-3 text-sm font-medium text-stone-900 shadow-md disabled:opacity-50"
            >
              {sending ? "…" : "Send"}
            </motion.button>
          </div>
          {voice.error && <p className="mt-1 text-xs text-red-500">{voice.error}</p>}

          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={saveAndSummarize}
            disabled={saving || turns.length === 0}
            className="mt-3 self-start rounded-full border border-stone-300/70 px-4 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
          >
            {saving ? "Tucking it away…" : "Save & summarize entry"}
          </motion.button>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="paper-card rounded-3xl border border-stone-300/40 p-4 shadow-[0_15px_45px_-20px_rgba(120,80,40,0.25)] dark:border-stone-700/40"
        >
          <h2 className="mb-2 text-sm font-semibold text-stone-500 dark:text-stone-400">
            Your journal, so far
          </h2>
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 480 }}>
            {entries.length === 0 && (
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Nothing saved yet — your first entry will appear here.
              </p>
            )}
            {entries.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.02, rotate: -0.3 }}
                className="font-journal rounded-2xl bg-gradient-to-br from-amber-50 to-violet-50 p-3 text-[13px] leading-relaxed text-stone-700 shadow-sm dark:from-stone-800 dark:to-stone-900 dark:text-stone-200"
              >
                {e.summary}
              </motion.div>
            ))}
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
