import { getSessionCandidatesFromCookies, sessionMatchesPassword } from './auth';
import { readState } from './database';
import type { UserAccount } from './types';

export async function getOptionalViewer(): Promise<UserAccount | null> {
  const sessions = await getSessionCandidatesFromCookies();
  if (sessions.length === 0) return null;
  const state = await readState();
  // A valid signature does not prove that the password has not since changed.
  // A newer partitioned token for the *same* user can replace a revoked normal
  // token, but never silently switch to another account from a stale partition.
  const user = state.users.find((u) => u.id === sessions[0].uid);
  if (!user || user.status !== 'ACTIVE') return null;
  return sessions.some((session) => session.uid === user.id && sessionMatchesPassword(session, user.passwordHash))
    ? user : null;
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
