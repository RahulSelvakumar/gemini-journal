/**
 * Firebase Admin SDK — SERVER ONLY. Never import this from client components.
 *
 * Security: every API route that touches user data must call `requireUser(req)`
 * from this module to derive the caller's uid from a verified ID token. Never
 * trust a uid supplied by the client in the request body/query/cookies.
 */
import "server-only";
import { getApps, initializeApp, applicationDefault, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function initAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  // Application Default Credentials cover both cases: on Cloud Run/GCP they come
  // from the attached service account automatically; locally, the SDK picks up
  // GOOGLE_APPLICATION_CREDENTIALS (a path to a downloaded service account JSON,
  // dev-only, gitignored) if that env var is set.
  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });
}

const adminApp = initAdminApp();
export const adminAuth = getAuth(adminApp);
export const db = getFirestore(adminApp);

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Verifies the Firebase ID token from the Authorization header and returns the
 * authenticated user's uid. Throws UnauthorizedError (caller should return 401)
 * on any missing/invalid/expired token. This is the single server-side
 * authorization boundary — never derive uid from anywhere else.
 */
export async function requireUserId(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    throw new UnauthorizedError("Missing bearer token");
  }
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]!);
    return decoded.uid;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
