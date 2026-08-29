/**
 * Gemini API wrapper — SERVER ONLY.
 *
 * Secret management: the Gemini API key is never hardcoded and never shipped to
 * the client. In production it is fetched once from Google Cloud Secret Manager
 * using the Cloud Run service account's IAM identity (roles/secretmanager.secretAccessor
 * scoped to this one secret) and cached in memory for the life of the instance.
 * For local development only, GEMINI_API_KEY may be set in .env.local (gitignored).
 */
import "server-only";
import { GoogleGenAI } from "@google/genai";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// gemini-2.5-flash-lite was retired for new projects; gemini-3.5-flash-lite is
// the current lowest-cost/highest-free-tier-RPM model in the same family.
const MODEL = "gemini-3.5-flash-lite";
const SECRET_NAME =
  process.env.GEMINI_API_KEY_SECRET_NAME ||
  `projects/${process.env.GOOGLE_CLOUD_PROJECT}/secrets/gemini-api-key/versions/latest`;

let cachedApiKey: string | null = null;
let cachedClient: GoogleGenAI | null = null;

async function resolveApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  // Local dev shortcut only — production always goes through Secret Manager below.
  if (process.env.NODE_ENV !== "production" && process.env.GEMINI_API_KEY) {
    cachedApiKey = process.env.GEMINI_API_KEY;
    return cachedApiKey;
  }

  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: SECRET_NAME });
  const value = version.payload?.data?.toString();
  if (!value) {
    throw new Error("Gemini API key secret is empty or inaccessible");
  }
  cachedApiKey = value;
  return cachedApiKey;
}

async function getClient(): Promise<GoogleGenAI> {
  if (cachedClient) return cachedClient;
  const apiKey = await resolveApiKey();
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export type ChatTurn = { role: "user" | "model"; text: string };

/** Sends the full turn history plus a new user message and returns Gemini's reply. */
export async function sendChatMessage(history: ChatTurn[], message: string): Promise<string> {
  const ai = await getClient();
  const chat = ai.chats.create({
    model: MODEL,
    history: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
  });
  const response = await chat.sendMessage({ message });
  return response.text ?? "";
}

/** Condenses a full conversation into a short journal-style summary before saving. */
export async function summarizeConversation(turns: ChatTurn[]): Promise<string> {
  const ai = await getClient();
  const transcript = turns.map((t) => `${t.role === "user" ? "User" : "Gemini"}: ${t.text}`).join("\n");
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Summarize the following journaling/brainstorming conversation into a concise, " +
              "first-person journal entry (3-6 sentences). Capture key thoughts, decisions, and " +
              "feelings expressed. Do not include meta-commentary, just the entry text.\n\n" +
              transcript,
          },
        ],
      },
    ],
  });
  return response.text ?? "";
}
