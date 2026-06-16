"use client";

import { useEffect, useRef } from "react";
import { syncProtocolsToSupabase } from "../lib/protocols-sync";

export function ProtocolsAutoSync() {
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    syncProtocolsToSupabase().then(({ synced, errors }) => {
      if (synced > 0) {
        console.log(`[protocols-sync] pushed ${synced} protocol(s) to Supabase`);
      }
      if (errors.length > 0) {
        console.warn("[protocols-sync] errors:", errors);
      }
    });
  }, []);

  return null;
}
