# Notes Service

A back-end REST service where users capture and work on their notes, shared among many small teams. Each note belongs to its author within a team, and the author decides whether the team can see it.

## Getting Started

Requires Node 20 or later.

```
npm install
npm start          # listens on port 3000 (set PORT to change it)
npm test
```

## Quick Example

```
curl -i -X POST localhost:3000/notes \
  -H 'Content-Type: application/json' -H 'X-Team-Id: red' -H 'X-User-Id: ann' \
  -d '{"title":"Sprint ideas","body":"Try pairing","visibility":"TEAM"}'

curl localhost:3000/notes -H 'X-Team-Id: red' -H 'X-User-Id: bob'
```

Bob, in the same team, sees Ann's `TEAM` note. A user in another team does not.

## Project Structure

```
app.js                    entry point
routes/note_routes.js     HTTP only
manager/note_manager.js   business rules
api/note_api.js           data access (in memory)
model/note_model.js
enum/visibility_enum.js, enum/scope_enum.js
error/validation_error.js, unauthorized_error.js, forbidden_error.js, not_found_error.js
test/note_routes.test.js
```

**File names carry their tier as a suffix** (`_routes`, `_manager`, `_api`, `_model`, `_enum`, `_error`). This design decision gives context inline within the code: an import line, editor tab or stack trace shows which tier a file belongs to without reading its folder.

## Design Decisions

1. **Who can see and change a note.** The brief says users work on *their* notes and the service is shared among teams. So a note belongs to its author within a team, and the author chooses `MINE` (only the author) or `TEAM` (the whole team). Only the author can change or delete it. A note the caller cannot see returns 404, so its existence is not revealed; a team note the caller can see but not change returns 403.
2. **Identity without login.** The brief does not ask for authentication, but visibility needs to know the caller. Every request carries `X-Team-Id` and `X-User-Id`; the service trusts them, as it would behind a gateway that verifies the user. This keeps the rules real and testable while leaving login out of scope.
3. **Three tiers.** Routes handle HTTP only, the manager holds every business rule, and the api tier only stores data. The rules can be read and changed in one place, and the in-memory store can become a database without touching the other tiers. A three-tier architecture is my standard approach. Not every application needs this structure, but the overhead of creating it is low, and its maintainability, extensibility and clarity make it a valuable standard.

## Assumptions

- **No UI.** The brief asks for a runnable service with REST APIs, so this delivers the API only; there is no user interface.
- **Identity comes from headers.** Every request carries `X-Team-Id` and `X-User-Id`; a missing header returns 401. The service trusts them: in production, a login service or API gateway would verify the user and set them.
- **Notes belong to a user within a team.** Each note is stamped with its author's team and user IDs. A note is never visible outside its team.
- **Visibility is `MINE` or `TEAM`, and a new note without one is `MINE`.** A `MINE` note is visible only to its author; a team note is visible to everyone in the author's team.
- **Listing notes: `scope` and `author`.** `scope` is `mine` or `team` and defaults to `team`. `scope=team` returns all of your own notes (`MINE` and `TEAM`) plus the other team members' `TEAM` notes. `scope=mine` returns only your own notes, and `author` is ignored. `author` narrows the list to one author; when it is not provided, notes from all authors in scope are returned.
- **Only the author can update or delete a note.** A team member who can see a team note but tries to change it gets 403; a note the caller cannot see returns 404, so its existence is not revealed.
- **A note has a required `title` and an optional `body`.** The service sets `id`, `teamId`, `authorId`, `createdAt` and `updatedAt`. Other fields sent by the caller are ignored.
- **Storage is in memory only.** Notes are held in the running process and are **lost when the service stops or restarts**. There is no database. The data-access tier is isolated and asynchronous so a database can replace it without changing the other tiers.
- **Starting the server.** `app.js` listens unless it is given `--test`; the tests add `--test` before importing it. I would prefer a different approach (see below), but chose the simplest one because time was short.
- **Node 20 or later.** `app.js` stops with a clear message on an older version. Node 18 is past end of life.
- **Deletes are permanent.** There is no soft delete or history.

## API Reference

Every request needs `X-Team-Id` and `X-User-Id`. Errors are JSON: `{ "error": "...", "details": ["..."] }`.

| Method | Path | Body or Query | Success | Errors |
|---|---|---|---|---|
| `POST` | `/notes` | `{ title, body?, visibility? }` | 201 + Location | 400, 401 |
| `GET` | `/notes` | `?scope=mine\|team&author=` | 200 list | 400, 401 |
| `GET` | `/notes/{id}` | | 200 | 401, 404 |
| `PATCH` | `/notes/{id}` | any of `{ title, body, visibility }` | 200 | 400, 401, 403, 404 |
| `DELETE` | `/notes/{id}` | | 204 | 401, 403, 404 |

## With More Time

- **Persistence.** Replace the in-memory store with a database so notes survive a restart.
- **Authentication and teams.** Users log in; the service verifies who they are and which team they belong to, instead of trusting headers. Registration and team membership come with it.
- **Public notes.** If there is interest, a third visibility, `PUBLIC`, could be introduced so a note is visible across all teams. It would need cross-team listing, search and paging.
- **Distinguishing test runs.** I would rethink how to distinguish test runs from non-test runs. The `--test` parameter was the fastest way to implement the difference given our timeframe.
- **Manager unit tests.** The rules are tested through HTTP today; testing the manager directly would be faster and more focused.
- **Paging and sorting** for the list.

## AI-Assisted Development

Claude Code was used to write the code and this document. The design and each decision in it were worked through and directed by the author.

This documentation is intentionally brief. Questions or requests for more detail are welcome and can guide further discussion.
