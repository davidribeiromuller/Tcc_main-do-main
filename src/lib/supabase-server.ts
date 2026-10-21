import { createSupabaseContext, withSupabase } from "@supabase/server";
import { Request as ExpressRequest, Response, NextFunction } from "express";

export interface SupabaseServerContext {
  supabase: any;
  supabaseAdmin: any;
  userClaims?: any;
  jwtClaims?: any;
  authMode?: string;
}

// Extend Express Request type
export interface SupabaseRequest extends ExpressRequest {
  supabaseContext?: SupabaseServerContext;
  supabase?: any;
  supabaseAdmin?: any;
}

/**
 * Checks if the minimal Supabase server variables are configured.
 */
export function isSupabaseServerConfigured(): boolean {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || 
    (process.env.DATABASE_URL?.startsWith('sb_publishable') ? process.env.DATABASE_URL : undefined);
  
  return !!(url && publishableKey);
}

/**
 * Maps the environment variables into the expected format for @supabase/server
 */
export function getSupabaseServerEnv() {
  const pKey = process.env.SUPABASE_PUBLISHABLE_KEY || 
    (process.env.DATABASE_URL?.startsWith('sb_publishable_') ? process.env.DATABASE_URL : undefined);

  return {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: pKey || "",
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || "",
    SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL || "",
  };
}

/**
 * Create a Supabase Context from an Express Request.
 * Safely handles parsing and conversion to Web API Request objects.
 */
export async function getSupabaseContextFromExpress(
  req: ExpressRequest,
  authMode: "user" | "publishable" | "secret" | "none" = "none"
): Promise<{ data: SupabaseServerContext | null; error: any }> {
  try {
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost";
    const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;
    
    // Construct standard fetch Request object
    const headers = new Headers();
    Object.entries(req.headers).forEach(([key, val]) => {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, String(val));
        }
      }
    });

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const webRequest = new Request(fullUrl, init);
    const env = getSupabaseServerEnv();

    const { data, error } = await createSupabaseContext(webRequest, {
      auth: authMode,
      env: env as any
    });

    return { data, error };
  } catch (err: any) {
    return {
      data: null,
      error: {
        message: err.message || "Failed to create Supabase Server Context",
        status: 500
      }
    };
  }
}

/**
 * Express middleware to inject and require Supabase Authentication.
 */
export function requireSupabaseServerAuth(authMode: "user" | "publishable" | "secret" | "none" = "user") {
  return async (req: SupabaseRequest, res: Response, next: NextFunction) => {
    if (!isSupabaseServerConfigured()) {
      return res.status(503).json({
        error: "Supabase server is not configured. Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY."
      });
    }

    const { data, error } = await getSupabaseContextFromExpress(req, authMode);
    if (error) {
      return res.status(error.status || 401).json({
        error: error.message || "Supabase authentication failed"
      });
    }

    if (data) {
      req.supabaseContext = data;
      req.supabase = data.supabase;
      req.supabaseAdmin = data.supabaseAdmin;
    }
    
    next();
  };
}
