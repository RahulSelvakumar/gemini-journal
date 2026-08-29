"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal ambient typings for the Web Speech API (not in default TS DOM lib).
type SpeechRecognitionAlternativeLike = { transcript: string };
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getImpl(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

/**
 * Voice Journal enhancement: wraps the browser's native Web Speech API for
 * free, zero-backend speech-to-text. No audio ever leaves the browser to our
 * servers — only the final transcript text is sent, through the same
 * authenticated Gemini pipeline as typed messages. Falls back gracefully
 * (isSupported=false) on browsers without SpeechRecognition support.
 *
 * Journaling is reflective, not a quick voice command — people pause to
 * think mid-sentence. So this keeps the mic open (continuous + auto-restart
 * on the browser's own silence/network timeouts) until the user explicitly
 * clicks stop, instead of cutting off after the first pause.
 */
export function useVoiceInput() {
  // Computed lazily at mount (client component only) instead of in an effect —
  // this is a synchronous read of a browser capability, not a subscription.
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!getImpl();
  });
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  // Accumulates finalized text across the whole listening session, including
  // across any browser-forced restarts, so nothing said is ever lost.
  const finalTranscriptRef = useRef("");
  // Holds the latest beginSession implementation so onend can call it
  // recursively without a direct self-reference inside useCallback.
  const beginSessionRef = useRef<() => void>(() => {});

  const beginSession = useCallback(() => {
    const Impl = getImpl();
    if (!Impl) {
      setError("Voice input isn't supported in this browser.");
      setIsListening(false);
      return;
    }

    const recognition = new Impl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? " " : "") + text.trim();
        } else {
          interim += text;
        }
      }
      setTranscript((finalTranscriptRef.current + " " + interim).trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" happen naturally during normal pauses while
      // journaling out loud — they aren't real problems, so don't alarm the
      // user with an error message for them.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      if (manualStopRef.current) {
        setIsListening(false);
        return;
      }
      // The browser ended the session on its own (silence/network timeout)
      // but the user hasn't clicked stop — seamlessly reopen the mic so it
      // feels like one continuous listening session.
      beginSessionRef.current();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  useEffect(() => {
    beginSessionRef.current = beginSession;
  }, [beginSession]);

  const start = useCallback(() => {
    if (!getImpl()) {
      setError("Voice input isn't supported in this browser.");
      return;
    }
    manualStopRef.current = false;
    finalTranscriptRef.current = "";
    setTranscript("");
    setError(null);
    setIsListening(true);
    beginSession();
  }, [beginSession]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
  }, []);

  return { isSupported, isListening, transcript, error, start, stop, reset };
}
