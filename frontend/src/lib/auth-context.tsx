"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useQueryClient } from "@tanstack/react-query";

export type User = {
  id: string;
  name: string;
  email: string;
  is_verified: boolean;
  avatar_url: string | null;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
  /**
   * Replaces the signed-in user after a profile edit, so the navbar picks up a
   * new name or avatar without re-asking the server for what it just returned.
   */
  updateUser: (user: User) => void;
  /** Trades the refresh token for a new access token. True if it worked. */
  refreshSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const API = `${process.env.NEXT_PUBLIC_API_URL}/api/v1`;

async function restoreSession(): Promise<User | null> {
  // Try to get the logged-in user
  let response = await fetch(`${API}/profile`, {
    credentials: "include",
  });

  // Access token expired
  if (response.status === 401) {
    const refreshResponse = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    // Refresh succeeded
    if (refreshResponse.ok) {
      response = await fetch(`${API}/profile`, {
        credentials: "include",
      });
    }
  }

  // User is not authenticated
  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  return data.user;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const queryClient = useQueryClient();

  /*
   * Guard 1: run this exactly once.
   *
   * React invokes effects twice in development. Without this, both runs reach
   * restoreSession, and when the access token has expired both call
   * /auth/refresh with the same refresh token. The first rotates it; the
   * second presents one the server has just revoked, which is precisely what
   * refreshController treats as a stolen token — so it revokes every session
   * and the user is signed out for no reason.
   *
   * There is deliberately no "is it still mounted?" flag alongside this one.
   * The two cannot coexist: StrictMode's cleanup runs while the first
   * restoreSession is still in flight, so the flag it clears belongs to the
   * one run that is ever going to finish — its result was dropped, isLoading
   * stayed true, and the navbar sat on its skeleton for good. Since React 18 a
   * state update after unmount is a silent no-op, so there was nothing for
   * that flag to protect against in the first place.
   */
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    async function checkAuth() {
      try {
        const user = await restoreSession();

        setUser(user);
      } catch (error) {
        console.error("Failed to restore session:", error);

        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  /*
   * The rotation currently in flight, if there is one.
   *
   * Refresh tokens are single-use: /auth/refresh rotates the token and revokes
   * the one presented, and presenting an already-revoked one is precisely what
   * refreshController reads as theft — it answers by revoking every session on
   * the account. So when two requests 401 in the same moment (the link list
   * and an open analytics dialog both reloading after a laptop wakes up) they
   * must not each start their own rotation, or the second one signs the user
   * out everywhere. Whoever gets here first starts it; the rest await the same
   * promise and read the same answer.
   */
  const rotation = useRef<Promise<boolean> | null>(null);

  const refreshSession = useCallback(async () => {
    if (!rotation.current) {
      rotation.current = (async () => {
        try {
          const response = await fetch(`${API}/auth/refresh`, {
            method: "POST",
            credentials: "include",
          });

          if (response.ok) {
            return true;
          }

          /*
           * The refresh token itself was refused — past its 7 days, or
           * revoked. Nothing is left to retry with, so the session ends here;
           * clearing `user` is what lets the dashboard guard redirect to
           * /login rather than leaving a signed-in shell over failing
           * requests.
           */
          setUser(null);

          return false;
        } catch {
          // The network failing, not a verdict on the token. Leave the session
          // alone so a later attempt can still succeed.
          return false;
        } finally {
          rotation.current = null;
        }
      })();
    }

    return rotation.current;
  }, []);

  const login = useCallback((user: User) => {
    setUser(user);
  }, []);

  const updateUser = useCallback((user: User) => {
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /*
       * A failed request doesn't mean the session survived — the server may
       * well have revoked the token and cleared the cookies before the
       * connection dropped. Either way someone who clicked "Log out" is done
       * with this session, so it ends here regardless and the next request
       * finds out whether the cookies outlived it.
       *
       * Without this the rejection escaped to Navbar's handleLogout, which
       * meant setUser(null) never ran and neither did the redirect: clicking
       * "Log out" with no connection left you sitting there still signed in.
       */
    }

    /*
     * clear(), not just dropping the user.
     *
     * Every other cached query — the link list, a link's analytics — was
     * fetched as this user, and the keys carry no user id: page one is
     * ["links", "list", { page: 1, limit: 5 }] for everybody. Left in place it
     * would be served straight to whoever signs in next on this browser, for
     * however long their own data took to arrive.
     */
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        updateUser,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
