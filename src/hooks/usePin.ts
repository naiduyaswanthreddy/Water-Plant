import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const LS_KEYS = {
  // Legacy hash key (will be ignored and cleared to avoid cross-account migration)
  PIN_HASH: 'app.pin.hash',
  // Session unlocked flag will be namespaced per user id: `${PIN_UNLOCKED_AT_PREFIX}${uid}`
  PIN_UNLOCKED_AT_PREFIX: 'app.pin.unlocked_at:',
};

const unlockedKeyFor = (uid: string) => `${LS_KEYS.PIN_UNLOCKED_AT_PREFIX}${uid}`;

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

        if (!uid) {
          // Not logged in; treat as no PIN available
          setPinHash(null);
          setLoading(false);
          return;
        }

        // Session unlock is per-user
        const unlockedAt = localStorage.getItem(unlockedKeyFor(uid));
        setUnlocked(Boolean(unlockedAt));

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
          setPinHash(null);
        }
      } finally {
        setLoading(false);
      }
    };
    init();
    // Also subscribe to auth state changes to clear session unlock on user switch
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id;
      if (!uid) {
        setUnlocked(false);
        setPinHash(null);
      } else {
        const key = unlockedKeyFor(uid);
        setUnlocked(Boolean(localStorage.getItem(key)));
      }
    });
    return () => {
      sub.subscription?.unsubscribe();
    };
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

    // Clear any legacy local storage hash to avoid cross-account leakage
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
    localStorage.removeItem(unlockedKeyFor(uid));
    setPinHash(null);
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!pinHash) return false;
    const hash = await sha256(pin);
    const ok = hash === pinHash;
    if (ok) {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (uid) {
        localStorage.setItem(unlockedKeyFor(uid), new Date().toISOString());
        setUnlocked(true);
      }
    }
    return ok;
  };

  const lock = () => {
    // Lock current user session
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (uid) localStorage.removeItem(unlockedKeyFor(uid));
      setUnlocked(false);
    });
  };

  const unlockSession = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (uid) {
      localStorage.setItem(unlockedKeyFor(uid), new Date().toISOString());
      setUnlocked(true);
    }
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
