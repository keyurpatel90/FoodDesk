import { NextResponse } from 'next/server';

export class HttpError extends Error {
  status: number;
  code?: string;
  /** Short technical reason (e.g. the database error). Only put non-secret text here; it is sent to the signed-in admin. */
  detail?: string;
  constructor(status: number, message: string, code?: string, detail?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Wraps a route body so thrown HttpErrors become clean JSON responses and nothing leaks a stack trace. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code, ...(err.detail ? { detail: err.detail } : {}) },
        { status: err.status }
      );
    }
    console.error('[subscription] unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
