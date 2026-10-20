# SeBolig.nu guide

SeBolig.nu is a dashboard for your own findbolig.nu account. It shows your viewings, housing offers and waiting lists. It keeps a copy of this data on your device.

This guide has four parts. Each part has a different purpose:

| Part | Use it when you want to |
|---|---|
| [1. Tutorials](#1-tutorials) | Learn SeBolig step by step. |
| [2. How-to guides](#2-how-to-guides) | Do one specific task. |
| [3. Reference](#3-reference) | Find a fact: a command, a setting, a route. |
| [4. Explanation](#4-explanation) | Understand why SeBolig works as it does. |

The guide uses these terms. The terms come from [CONTEXT.md](CONTEXT.md).

| Term | Meaning |
|---|---|
| Connection | The link between you and your findbolig.nu account. You **connect** to make it. You **disconnect** to end it. |
| findbolig session | The short access that findbolig.nu gives after a login. findbolig.nu controls it. One Connection uses many findbolig sessions. |
| Local data | Your viewings, offers, waiting lists and name, kept on your device. Language and theme are not Local data. |
| Demo | SeBolig with sample data. The Demo does not send data to findbolig.nu. |
| Explainer | The page "How it works" (`/saadan-virker-det`). It tells you what SeBolig does with your password. |

---

## 1. Tutorials

### 1.1 Try SeBolig with the Demo

In this tutorial, you use SeBolig with sample data. You do not need a findbolig.nu account.

1. Open <https://sebolig.nu>.
2. Find the field "A nickname (for demo)".
3. Type a nickname.
4. Click **Try as demo**.

   SeBolig shows "You are now in demo mode." The home page shows your nickname.

5. Click **Appointments** in the navigation bar.

   You see a list of upcoming viewings. Each viewing has a date, a time and an address.

6. Click one viewing.

   A detail sheet opens. It shows photos, the rent and a map.

7. Click **Share**. Then click **Text**.

   The share menu of your device opens. The text shows the address, the date and the time. Close the menu.

8. Click **Offers** in the navigation bar.

   You see housing offers. Each offer has a deadline.

9. Click **Waiting lists** in the navigation bar.

   You see your waiting lists in two groups: **Active** and **Passive**.

10. Click **Disconnect**. Then confirm.

   SeBolig erases the sample data. You are on the home page again.

You now know the three main pages of SeBolig. You also know how to share a viewing.

### 1.2 Run SeBolig on your computer

In this tutorial, you start the server and the client on your computer. Then you open the app in your browser.

**Before you start, you must have:**

- Node.js 24.
- npm.
- Git.
- An OpenAI API key.

**Procedure:**

1. Get the code:

   ```bash
   git clone https://github.com/Omarley7/sebolig.nu.git
   ```

2. Go to the folder:

   ```bash
   cd sebolig.nu
   ```

3. Install the dependencies for the client and the server:

   ```bash
   npm install
   ```

4. Copy the server settings file:

   ```bash
   cp server/.env.example server/.env
   ```

5. Open `server/.env`. Set `OPENAI_API_KEY` to your OpenAI API key.
6. Set `COOKIE_SECRET` to a random text of 32 characters or more. This command makes one:

   ```bash
   openssl rand -hex 32
   ```

7. Copy the client settings file:

   ```bash
   cp client/.env.example client/.env
   ```

8. Open `client/.env`. Set `VITE_BACKEND_DOMAIN` to `http://localhost:3000`.
9. Start the server and the client:

   ```bash
   npm run dev
   ```

   The terminal shows "Server is running on 0.0.0.0:3000". Vite shows a local address.

10. Open <http://localhost:5173> in your browser.
11. Click **Try as demo** to see the app with sample data. Or connect with your own findbolig.nu account.

SeBolig now runs on your computer. When you change a file, the server and the client load the change automatically.

---

## 2. How-to guides

### For users

#### 2.1 Connect your findbolig.nu account

1. Open <https://sebolig.nu>.
2. Type your findbolig.nu email.
3. Type your findbolig.nu password.
4. Click **Connect with findbolig.nu**.

SeBolig shows "Connected to findbolig.nu". Your Connection stays open for 30 days after you last use SeBolig.

To learn what SeBolig does with your password, read the Explainer. Click **How it works** in the footer.

#### 2.2 Get new data from findbolig.nu

SeBolig checks findbolig.nu for changes by itself when you open a page, and again when you come back to the tab. It checks each kind of data at most once a minute. The **Refresh** icon spins while a check runs, and the home page reads "Checking…".

- Appointments and offers: SeBolig gets only the changes since the last check.
- Waiting lists: SeBolig gets all of them again when they are more than 24 hours old.

The home page shows when SeBolig last checked, even if nothing changed.

To get everything again now:

1. Open the page: **Appointments**, **Offers** or **Waiting lists**.
2. Click **Refresh**.

If findbolig.nu does not answer, you keep your Local data.

#### 2.3 Add a viewing to your calendar

1. Open **Appointments**.
2. Click the viewing.
3. Click **Add to calendar**.
4. Select your calendar app.

#### 2.4 Share a viewing with another person

The other person does not need a SeBolig account or a findbolig.nu account.

1. Open **Appointments**.
2. Click the viewing.
3. Click **Share**.
4. Select the format:
   - **Calendar event**: SeBolig makes an `.ics` file. The other person can add it to a calendar.
   - **Text**: SeBolig makes a short message with the address, the date and the time.
5. Select an app or a person in the share menu of your device. For example, select Messages, WhatsApp or Mail.
6. Send the message in the app that you selected.

If your browser has no share menu, SeBolig does these steps:

- For **Text**, SeBolig copies the text. SeBolig shows "Text copied". Paste the text in a message.
- For **Calendar event**, SeBolig downloads the `.ics` file. Attach the file to a message.

> **NOTE:** You cannot share a viewing that is cancelled or that has no date. The **Share** button is not available for these viewings.

For the contents of the text and the calendar event, see [Reference: Shared viewing](#38-shared-viewing).

#### 2.5 Accept or decline a housing offer

1. Open **Offers**.
2. Click the offer.
3. Click **Accept** or **Decline**.
4. Read the dialog. Click **Confirm**.

You can change your answer until the deadline. To undo an accept, click **Undo accept**.

#### 2.6 Make a passive waiting list active again

findbolig.nu can set a waiting list to passive. A passive waiting list does not give you offers.

To make one list active:

1. Open **Waiting lists**.
2. Find the list in the group **Passive**.
3. Click **Set active**.

To make all passive lists active:

1. Open **Waiting lists**.
2. Click **Reactivate all**.

SeBolig shows how many lists it made active. If some fail, SeBolig shows how many.

#### 2.7 Remove yourself from a waiting list

> **WARNING:** You lose your seniority on the list. You cannot undo this.

1. Open **Waiting lists**.
2. Click the list.
3. Go to **Danger zone**.
4. Click **Remove me from waiting list**.
5. Click **Remove me** to confirm.

#### 2.8 Take back access to your account

Use one of these methods:

- **Disconnect in SeBolig.** Click **Disconnect**, then confirm. SeBolig erases all Local data on this device, also the encrypted password.
- **Change your password on findbolig.nu.** SeBolig cannot log in again. The Connection ends at the next renewal.
- **Do nothing for 30 days.** The Connection expires.

A Connection is for one browser on one device. Disconnect on each device that you used.

### For developers

#### 2.9 Run the tests

To test the server:

```bash
npm test --workspace=server
```

To test the client:

```bash
npm test --workspace=client
```

To do a type check of the server:

```bash
npm run typecheck --workspace=server
```

To do a type check of the client, go to `client/` and run:

```bash
npx vue-tsc --noEmit
```

CI runs all of these checks on each pull request. See [Reference: CI checks](#36-ci-checks).

#### 2.10 Make a build that is only the Demo

A Demo build does not use the server or findbolig.nu.

1. Open `client/.env`.
2. Set `VITE_DEMO_MODE=true`.
3. Build the client:

   ```bash
   npm run build
   ```

The files are in `client/dist/`. You can put them on a static web host.

#### 2.11 Run the production server on your computer

1. Build the client:

   ```bash
   npm run build
   ```

2. Start the server:

   ```bash
   npm start
   ```

The server gives the API at `/api` and the client from `client/dist/`. Open <http://localhost:3000>.

#### 2.12 Measure the appointment extractor

The eval harness compares LLM models and prompts. It uses fixtures with real messages.

> **CAUTION:** Fixtures contain personal data. Keep them in `.scratch/extractor-fixtures/`. Git ignores this folder. Do not commit fixtures.

1. Go to the server folder:

   ```bash
   cd server
   ```

2. Collect fixtures from your findbolig.nu account:

   ```bash
   npx tsx --tsconfig tsconfig.json scripts/collect-fixtures.ts
   ```

   The script asks for your email and password. Or set `FINDBOLIG_EMAIL` and `FINDBOLIG_PASSWORD`.

3. Open each file in `.scratch/extractor-fixtures/`.
4. Write the correct answer in `expected`. The script skips a fixture when `expected` is `null`.
5. Run the eval:

   ```bash
   npx tsx --tsconfig tsconfig.json scripts/eval-extractor.ts
   ```

   The output shows the correctness, the p50 and p95 latency, and the tokens for each candidate.

For the options, see [Reference: Scripts](#31-scripts).

#### 2.13 Deploy a change

1. Open a pull request to `main`.
2. Wait until the CI check `checks` passes.
3. Merge the pull request.

A merge to `main` starts a Cloud Build trigger. The trigger deploys to Cloud Run.

> **CAUTION:** Do not commit a patch that has the text `LOCAL-ONLY`. CI stops the build. These patches can contain personal data.

---

## 3. Reference

### 3.1 Scripts

Run these from the repository root.

| Command | Result |
|---|---|
| `npm install` | Installs the dependencies for the client and the server. |
| `npm run dev` | Starts the server and the client together. |
| `npm run dev:server` | Starts only the server, with reload on change. |
| `npm run dev:client` | Starts only the Vite dev server. |
| `npm run dev:client:host` | Starts the Vite dev server on all network interfaces. Use it to test on a phone. |
| `npm run build` | Does a type check of the client and builds it into `client/dist/`. |
| `npm start` | Starts the server without reload. |
| `npm run test:sort` | Tests which sort fields the findbolig.nu offer search accepts. Needs a findbolig.nu account. |
| `npm run clean` | Removes `client/dist/` and all `node_modules/` folders. |

Server scripts. Run these from `server/` with `npx tsx --tsconfig tsconfig.json <script>`.

| Script | Options | Result |
|---|---|---|
| `scripts/collect-fixtures.ts` | Env: `FINDBOLIG_EMAIL`, `FINDBOLIG_PASSWORD` | Writes one fixture for each Finished or Published offer. Keeps unchanged fixtures. |
| `scripts/eval-extractor.ts` | `--runs <n>` (default 3) | Runs each candidate `n` times. |
| | `--only <a,b>` | Runs only candidates with these names. |
| | `--openrouter` | Adds the OpenRouter candidates. Needs `OPENROUTER_API_KEY`. |
| | `--cases` | Shows the result of each fixture. |

### 3.2 Settings

#### Server (`server/.env`)

| Variable | Required | Meaning |
|---|---|---|
| `OPENAI_API_KEY` | Yes | The OpenAI API key for the appointment extractor. |
| `COOKIE_SECRET` | Yes | The key that seals the session cookie. Minimum 32 characters. The server does not start without it. |
| `NODE_ENV` | No | `production` turns off CORS for dev origins and makes the cookie `Secure`. |
| `OPENROUTER_API_KEY` | No | Only for `eval-extractor.ts --openrouter`. Production does not use it. |

> **CAUTION:** When you change `COOKIE_SECRET`, all Connections end at the same time.

#### Client (`client/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `VITE_BACKEND_DOMAIN` | `""` (same origin) | The server address. In development: `http://localhost:3000`. |
| `VITE_IMAGE_BASE_URL` | `https://findbolig.nu` | The host of the residence images. |
| `VITE_DEMO_MODE` | `false` | `true` makes a build that is only the Demo. |

### 3.3 API routes

All routes start with `/api`. All routes except `/api/auth/login` and `/api/auth/logout` need a Connection cookie.

| Method | Route | Body or query | Result |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | Makes a Connection. Returns `{ fullName, email }`. |
| POST | `/auth/logout` | – | Removes the cookie. Returns `{ ok: true }`. |
| GET | `/auth/refresh` | – | Checks the Connection. Returns the user. |
| POST | `/appointments/sync` | `{ cached }` | Returns all upcoming appointments. |
| POST | `/appointments/delta` | `{ since, sinceIds, cached }` | Returns the appointment changes since the cursor. |
| GET | `/offers/active` | – | Returns all active offers. |
| GET | `/offers/delta` | `?since=…&sinceIds=a,b` | Returns the offer changes since the cursor. |
| POST | `/offers/:offerId/accept` | – | Accepts the offer. |
| POST | `/offers/:offerId/decline` | – | Declines the offer. |
| GET | `/waiting-lists` | – | Returns all waiting lists. |
| POST | `/waiting-lists/:propertyId/set-active` | – | Makes the waiting list active. |
| DELETE | `/waiting-lists/:propertyId` | – | Removes the user from the waiting list. |

A delta route returns a `Delta`:

| Field | Meaning |
|---|---|
| `items` | Changed items. |
| `removedIds` | IDs of items to remove. |
| `latestUpdated` | The next cursor. `null` means: keep the old cursor. |
| `latestUpdatedIds` | The IDs of all items at `latestUpdated`. |

### 3.4 Error responses

| Status | Body | Cause | Connection |
|---|---|---|---|
| 400 | `{ error }` | A field is missing, for example `since`. | Kept |
| 401 | `{ error: "Authentication required" }` | No cookie, or the cookie is not valid. | None |
| 401 | `{ error, reason: "credentials_rejected" }` | findbolig.nu refused the stored password. | Ended, cookie removed |
| 401 | `{ error, reason: "findbolig_session_lost" }` | The findbolig session expired and renewal failed. | Ended, cookie removed |
| 401 | `{ error: "Invalid email or password" }` | Login refused (only `/auth/login`). | None |
| 502 | `{ error: "upstream_unavailable" }` | findbolig.nu answered with a 5xx status. | Kept |
| 504 | `{ error: "timeout" }` | findbolig.nu did not answer. | Kept |
| 500 | `{ error: "Internal server error" }` | Other errors. | Kept |

### 3.5 Limits and times

| Item | Value | Location |
|---|---|---|
| Connection idle time | 30 days. Each request starts the 30 days again. | `server/src/lib/session.ts` |
| Connection check in the client | Every 3 minutes | `client/src/composables/useAuth.ts` |
| findbolig.nu calls at the same time, per Connection | 5 | `server/src/lib/limiter.ts` |
| LLM calls at the same time, per server | 16 | `server/src/lib/llm/openai-extractor.ts` |
| Production LLM model | `gpt-6-luna`, reasoning effort `none` | `server/src/lib/llm/openai-extractor.ts` |
| Client timeout: connect | 25 s | `client/src/composables/useAuth.ts` |
| Client timeout: full fetch | 90 s | `client/src/data/*/http.ts` |
| Client timeout: appointment delta | 30 s | `client/src/data/appointments/http.ts` |
| Client timeout: offer or waiting list action | 25 s | `client/src/data/*/http.ts` |

### 3.6 CI checks

The workflow is `.github/workflows/ci.yml`. It runs on each pull request and on each push to `main`. The steps are, in sequence:

1. Stop if `pnpm-lock.yaml` or `yarn.lock` exists. The repo uses npm only.
2. Stop if a file contains `LOCAL-ONLY`.
3. `npm ci`.
4. Server type check.
5. Server tests.
6. Client type check.
7. Client tests.
8. Client build.

### 3.7 Repository layout

| Folder | Contents |
|---|---|
| `client/src/views/` | One Vue file for each page. |
| `client/src/components/` | Vue components. |
| `client/src/stores/` | Pinia stores for appointments, offers and waiting lists. |
| `client/src/localData/` | How each kind of Local data is stored and merged. |
| `client/src/data/` | HTTP and Demo data sources, and the mock JSON files. |
| `client/src/i18n/locales/` | Text in Danish (`da.json`) and English (`en.json`). |
| `server/src/app.ts` | All API routes. |
| `server/src/offer-listing.ts` | The walk over the findbolig.nu offer list: cursor, pages and failure rule. |
| `server/src/appointments.ts`, `offers.ts`, `waiting-lists.ts` | One view of findbolig.nu data each. |
| `server/src/lib/findbolig-client.ts` | All calls to findbolig.nu. |
| `server/src/lib/llm/` | The appointment extractor. |
| `server/scripts/` | Fixture and eval scripts. |
| `shared/types.ts` | Types for the client and the server. |
| `docs/adr/` | Architecture decision records. |

### 3.8 Shared viewing

**Share** is in the detail sheet of a viewing. It is available when the viewing has a date and is not cancelled.

#### Formats

| Format | Content | File |
|---|---|---|
| Text | Plain text. See the template below. | – |
| Calendar event | One iCalendar event (RFC 5545). | `viewing-<date>.ics`, type `text/calendar` |

#### Text template

```text
Viewing: <address>, <postal code> <city>
<weekday> <date>, <start time>–<end time>
Map: <map link>
```

Example:

```text
Viewing: Ålekistevej 59, 2720 Vanløse
Tuesday 20 October 2026, 16:00–17:00
Map: https://maps.google.com/?q=Ålekistevej+59,+2720+Vanløse
```

| Line | Rule |
|---|---|
| Line 1 | Always present. "Open house" replaces "Viewing" for an open house. |
| Line 2 | Always present. Without an end time, the line shows only the start time. |
| Line 3 | Always present. The link opens the address in a map app. |

The text uses the app language (Danish or English) and the date format of that language.

#### Calendar event fields

| Field | Value |
|---|---|
| `SUMMARY` | "Viewing: <address>" or "Open house: <address>" |
| `LOCATION` | `<address>, <postal code> <city>` |
| `DTSTART` | Date and start time, time zone `Europe/Copenhagen` |
| `DTEND` | Date and end time. Without an end time: start time plus 1 hour. |
| `DESCRIPTION` | The same text as the **Text** format |

#### Content that SeBolig does not share

| Item | Reason |
|---|---|
| Your name and email | Personal data. |
| Your queue position | Personal data. |
| The findbolig.nu link | The other person cannot open it without an account. |
| Rent, photos and floor plans | Not necessary to go to the viewing. |

#### Share methods

| Condition | Text | Calendar event |
|---|---|---|
| Browser can share | Share menu of the device (`navigator.share` with `text`) | Share menu of the device (`navigator.share` with `files`) |
| Browser cannot share | Copy to clipboard | Download of the `.ics` file |

---

## 4. Explanation

### 4.1 Why SeBolig needs your password

findbolig.nu has no delegated login. It has no OAuth, no MitID login for apps, no public API and no app tokens. The maintainer checked this on 2026-09-05.

Thus, SeBolig must log in with your email and password, as you do. A findbolig session expires after some time. To renew it without your help, SeBolig must keep your password. SeBolig calls this **silent re-authentication**.

### 4.2 Where your password is kept

The server does not keep your password. The server has no database.

After you connect, the server puts these items into one encrypted cookie:

- Your findbolig.nu email and password.
- The findbolig.nu cookies.
- Your name.

The server seals the cookie with `iron-webcrypto` and `COOKIE_SECRET`. The cookie is `HttpOnly`. Thus, JavaScript on the page cannot read it. Your browser sends the cookie only to `/api`.

On each request, the server opens the cookie and calls findbolig.nu for you. Then it seals the cookie again with a new 30-day expiry. The server then forgets the request.

The team considered two other designs:

- **Keep only the findbolig.nu cookies.** This is more private. But you must type your password each time a findbolig session expires. The team can do this again if findbolig sessions are long.
- **Keep passwords in a server database.** One leak then shows the passwords of all users. The team did not accept this risk.

For the full decision, see [docs/adr/0001-password-custody-in-sealed-cookie.md](docs/adr/0001-password-custody-in-sealed-cookie.md).

### 4.3 How a Connection ends

A Connection ends in these cases:

- You disconnect.
- You do not use SeBolig for 30 days.
- You change your password on findbolig.nu. At the next renewal, findbolig.nu refuses the old password. The server returns `credentials_rejected` and removes the cookie.
- The findbolig session expires and renewal fails. The server returns `findbolig_session_lost`.

When a Connection ends, the client erases all Local data. For a changed password, the client tells you why.

When findbolig.nu is down, the Connection does not end. The server returns 502 or 504. You keep your Local data.

### 4.4 Why SeBolig keeps Local data

SeBolig keeps your data in the browser storage on your device. This has three advantages:

- You can see your viewings when you are offline.
- The app opens quickly. It shows Local data first and then gets changes.
- The server does not keep housing data.

Each device and each browser has its own Local data and its own Connection.

### 4.5 How SeBolig gets only the changes

Offers and appointments both come from the findbolig.nu offer list. The server reads this list from the newest `updated` value to the oldest.

The first fetch is a **full sync**. The server reads all pages of the list. It returns all items and a **cursor**.

The cursor has two parts:

- `since`: the newest `updated` value. This value comes from the findbolig.nu clock, not from the browser clock.
- `sinceIds`: the IDs of all offers at exactly that `updated` value.

The next fetch is a **delta**. The client sends the cursor. The server reads one page at a time and stops at the cursor. The server returns only the changed items and the IDs of removed items.

Why does the cursor need IDs? Many offers can have the same `updated` value. findbolig.nu does not keep a stable sequence for them. The IDs tell the server which of these offers the client already has.

### 4.6 What happens when part of a fetch fails

The server tries to build each changed offer. There are three results:

| Result | Cause | What the server does |
|---|---|---|
| ok | The server built the item. | Returns it in `items`. |
| gone | findbolig.nu answered, but there is nothing to build. Example: the offer has no residence. | Returns the ID in `removedIds`. Moves the cursor. |
| failed | A temporary error. Example: findbolig.nu is down or the LLM fails. | Leaves out the item. Returns `latestUpdated: null`. |

When the cursor is `null`, the client keeps its old cursor. At the next fetch, the client asks for the same changes again. Thus, SeBolig does not lose a change.

### 4.7 How SeBolig finds the date of a viewing

findbolig.nu does not give the date of a viewing as a field. The landlord writes the date in a message or in the showing text of the offer.

SeBolig uses an LLM to read the date:

1. The server collects the messages about a viewing, oldest first. Each message has the date it was sent. This date gives the year for text such as "3/1" or "i morgen".
2. If there are no such messages, the server uses the showing text of the offer.
3. The server sends one of the two sources to the LLM. It never sends both. The general words in the showing text caused the LLM to miss clear dates in the messages.
4. The LLM returns the date, the start time, the end time, a "cancelled" flag and a quote.
5. The server accepts the date only if the quote is in the source text. From the showing text, the date must also have a time.

To save time and cost, the server does not always call the LLM:

- For a past viewing, the server returns the client's copy. It does not call findbolig.nu.
- If the number of messages did not change, the server uses the client's last answer.

The server makes a maximum of 5 findbolig.nu calls at the same time for each Connection. This protects findbolig.nu. The LLM calls do not use these 5 slots. Thus, a slow LLM call does not stop other findbolig.nu calls.

### 4.8 How the Demo works

The Demo uses the same pages and stores as a real Connection. Only the data source is different: the Demo reads the mock JSON files in `client/src/data/`. It waits a short time to act like findbolig.nu.

The Demo never sends data to findbolig.nu or to the SeBolig server. SeBolig remembers the Demo after a reload. When you end the Demo, SeBolig erases the sample data, as for a disconnect.

### 4.9 How sharing works

You often go to a viewing with another person, for example a partner or a friend. This person usually has no SeBolig account. Thus, the shared content must work without SeBolig and without findbolig.nu.

SeBolig makes the text and the calendar event on your device, from your Local data. The SeBolig server does not get the shared content. The share also works offline and in the Demo.

SeBolig gives the content to the share menu of your device. This menu shows the apps that you already use, for example Messages or WhatsApp. SeBolig does not need to know these apps. If the browser has no share menu, SeBolig copies the text or downloads the file. You then send it yourself.

There are two formats because people use them differently:

- **Text** is easy to read in any chat app. Use it when the other person only needs the address and the time.
- **Calendar event** puts the viewing directly into a calendar, with a reminder if the calendar app sets one. Use it when the other person wants the viewing in a calendar.

The shared content is a copy. If the landlord changes the time, SeBolig does not update the copy. Share the viewing again after a change.

SeBolig shares only what the other person needs to go to the viewing: the place and the time. It does not share personal data, such as your queue position. It does not share the findbolig.nu link, because the other person cannot open it without an account.

### 4.10 Usage statistics

SeBolig uses PostHog for usage statistics. The data is stored in the EU. PostHog records which pages you use and where you click.

PostHog connects these records to a random ID on your device. It does not connect them to your findbolig.nu account. PostHog does not get your name, your email or the text that you see and type.
