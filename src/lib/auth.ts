'use client';

import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  signOut as amplifySignOut,
  confirmSignIn as amplifyConfirmSignIn,
  confirmSignUp as amplifyConfirmSignUp,
  getCurrentUser as amplifyGetCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth';
import type { User, UserRole } from '@/src/types';
import { getCurrentUser as getCachedUser, setCurrentUser, logout as clearUser } from './user-store';

// ── Map Cognito group → app role ──────────────────────────────
function groupToRole(groups: string[]): UserRole {
  if (groups.includes('PLATFORM_ADMIN'))  return 'PLATFORM_ADMIN';
  if (groups.includes('SELLER_MANAGER'))  return 'SELLER_MANAGER';
  if (groups.includes('TRANSPORT_ADMIN')) return 'TRANSPORT_ADMIN';
  if (groups.includes('DRIVER'))          return 'DRIVER';
  return 'CLIENT';
}

// ── Build a User object from the current Cognito session ──────
export async function getCognitoUser(): Promise<User | null> {
  try {
    const { userId, username } = await amplifyGetCurrentUser();
    const session    = await fetchAuthSession();
    const attrs      = await fetchUserAttributes();

    const accessPayload = session.tokens?.accessToken?.payload as Record<string, unknown> | undefined;
    const groups        = (accessPayload?.['cognito:groups'] as string[] | undefined) ?? [];
    const workspaceId   = (attrs['custom:workspace_id'] as string | undefined) ?? undefined;

    return {
      id:          userId,
      email:       (attrs.email as string) ?? username,
      firstName:   (attrs.given_name  as string) ?? username,
      lastName:    (attrs.family_name as string) ?? '',
      role:        groupToRole(groups),
      workspaceId,
      verified:    true,
    };
  } catch {
    return null;
  }
}

// ── getCurrentUser: Cognito session first, cached fallback ────
export async function getCurrentUser(): Promise<User | null> {
  const real = await getCognitoUser();
  if (real) return real;
  return getCachedUser();
}

// ── Sign in ───────────────────────────────────────────────────
export type SignInResult =
  | { user: User; challenge?: never }
  | { user?: never; challenge: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  let result;
  try {
    result = await amplifySignIn({ username: email, password });
  } catch (err: unknown) {
    // Stale cached session from a different (e.g. recreated) Cognito user — clear and retry once.
    if (err instanceof Error && err.name === 'UserAlreadyAuthenticatedException') {
      await amplifySignOut();
      clearUser();
      result = await amplifySignIn({ username: email, password });
    } else {
      throw err;
    }
  }
  const { isSignedIn, nextStep } = result;

  if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
    return { challenge: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' };
  }

  if (!isSignedIn) {
    throw new Error(`Sign-in requires additional step: ${nextStep.signInStep}`);
  }

  const user = await getCognitoUser();
  if (!user) throw new Error('Signed in but could not load user profile');
  setCurrentUser(user);
  return { user };
}

// ── Confirm forced new password (admin-created accounts) ──────
export async function confirmNewPassword(newPassword: string): Promise<User> {
  const { isSignedIn } = await amplifyConfirmSignIn({ challengeResponse: newPassword });
  if (!isSignedIn) throw new Error('Failed to set new password');
  const user = await getCognitoUser();
  if (!user) throw new Error('Could not load profile after password change');
  setCurrentUser(user);
  return user;
}

// ── Sign up (new CLIENT self-registration) ────────────────────
export interface SignUpInput {
  email:     string;
  password:  string;
  firstName: string;
  lastName:  string;
}

export async function signUp(input: SignUpInput): Promise<{ nextStep: string }> {
  const { nextStep } = await amplifySignUp({
    username: input.email,
    password: input.password,
    options: {
      userAttributes: {
        email:       input.email,
        given_name:  input.firstName,
        family_name: input.lastName,
      },
    },
  });
  return { nextStep: nextStep.signUpStep };
}

// ── Confirm sign-up (6-digit code from email) ─────────────────
export async function confirmSignUp(email: string, code: string): Promise<void> {
  await amplifyConfirmSignUp({ username: email, confirmationCode: code });
}

// ── Sign out ──────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  await amplifySignOut();
  clearUser();
}

// ── Get JWT for API calls ─────────────────────────────────────
export async function getIdToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}
