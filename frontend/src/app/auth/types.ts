/** Mirrors backend/app/modules/accounts/schemas.py: change both together. */
export interface User {
  id: string;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}
