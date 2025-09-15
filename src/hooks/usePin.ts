import { useEffect, useMemo, useState } from 'react';

const LS_KEYS = {
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
    const storedHash = localStorage.getItem(LS_KEYS.PIN_HASH);
    const unlockedAt = localStorage.getItem(LS_KEYS.PIN_UNLOCKED_AT);
    setPinHash(storedHash);
    setUnlocked(Boolean(unlockedAt));
    setLoading(false);
  }, []);

  const hasPin = useMemo(() => Boolean(pinHash), [pinHash]);

  const setPin = async (pin: string) => {
    const hash = await sha256(pin);
    localStorage.setItem(LS_KEYS.PIN_HASH, hash);
    setPinHash(hash);
  };

  const clearPin = () => {
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
