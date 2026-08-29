/**
 * Simple Firestore-backed per-user rate limiter — SERVER ONLY.
 *
 * Protects the shared Gemini free-tier quota: without this, one user (or one bug
 * in a loop) could exhaust the whole project's daily/per-minute request budget
 * and take the app down for everyone, including judges evaluating a live demo.
 */
import "server-only";
import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 10; // generous for a live demo, tight enough to protect quota

export class RateLimitExceededError extends Error {
  constructor(message = "Rate limit exceeded, please slow down") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

/** Throws RateLimitExceededError if the given user has exceeded their request budget. */
export async function checkRateLimit(uid: string): Promise<void> {
  const ref = db.collection("rateLimits").doc(uid);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : { windowStart: now, count: 0 };

    const windowStart = data.windowStart as number;
    const withinWindow = now - windowStart < WINDOW_MS;
    const count = withinWindow ? (data.count as number) : 0;

    if (withinWindow && count >= MAX_REQUESTS_PER_WINDOW) {
      throw new RateLimitExceededError();
    }

    tx.set(ref, {
      windowStart: withinWindow ? windowStart : now,
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
