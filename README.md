Commercial use requires a commercial license.
Contact: omarg@live.dk

All contributors agree to the CLA defined in CLA.md by submitting a pull request.

# SeBolig.nu

Better dashboard for FindBolig.nu with local storage and offline access. Currently live on https://sebolig.nu.

## Architecture

- **Server**: Node.js with native 'http' module + TypeScript
- **Client**: Vue 3 + TypeScript + Vite + Tailwind CSS
- **Storage**: IndexedDB (client-side) and server-side in-memory or persistence depending on deployment

## Repository layout

```
SeBolig.nu/
├── README.md
├── package.json
├── client/                     # Vue 3 client app (Vite + TypeScript + Tailwind)
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── config.ts           # client-side config (e.g. API base URL)
│       ├── style.css
│       ├── components/
│ 	   ├── composables/
│	   ├── data/
│	   ├── i18n/                # translation files
│	   ├── lib/
│	   ├── router/
│	   ├── stores/
│	   └── views/
├── server/                     # TypeScript server code
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── app.ts              # routes
│       ├── offer-listing.ts    # the walk over findbolig's offers: cursor and failure rule
│       ├── offers.ts / appointments.ts / waiting-lists.ts
│       ├── lib/
│       └── types/
├── shared/                     # Shared types/utilities used by both client and server
└── misc/                       # any scripts, docs, diagrams, etc.
```

Notes:

- The client is a Vite + Vue 3 project located in `client/`.
- The server is a TypeScript project in `server/` exposing services used by the client.
- Shared types live in `shared/types.ts`.

## Setup (development)

Install dependencies at the root level. This will install both client and server dependencies:

```bash
npm install
```

Both server and client can be started in parrallel with:

```bash
npm run dev
```
