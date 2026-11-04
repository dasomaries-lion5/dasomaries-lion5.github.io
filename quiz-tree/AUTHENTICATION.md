# Authentication and request flow

## Existing GitHub Pages homepage

The original `index.html` fetches `profile.json` anonymously. There is no login server, OAuth flow, session cookie, or refresh-token flow in the original repository.

`edit.html` has a manual GitHub personal access token input. On Save, the browser sends `Authorization: Bearer <token>` to GitHub's Contents API, reads `profile.json` on `main` to obtain its current SHA, then PUTs the new Base64-encoded UTF-8 JSON with that SHA and branch `main`. GitHub validates the token and repository Contents write permission. Base64 encodes the file, not the credential.

The token remains in the password field and request headers. If the user checks “remember”, it is also persisted unencrypted in localStorage under `classroomProfileRepo`; otherwise only owner/repository preferences are saved. Remembered values are restored on page load. This is not secure storage against scripts executing on that origin. No token is included in profile.json by that code. This app does not change the original homepage/editor or their token handling.

## New quiz app components

- `app/page.tsx`: teacher setup and student join/game UI; polls the server every 1.2 seconds. Local storage keeps recent room links and the student's opaque participation token.
- `app/api/classroom/route.ts`: server authorization, name/number reservation, confirmation, game lifecycle, deadline enforcement, scoring, cumulative records.
- `db/schema.ts` and `drizzle/`: D1 `classrooms` table. A room has a stable owner identity, JSON state, and revision number. Updates compare the revision and retry on conflicts, preserving concurrent answers without a ten-player cap. Thirty simultaneous registrations and submissions are covered by the handler tests.
- Sites dispatch: ChatGPT sign-in and identity-header injection. It owns OAuth cookies and reserved sign-in routes; the quiz server never receives or stores an OpenAI/GitHub API credential.

### Teacher flow

1. Teacher uses a top-level `/signin-with-chatgpt?return_to=/` link. Sites manages the sign-in and cookies.
2. A create request receives the dispatch-provided `oai-authenticated-user-id`, which is stored as the room owner.
3. Every save/start/next/finish request checks that request identity against the stored owner. Changing `teacher=1` in a URL only selects the teacher layout; it grants no server permission.
4. The owner's room listing is selected server-side by that identity. Public student responses omit the saved question bank and current correct answer until reveal.

The application trusts identity headers only because production requests pass through the Sites dispatch boundary. Do not expose the Worker directly through a separately reachable URL that accepts caller-supplied identity headers.

### Student flow

1. A student opens an unguessable room UUID link without a PIN or account.
2. The server normalizes Unicode and whitespace, then matches the exact name within that room. A new name receives the next stable number; an existing name reuses its number and history.
3. The server issues a random UUID token, stores it in that student's server-side token list, and returns it to the browser. The browser keeps it as `qt-token-<room-id>` and sends `x-student-token` on requests. Up to eight recent device sessions per name remain valid.
4. Confirmation locks the displayed name/number and enrolls the student into an open lobby, in the same revision-protected update. Ten or more participants are supported; a small group may also rehearse.
5. Server validates token, participant membership, round ID, question index, deadline and duplicate answer before scoring. A correct answer earns 1,000 points. Each answer also records elapsed milliseconds measured server-side from its question opening. Race positions sort by correct-answer count descending, then total elapsed time ascending. Unanswered opened questions accrue time up to the teacher reveal or deadline; teacher waiting time between questions is excluded. Ending a round appends a separate record with Korea time; totals sum completed records.

Name-based recognition is intentionally a classroom convenience, not verified student identity: anyone with the room link who enters the same name can access that name's participation record. Use distinguishable classroom nicknames for same-name students and distribute the link to the intended class. No student token grants teacher permission. Tokens are not logged or committed. Question-bank edits are not available during an active game.

### Other handling

Same-origin POST checks reject cross-origin browser requests. React escapes rendered names/questions. Current answers and teacher authorization are checked server-side rather than trusting UI controls. Class data and score history live in D1, not browser-only storage. The GitHub token used by the old editor is unrelated to the quiz app.

PDF text extraction runs in the teacher's browser using PDF.js from cdnjs. PDF bytes are not uploaded by this implementation. Reviewed question text is stored in D1 when saved. The current generator creates rule-based sentence/blank/initial/OX drafts, not generative-AI questions; scanned PDFs need OCR or pasted text. No model API key has been configured.

## Validation

`node tests/classroom.test.mjs` exercises the real API handlers with an in-memory D1 adapter: teacher authorization; thirty concurrent registrations with unique IDs; all thirty admitted; same-name return; hidden answers; thirty concurrent submissions; speed ranking, ties, unanswered-time accounting; duplicate and late rejection; cumulative records across two rounds; cross-origin POST rejection. Run `npx tsc --noEmit` and the Sites build helper for type/build checks. This does not substitute for a live thirty-device classroom test.

Legacy score history without elapsed timing is preserved; its time displays as an em dash instead of an invented duration. New races persist both points and elapsed milliseconds.

## PIN, QR and images

A six-digit room PIN is an alternate public classroom locator, not a teacher password. `room_pins` has unique constraints on both code and room; server-side generation retries collisions. Existing UUID links remain valid. A room keeps the same PIN for later sessions. `/api/classroom` `lookupPin` returns only the room ID, and `invite` is owner-only. QR images encode the UUID join URL and are generated locally with `qrcode`, without a third-party QR service. Neither entry method grants teacher rights. Lobby opening does not start question timing; only the owner's `next` action starts the first question.

Image-material OCR uses Tesseract in the teacher's browser. The OCR engine and Korean/English language data are downloaded from its default CDN endpoints; photo pixels are processed locally. OCR output becomes editable source text and is stored only when reviewed questions are saved.

Question illustration uploads use owner-authorized, same-origin `/api/image` multipart POST. The server checks room ownership, a 2MB file limit, and JPEG/PNG/WebP magic bytes; SVG/HTML is rejected. R2 stores raster bytes under room-scoped UUID keys. Question-bank records contain only scoped `/api/image` references, not arbitrary external URLs or inline megabyte strings. Image GET is public like the classroom link. Students see the illustration with the current question. Removing an image from a draft detaches it; it does not delete stored objects.
