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
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}