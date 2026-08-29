"use client";

import { useCallback, useRef, useState } from "react";

// Minimal ambient typings for the Web Speech API (not in default TS DOM lib).
type SpeechRecognitionResultLike = { transcript: string };
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

/**
 * Voice Journal enhancement: wraps the browser's native Web Speech API for
 * free, zero-backend speech-to-text. No audio ever leaves the browser to our
 * servers — only the final transcript text is sent, through the same
 * authenticated Gemini pipeline as typed messages. Falls back gracefully
 * (isSupported=false) on browsers without SpeechRecognition support.
 */
export function useVoiceInput() {
  // Computed lazily at mount (client component only) instead of in an effect —
  // this is a synchronous read of a browser capability, not a subscription.
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  });
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const start = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Impl = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Impl) {
      setError("Voice input isn't supported in this browser.");
      return;
    }

    const recognition = new Impl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ");
      setTranscript(text);
    };
    recognition.onerror = (event) => setError(event.error);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    setError(null);
    setIsListening(true);
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const reset = useCallback(() => setTranscript(""), []);

  return { isSupported, isListening, transcript, error, start, stop, reset };
}
