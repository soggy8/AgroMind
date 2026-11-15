# Accounts

Email and password accounts, so a farmer's own farms are private and the demo farm can stay read-only.

- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- A session is a random token in an HttpOnly cookie (`agromind_session`, SameSite=Lax, Secure in production).
  Only its SHA-256 is stored (`auth_sessions`), so a database leak doesn't hand out live sessions. Sessions last 30 days.
- Passwords are hashed with scrypt from the standard library (`passwords.py`); no extra dependency.
- Sign-up and sign-in are rate limited per client address (in memory, per worker).
- Other modules read the signed-in user only through `service.py` (`optional_user_id`, `require_user_id`).

Who may open which farm is decided in `app/access.py`, not here: a farm without an owner (the demo farm) is readable by
everyone and writable by no one; a farm with an owner is visible only to that owner.
