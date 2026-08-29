"use client";

import { auth } from "@/lib/firebase-client";

/** Fetch wrapper that attaches the current user's Firebase ID token as a Bearer
 * header — the server independently verifies this token on every request. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
