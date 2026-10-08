---
status: accepted
---

# The findbolig password travels inside the sealed session cookie

findbolig.nu offers no delegated or token-based login (verified 2026-09-05: the OIDC/OAuth discovery paths return 404, the site's own JavaScript contains no token, federated or MitID login, and there is no public API and no mobile app), so SeBolig must present the user's email and password to keep a Connection alive across findbolig sessions. We keep the password, encrypted with iron-webcrypto, inside the HttpOnly session cookie the browser holds, alongside the findbolig cookies. Nothing is stored server-side; the server is stateless and the user can revoke access at any time by disconnecting or by changing their findbolig password.

## Considered options

- **Keep only findbolig cookies, drop the password after login.** Most honest, but every findbolig session expiry forces the user back to the password field. Rejected until findbolig's session lifetime is measured; if sessions turn out to be long and sliding, this should be revisited.
- **Store credentials server-side (Firestore/Redis) behind a JWT.** Rejected: creates a central store of many users' findbolig passwords, a far larger blast radius than one cookie per browser, plus infrastructure and key management.
- **User's choice at connect time.** Deferred; may be layered on later without changing the model.

## Consequences

- The password exists, encrypted, wherever the user's browser stores cookies. Disclosing this plainly to the user is a requirement, not a nicety.
- Rotating the cookie secret invalidates every Connection at once.
- A findbolig password change ends the Connection at the next silent re-authentication; the app must explain that, not show a generic error.
