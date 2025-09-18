import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const LS_KEYS = {
  // Kept only for backward compatibility and session state
  PIN_HASH: 'app.pin.hash',
  PIN_UNLOCKED_AT: 'app.pin.unlocked_at',
};

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function usePin() {
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const init = async () => {
      try {
        // Load DB-backed PIN for current authenticated user
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes.user?.id || null;

        const unlockedAt = localStorage.getItem(LS_KEYS.PIN_UNLOCKED_AT);
        setUnlocked(Boolean(unlockedAt));

        if (!uid) {
          // Not logged in; treat as no PIN available
          setPinHash(null);
          setLoading(false);
          return;
        }

        const { data, error } = await (supabase as any)
          .from('app_pins')
          .select('pin_hash')
          .eq('owner_user_id', uid)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116: No rows found for single() - ignore as "no pin set"
          // Other errors should surface
          console.error('Failed to fetch app PIN:', error);
        }

        if ((data as any)?.pin_hash) {
          setPinHash((data as any).pin_hash as string);
        } else {
          // Backward compatibility: migrate any existing local hash to DB
          const legacyHash = localStorage.getItem(LS_KEYS.PIN_HASH);
          if (legacyHash) {
            const { error: upErr } = await (supabase as any)
              .from('app_pins')
              .upsert({ owner_user_id: uid, pin_hash: legacyHash }, { onConflict: 'owner_user_id' });
            if (!upErr) {
              setPinHash(legacyHash);
              localStorage.removeItem(LS_KEYS.PIN_HASH);
            } else {
              console.error('Failed to migrate local PIN hash to DB:', upErr);
              setPinHash(null);
            }
          } else {
            setPinHash(null);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const hasPin = useMemo(() => Boolean(pinHash), [pinHash]);

  const setPin = async (pin: string) => {
    const hash = await sha256(pin);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error('Not authenticated');

    const { error } = await (supabase as any)
      .from('app_pins')
      .upsert({ owner_user_id: uid, pin_hash: hash }, { onConflict: 'owner_user_id' });
    if (error) throw error;

    // Ensure any legacy local storage hash is cleared
    localStorage.removeItem(LS_KEYS.PIN_HASH);
    setPinHash(hash);
  };

  const clearPin = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      // Clear local state anyway
      localStorage.removeItem(LS_KEYS.PIN_HASH);
      setPinHash(null);
      return;
    }
    await (supabase as any).from('app_pins').delete().eq('owner_user_id', uid);
    localStorage.removeItem(LS_KEYS.PIN_HASH);
    setPinHash(null);
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!pinHash) return false;
    const hash = await sha256(pin);
    const ok = hash === pinHash;
    if (ok) {
      localStorage.setItem(LS_KEYS.PIN_UNLOCKED_AT, new Date().toISOString());
      setUnlocked(true);
    }
    return ok;
  };

  const lock = () => {
    localStorage.removeItem(LS_KEYS.PIN_UNLOCKED_AT);
    setUnlocked(false);
  };

  const unlockSession = () => {
    localStorage.setItem(LS_KEYS.PIN_UNLOCKED_AT, new Date().toISOString());
    setUnlocked(true);
  };

  return {
    loading,
    hasPin,
    unlocked,
    setPin,
    clearPin,
    verifyPin,
    lock,
    unlockSession,
  };
}
