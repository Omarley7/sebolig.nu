# Delta refresh — offers & appointments

Diagrams for the `feat/offers-delta-refresh` branch (issue #47). Covers the
navigation-triggered delta check, how it fits into the existing architecture,
the simplified store lifecycle (post `needsRefresh`/`sessionExpired` removal),
and why waiting lists deliberately did **not** get the same treatment.

## 1. Process timing — delta check on navigation

Same shape for `/offers` and `/appointments` (appointments swaps
`enrichOffer` for `enrichAppointment`, and the "Published" filter for
"Finished or Published").

```mermaid
sequenceDiagram
    actor User
    participant View as OffersView.vue
    participant Store as offers store
    participant Route as GET /api/offers/delta
    participant Svc as findbolig-service.ts
    participant FB as findbolig.nu

    User->>View: navigate to /offers
    View->>Store: init()
    Store->>Store: read cache (offers, latestUpdated)

    alt cursor exists
        Store->>Route: since=latestUpdated
        Route->>Svc: getOfferUpdates(cookies, since)
        Svc->>FB: POST /api/search/offers (updated desc, page 0)
        FB-->>Svc: page of offers
        Note over Svc,FB: just 1 request if nothing changed

        alt nothing newer than cursor
            Svc-->>Route: items: [], removedIds: [], latestUpdated
        else changed offers found
            loop each changed offer still Published
                Svc->>FB: GET residence
                Svc->>FB: GET waiting-list position
            end
            Svc-->>Route: items: [...enriched], removedIds, latestUpdated
        end
        Route-->>Store: 200 OK
        Store->>Store: upsert items, drop removedIds
    else no cursor yet (pre-migration cache)
        Store->>Store: ensureSession()
        Store->>Store: refresh() — full /api/offers/active fetch
        Note over Store: seeds latestUpdated for next time
    end

    Store-->>View: reactive offers[] updated
```

## 2. Architecture — shared delta primitive

`getOffersUpdatedSince` is the one piece both offers and appointments walk
through; waiting lists never reaches it because its upstream data has no
`updated` cursor to walk (see diagram 4).

```mermaid
flowchart LR
    subgraph Client["Vue client"]
        OV["OffersView"] --> OS["offers store"]
        AV["AppointmentsView"] --> AS["appointments store"]
        WV["WaitingListsView"] --> WS["waitingLists store"]
        RG[["useRefreshGate"]]
        OS -.-> RG
        AS -.-> RG
        WS -.-> RG
    end

    subgraph Server["Hono server"]
        RO["/api/offers/*"]
        RA["/api/appointments/*"]
        RW["/api/waiting-lists"]
        Svc["findbolig-service.ts"]
        Delta[["getOffersUpdatedSince (shared)"]]
        EnrichO["enrichOffer"]
        EnrichA["enrichAppointment"]
    end

    FB[("findbolig.nu")]

    OS --> RO
    AS --> RA
    WS --> RW

    RO --> Svc
    RA --> Svc
    RW --> Svc

    Svc --> Delta
    Delta --> EnrichO
    Delta --> EnrichA
    EnrichO --> FB
    EnrichA --> FB
    Delta --> FB
    Svc --> FB
```

## 3. Store lifecycle (after removing `needsRefresh` / `sessionExpired`)

One login-prompt path for every "not authenticated" reason, instead of a
separate `sessionExpired` flag with its own banner.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> CheckingDelta: init(), cursor exists
    Idle --> SelfHealing: init(), no cursor yet
    CheckingDelta --> Idle: delta applied (or no-op)
    SelfHealing --> Idle: session valid, refreshed
    SelfHealing --> Idle: session invalid, cache shown as-is
    Idle --> Refreshing: user clicks refresh button
    Refreshing --> Idle: success
    Refreshing --> LoginPrompt: 401 / invalid session
    LoginPrompt --> Refreshing: login succeeds (pending refresh replays)
```

## 4. Why waiting lists has no delta

```mermaid
flowchart TD
    Q1{"Does the upstream resource expose<br/>an 'updated' timestamp?"}
    Q1 -->|"Yes — ApiOffer.updated<br/>(offers, appointments)"| P1["Walk updated-desc listing,<br/>compare to stored cursor"]
    Q1 -->|"No — ApiResidenceApplication<br/>has no updated field"| Q2{"Is there a signal cheaper<br/>than what users actually care about?"}
    Q2 -->|"Queue position IS the expensive<br/>per-property fetch itself"| C1["No cheap delta possible:<br/>cache + manual refresh only"]
    P1 --> P2["Enrich only the items that changed"]
```
