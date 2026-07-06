import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export interface UserProfile {
  name: string;
  email: string;
}

const KEY = 'tvpc.userProfile';
const DEFAULT_USER: UserProfile = { name: 'Terry', email: 'terrysf@gmail.com' };

/** 프로필 — 기기 로컬 저장 (스펙 기본값: Terry / terrysf@gmail.com) */
export function useUser() {
  const [user, setUser] = useState<UserProfile>(DEFAULT_USER);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setUser(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const updateUser = useCallback((patch: Partial<UserProfile>) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { user, updateUser };
}
