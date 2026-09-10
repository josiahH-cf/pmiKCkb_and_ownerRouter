import { NextResponse } from "next/server";
import {
  RENEWAL_SOURCE_REFRESH_COOKIE,
  RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/lease-renewal/post-write-freshness";

/** Value-free freshness barrier shared by confirmed renewal source writes. */
export function postWriteResponse(payload: unknown, writeCompletedAtMs: number) {
  const response = NextResponse.json(payload);
  response.cookies.set({
    name: RENEWAL_SOURCE_REFRESH_COOKIE,
    value: String(writeCompletedAtMs),
    httpOnly: true,
    maxAge: RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS,
    path: "/lease-renewal",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
