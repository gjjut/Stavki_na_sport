import { getSessionUserIdFromCookies } from './auth';
import { readState } from './database';
import type { UserAccount } from './types';

export async function getOptionalViewer(): Promise<UserAccount | null> {
  const uid = getSessionUserIdFromCookies();
  if (!uid) return null;
  const state = await readState();
  return state.users.find((u) => u.id === uid) ?? null;
}

export async function requireAuthenticatedUser(): Promise<UserAccount> {
  const user = await getOptionalViewer();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  if (user.status === 'BLOCKED') {
    throw new Error('BLOCKED');
  }
  return user;
}

export async function requireAdminAccount(): Promise<UserAccount> {
  const user = await requireAuthenticatedUser();
  if (user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN');
  }
  return user;
}
