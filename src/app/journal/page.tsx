"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/api-client";
import { useVoiceInput } from "@/lib/use-voice-input";
import { FloatingParticles } from "@/components/floating-particles";
import { JournalCalendar } from "@/components/journal-calendar";

// Calm, chat-bubble-friendly markdown rendering: tight paragraph spacing, no
// giant headings, soft bullets — replies should read like a caring note, not
// a formatted document.
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 font-semibold last:mb-0">{children}</p>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 font-semibold last:mb-0">{children}</p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 font-semibold last:mb-0">{children}</p>
  ),
  hr: () => null,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
};

type Turn = { role: "user" | "model"; text: string };
type Entry = { id: string; title?: string; summary: string; turnCount: number; turns?: Turn[]; createdAt: string | null };

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewingEntry, setViewingEntry] = useState<Entry | null>(null);

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
  }, [turns, viewingEntry]);

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
          {viewingEntry && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2 flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-100/70 to-violet-100/70 px-4 py-2 text-sm text-stone-600 dark:from-stone-800 dark:to-stone-900 dark:text-stone-300"
            >
              <span className="font-journal">
                Reading a past entry
                {viewingEntry.createdAt &&
                  ` from ${new Date(viewingEntry.createdAt).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}`}
              </span>
              <button
                onClick={() => setViewingEntry(null)}
                className="rounded-full border border-stone-400/50 px-3 py-1 text-xs transition-colors hover:bg-white/50 dark:hover:bg-stone-800"
              >
                Back to today
              </button>
            </motion.div>
          )}

          <div
            ref={scrollRef}
            className="paper-card flex-1 space-y-3 overflow-y-auto rounded-3xl border border-stone-300/40 p-5 shadow-[0_15px_45px_-20px_rgba(120,80,40,0.25)] dark:border-stone-700/40"
            style={{ minHeight: 320, maxHeight: 480 }}
          >
            {(viewingEntry ? viewingEntry.turns ?? [] : turns).length === 0 && (
              <p className="font-journal text-sm italic text-stone-500 dark:text-stone-400">
                {viewingEntry
                  ? "This entry didn't save its full conversation."
                  : "Start writing below, or tap the mic and just talk. There's no wrong way to begin."}
              </p>
            )}
            <AnimatePresence initial={false}>
              {(viewingEntry ? viewingEntry.turns ?? [] : turns).map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className={t.role === "user" ? "text-right" : "text-left"}
                >
                  <div
                    className={
                      "font-journal inline-block max-w-[85%] rounded-3xl px-4 py-2.5 text-left text-[15px] leading-relaxed shadow-sm " +
                      (t.role === "user"
                        ? "bg-gradient-to-br from-amber-200/70 to-orange-100/70 text-stone-800 dark:from-amber-800/40 dark:to-orange-900/30 dark:text-stone-100"
                        : "bg-gradient-to-br from-violet-100/70 to-sky-100/70 text-stone-800 dark:from-violet-900/30 dark:to-sky-900/20 dark:text-stone-100")
                    }
                  >
                    {t.role === "model" ? (
                      <ReactMarkdown components={markdownComponents}>{t.text}</ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{t.text}</p>
                    )}
                  </div>
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

          {!viewingEntry && (
            <>
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
                    title={voice.isListening ? "Stop listening" : "Voice journaling — keeps listening until you stop it"}
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
              {voice.isListening && (
                <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                  Still listening — tap the mic again when you&apos;re done talking.
                </p>
              )}
              {voice.error && <p className="mt-1 text-xs text-red-500">{voice.error}</p>}

              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={saveAndSummarize}
                disabled={saving || turns.length === 0}
                className="mt-3 self-start rounded-full border border-stone-300/70 px-4 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
              >
                {saving ? "Tucking it away…" : "Save & summarize entry"}
              </motion.button>
            </>
          )}
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="paper-card flex flex-col gap-4 rounded-3xl border border-stone-300/40 p-4 shadow-[0_15px_45px_-20px_rgba(120,80,40,0.25)] dark:border-stone-700/40"
        >
          <div>
            <h2 className="mb-2 text-sm font-semibold text-stone-500 dark:text-stone-400">
              Your journaling calendar
            </h2>
            <JournalCalendar
              entries={entries}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>

          <div className="border-t border-stone-300/40 pt-3 dark:border-stone-700/40">
            <h2 className="mb-2 text-sm font-semibold text-stone-500 dark:text-stone-400">
              {selectedDate
                ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                : "Recent entries"}
            </h2>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 360 }}>
              {(() => {
                const visible = selectedDate
                  ? entries.filter((e) => e.createdAt && toDateKey(new Date(e.createdAt)) === selectedDate)
                  : entries.slice(0, 8);

                if (visible.length === 0) {
                  return (
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {selectedDate
                        ? "No entries saved on this day."
                        : "Nothing saved yet — your first entry will appear here."}
                    </p>
                  );
                }

                return visible.map((e, i) => (
                  <motion.button
                    key={e.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setViewingEntry(e)}
                    className={
                      "font-journal block w-full rounded-2xl bg-gradient-to-br from-amber-50 to-violet-50 p-3 text-left text-[13px] leading-relaxed text-stone-700 shadow-sm transition-shadow hover:shadow-md dark:from-stone-800 dark:to-stone-900 dark:text-stone-200 " +
                      (viewingEntry?.id === e.id ? "ring-2 ring-amber-300" : "")
                    }
                  >
                    <span className="mb-0.5 block font-semibold text-stone-800 dark:text-stone-100">
                      {e.title || "Untitled entry"}
                    </span>
                    <span className="line-clamp-2 opacity-80">{e.summary}</span>
                    {e.createdAt && (
                      <span className="mt-1 block text-[11px] font-sans text-stone-400 dark:text-stone-500">
                        {new Date(e.createdAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </motion.button>
                ));
              })()}
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
