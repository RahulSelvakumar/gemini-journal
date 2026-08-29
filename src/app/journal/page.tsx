"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/api-client";
import { useVoiceInput } from "@/lib/use-voice-input";

type Turn = { role: "user" | "model"; text: string };
type Entry = { id: string; summary: string; turnCount: number };

export default function JournalPage() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const voice = useVoiceInput();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

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
      setNotice("Saved! Your conversation has been summarized to your journal.");
      loadEntries();
    } catch {
      setNotice("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-zinc-500">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <header className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold">Personal Gemini Journal</h1>
          <p className="text-sm text-zinc-500">Signed in as {user.email}</p>
        </div>
        <button
          onClick={() => signOutUser()}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col md:col-span-2">
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            style={{ minHeight: 320, maxHeight: 480 }}
          >
            {turns.length === 0 && (
              <p className="text-sm text-zinc-500">
                Start brainstorming or journaling below — type or use the mic.
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={
                    "inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm " +
                    (t.role === "user"
                      ? "bg-foreground text-background"
                      : "bg-zinc-100 dark:bg-zinc-800")
                  }
                >
                  {t.text}
                </span>
              </div>
            ))}
          </div>

          {notice && <p className="mt-2 text-sm text-amber-600">{notice}</p>}

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
              placeholder="Type your thoughts…"
              className="flex-1 resize-none rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            {voice.isSupported && (
              <button
                onClick={voice.isListening ? voice.stop : voice.start}
                title="Voice input"
                className={
                  "shrink-0 rounded-full px-3 py-2 text-sm " +
                  (voice.isListening
                    ? "bg-red-600 text-white"
                    : "border border-zinc-300 dark:border-zinc-700")
                }
              >
                {voice.isListening ? "● Listening" : "🎙️"}
              </button>
            )}
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {voice.error && <p className="mt-1 text-xs text-red-500">{voice.error}</p>}

          <button
            onClick={saveAndSummarize}
            disabled={saving || turns.length === 0}
            className="mt-3 self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {saving ? "Summarizing…" : "Save & summarize entry"}
          </button>
        </div>

        <aside className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Your journal history</h2>
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 480 }}>
            {entries.length === 0 && (
              <p className="text-xs text-zinc-500">No entries yet — save a conversation to see it here.</p>
            )}
            {entries.map((e) => (
              <div key={e.id} className="rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                {e.summary}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
