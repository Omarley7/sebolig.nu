# Issue tracker: GitHub Issues

Issues and specs for this repo live as GitHub Issues on `Omarley7/sebolig.nu`. Use the `gh` CLI for every operation. The repo is **public**: never put credentials, cookies, CPR numbers or other personal data in an issue, comment or body.

`.scratch/` (gitignored) is for each developer's private drafts and throwaway research only. Nothing in it is the source of truth.

## Conventions

- **Spec**: one issue per feature, titled `Spec: <feature>`, labelled `spec`. The body is the full spec.
- **Ticket**: one issue per implementation ticket, titled `<feature>: <ticket title>`. The body starts with `Spec: #<spec number>` and ends with the acceptance criteria. Never combine several tickets in one issue.
- **Parent link**: add each ticket as a sub-issue of its spec, so the spec shows progress:
  `gh api -X POST repos/Omarley7/sebolig.nu/issues/<spec>/sub_issues -F sub_issue_id=<ticket database id>`
  (get the database id with `gh api repos/Omarley7/sebolig.nu/issues/<n> --jq .id`).
- **Blocking**: record blockers natively:
  `gh api -X POST repos/Omarley7/sebolig.nu/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker database id>`.
  Also write a `**Blocked by:** #n, #n` line near the top of the body so it is readable without the API.
- **Triage state**: a label from `triage-labels.md`. One triage label per issue at a time.
- **Comments**: conversation history goes in issue comments (`gh issue comment <n> --body-file -`), not edits to the body.
- **Closing**: close a ticket when its PR merges (`Closes #n` in the PR body). Close the spec when all its sub-issues are closed.
- **Parked work**: a feature that is paused carries the `parked` label and a comment saying where the work stands (branch name, which tickets are done).

## When a skill says "publish to the issue tracker"

Create the issue with `gh issue create --title "..." --label "..." --body-file -`, then add parent and blocking links as above. Report the issue URL.

## When a skill says "fetch the relevant ticket"

`gh issue view <n> --comments`. Also fetch the linked spec issue if the ticket references one. The user normally passes the issue number or URL.

## Finding work

Open, unblocked tickets ready for an agent:
`gh issue list --label ready-for-agent --state open`
then skip any whose `Blocked by` issues are still open.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an issue with one **child** sub-issue per ticket.

- **Map**: an issue titled `Map: <effort>`, labelled `map`, whose body holds the Notes / Decisions-so-far / Fog sections.
- **Child ticket**: a sub-issue of the map with the question in the body, labelled with its type (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: native `blocked_by` dependencies, as above. A ticket is unblocked when every blocker is closed.
- **Frontier**: open, unblocked, unassigned sub-issues of the map; lowest number wins.
- **Claim**: assign yourself (`gh issue edit <n> --add-assignee @me`) before any work.
- **Resolve**: comment the answer under an `## Answer` heading, close the issue, then edit the map's Decisions-so-far to add the gist and a link to the child.
