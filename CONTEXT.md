# SeBolig.nu

A dashboard for a person's own findbolig.nu account. SeBolig never holds housing data of its own; everything it shows is fetched on the user's behalf from findbolig.nu, which offers no delegated login, so the user has to hand SeBolig their findbolig credentials.

## Language

### Account access

**Connection**:
The durable link between a user and their findbolig.nu account, created when the user hands SeBolig their findbolig credentials. To **connect** is to create it; to **disconnect** is to end it.
_Avoid_: login, log in, log out, session, sign in

**findbolig session**:
The short-lived access findbolig.nu itself grants after a successful login. Owned and expired by findbolig.nu, not by SeBolig. A Connection outlives many findbolig sessions.
_Avoid_: session (unqualified), cookies

**Silent re-authentication**:
SeBolig renewing an expired findbolig session on the user's behalf, without the user seeing the password field again.
_Avoid_: auto-login, auto-relogin, refresh

**Local data**:
Everything SeBolig keeps on the user's device: appointments, offers, waiting lists and the user's identity. Erased when the user disconnects. Preferences such as language and theme are not Local data.
_Avoid_: cache, offline data

**Explainer**:
The single page that tells a user, in plain language, what happens to their password and Local data, and how to take access back.
_Avoid_: privacy policy, security page, FAQ
