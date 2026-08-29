import { requireUserId, UnauthorizedError } from "@/lib/firebase-admin";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { sendChatMessage, type ChatTurn } from "@/lib/gemini";
import { z } from "zod";

// Input is validated with an explicit schema before any use — never trust the
// client-supplied history/message shape.
const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().min(1).max(4000),
      })
    )
    .max(40)
    .default([]),
});

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

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { message, history } = parsed.data;

  try {
    const reply = await sendChatMessage(history as ChatTurn[], message);
    return Response.json({ reply });
  } catch (err) {
    console.error("gemini chat error", { uid, error: (err as Error).message });
    return Response.json({ error: "Failed to reach Gemini" }, { status: 502 });
  }
}
