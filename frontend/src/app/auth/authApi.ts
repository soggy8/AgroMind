/** /api/auth (backend/app/modules/accounts/router.py). The session lives in an HttpOnly cookie the browser sends itself. */
import { http } from "../../shared/api/http";
import type { Credentials, User } from "./types";

export const authApi = {
  me: () => http.get<User | null>("/api/auth/me"),
  signUp: (c: Credentials) => http.post<User>("/api/auth/signup", c),
  signIn: (c: Credentials) => http.post<User>("/api/auth/login", c),
  signOut: () => http.post<void>("/api/auth/logout", {}),
};
