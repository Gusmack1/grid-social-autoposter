// Supabase Realtime hook — subscribes to table changes and triggers callbacks
import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase client (anon key — read-only realtime, no auth needed)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rhhsaphcqxgrptrpvljm.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
function getSupabase() {
  if (!supabase && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 2 } },
    });
  }
  return supabase;
}

/**
 * Subscribe to Supabase Realtime changes on a table.
 * @param {string} table - Table name (e.g. 'posts')
 * @param {string} filterColumn - Column to filter on (e.g. 'client_id')
 * @param {string} filterValue - Value to match
 * @param {function} onPayload - Callback when a change occurs
 */
export function useRealtime(table, filterColumn, filterValue, onPayload) {
  const callbackRef = useRef(onPayload);
  callbackRef.current = onPayload;

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !filterValue) return;

    const channelName = `${table}-${filterValue}`;
    const channel = sb
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filterColumn ? `${filterColumn}=eq.${filterValue}` : undefined,
        },
        (payload) => {
          callbackRef.current(payload);
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [table, filterColumn, filterValue]);
}

/**
 * Check if Supabase Realtime is available (anon key configured)
 */
export function isRealtimeEnabled() {
  return !!SUPABASE_ANON_KEY;
}
