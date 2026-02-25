"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function EnsureAnonAuth() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!data.session) {
        await supabase.auth.signInAnonymously();
        const next = await supabase.auth.getSession();
        const token = next.data.session?.access_token;
        if (token) {
          supabase.realtime.setAuth(token);
        }
      } else {
        const token = data.session.access_token;
        if (token) {
          supabase.realtime.setAuth(token);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}