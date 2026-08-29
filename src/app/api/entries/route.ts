import { db, requireUserId, UnauthorizedError } from "@/lib/firebase-admin";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { summarizeConversation, type ChatTurn } from "@/lib/gemini";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

const saveEntrySchema = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(60),
});

/**
 * GET /api/entries — list the authenticated user's own saved journal entries.
 * The Firestore path is scoped to `users/{uid}/entries`, derived from the
 * server-verified uid — a client can never read another user's entries by
 * supplying a different id, because no id is ever accepted from the request.
 */
export async function GET(request: Request) {
  let uid: string;
  try {
    uid = await requireUserId(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("entries")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return Response.json({ entries });
}

/**
 * POST /api/entries — summarize a finished conversation with Gemini and
 * persist the summary under the caller's own user document.
 */
export async function POST(request: Request) {
  let uid: string;
  try {
    uid = await requireUserId(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  try {
    await checkRateLimit(uid);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const parsed = saveEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const summary = await summarizeConversation(parsed.data.turns as ChatTurn[]);
    const ref = await db
      .collection("users")
      .doc(uid)
      .collection("entries")
      .add({
        summary,
        turnCount: parsed.data.turns.length,
        createdAt: FieldValue.serverTimestamp(),
      });
    return Response.json({ id: ref.id, summary }, { status: 201 });
  } catch (err) {
    console.error("gemini summarize error", { uid, error: (err as Error).message });
    return Response.json({ error: "Failed to summarize conversation" }, { status: 502 });
  }
}
