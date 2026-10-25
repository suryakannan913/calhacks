# Person B: Claude and Cartesia

Implemented in `convex/ai.ts`, `convex/voice.ts`, and internal helpers in
`convex/messages.ts` and `convex/matches.ts`. All external requests run from
Convex actions. Public message mutation signatures, tables, and statuses stay
unchanged. Live parent intake is implemented with durable Agent threads and an explicit approval gate.

## Connect to the team's backend

1. Ask Person A to invite your Convex account and identify the intended dev
   deployment. Do not create a separate project by accident.
2. From `app/`, run `npm install`, then `npx convex dev` and select the existing
   project/deployment. This deploys local functions, so coordinate with A first.
   It also regenerates `_generated` types from `convex.config.ts`.
3. In that deployment's dashboard, set `ANTHROPIC_API_KEY` and
   `CARTESIA_API_KEY`. Do not put keys in chat, frontend variables, or Git.
4. Choose two stock voices in Cartesia's playground, audition both, and give A
   their IDs. Replace the seed placeholders or patch the synthetic children in
   the dashboard. Never clone a real child/person's voice.
5. Run `npx convex run ai:readiness --deployment limitless-pony-148` to inspect configuration without printing
   keys. Missing keys and placeholder voices are reported.

Optional deployment environment overrides:

- `ANTHROPIC_FAST_MODEL`: defaults to `claude-haiku-5-5`.
- `ANTHROPIC_MATCH_MODEL`: defaults to `claude-sonnet-5-5`.
- `CARTESIA_MODEL_ID`: defaults to `sonic-3.6`.
- `CARTESIA_VERSION`: defaults to `2026-10-24`. Verify with a live call and pin
  the version used for that test.

This checkout is connected to the team's development deployment
`limitless-pony-148` in `prabhavgoel8:calhacks`. Functions were deployed and
Convex regenerated the API/environment declarations. Both provider keys were
verified without printing their values.

Live API checks on October 24, 2026 succeeded: real Claude expansion and
moderation, real Cartesia audio for both voices, Convex file storage, and
HTTP retrieval of three valid WAV files (120,030–141,198 bytes). A threatening
synthetic draft was confirmed through the normal mutation and flagged without
an audio storage ID. Tests used an isolated room, then removed its records and
audio files; the team's existing demo room was not reset.

Matching was also tested live: Sonnet wrote five proposals/updated reasons,
while preserving the existing approved match. Sonnet 5.5 rejects forced tool
selection, so the provider uses automatic tool selection for matching and
validates the tool result before any writes. Haiku retains forced selection.

Selected stock voices:
- Maya: Skylar, `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4`.
- Leo: Parker, `30894953-bcce-41fe-892c-15ce19c843ff`.

These IDs are now in seed data and the existing Maya/Leo records. Aiden, Priya,
and Sam still need real voice choices before speaking. Generated WAV structure
and downloadability were verified; human listening and two-browser playback
still need a final check with C's UI.

A real prompt failure was observed: `red + train` became “I want the red train,”
which invented a request. The prompt now explicitly forbids inferring a request
from object/attribute-only symbols; the next live draft was “I see a red train.”
This is a useful limitation example, not evidence of a real child correcting a
draft. The mandatory child gate remains necessary.

## Core flow and team handoff

`messages.sendSymbols` schedules `ai.expandSymbols`; a successful short draft
is saved as `draft`. Only `messages.confirm` sets `finalText` and schedules
`ai.moderate`. Moderation approves speech atomically and schedules
`voice.speak`. Speech claims that approval once, requests WAV bytes from
Cartesia, stores the Blob in Convex, then atomically checks the text, voice,
request token and active room before marking `spoken`.

- C: render the child confirm/reject gate. Play only `spoken` messages with an
  `audioUrl`, track played message IDs, and stop current audio on room Pause.
  Browsers can require an initial user gesture to enable audio playback.
- A: `messages.setSpoken` is retained but intentionally throws; the new
  `finishSpeech` helper is the guarded write path. `sendSymbols` now validates
  symbols against the child's grid. There are no new tables/statuses.
- A/D: run `npx convex run ai:proposeMatches` to rank the first 20 synthetic
  profiles and save up to six validated pairs. Existing open/approved/declined
  matches are preserved; only unapproved proposals can receive updated reasons.
- D: draft generation is literal-only, first-person, present-tense and at most
  12 words, with mandatory child confirmation. Claude may still misread intent
  or rank a poor match. Parent match approval, moderation and Pause are separate
  safeguards. Use synthetic data only. Moderation is limited, not a guarantee.

`moderationNote` also carries internal approval/claim/cache metadata to preserve
our shared schema. Display it to families only for `flagged` messages or the
human-readable error notes, not for successful/processing messages.

## Failure behavior and demo audio

Draft errors reject the pending draft with a retry note rather than inventing
words. Moderation errors flag the message and do not reach Cartesia. TTS errors
leave it `confirmed` with an error note, never falsely `spoken`. An operator can
retry with `npx convex run ai:moderate '{"messageId":"MESSAGE_ID"}'` after fixing
configuration or resuming a room. Do not expose this internal action directly
as an unauthenticated client retry endpoint.

Previously spoken audio is reused for the exact confirmed text, stock voice,
model, API version and format within the most recent 100 room messages. Rehearse
three or four demo sentences once to populate that cache. Cached playback still
requires a fresh child confirmation and moderation pass; an unavailable Claude
moderation call blocks speech even if audio is cached. There is no offline
moderation bypass. Resetting demo messages clears the cache references; rehearse
after a reset. Seed reset is destructive and should be coordinated with A.

The existing app remains a synthetic demo without authenticated ownership
checks; IDs alone do not establish user identity. This work does not make it
ready to host real children. A hard action termination may need an operator to
clear a stuck speech claim before rerunning moderation.

## Verify

From `app/`:

```sh
npm test
npm run typecheck:backend
npm run lint
npm run build
```

Tests use `convex-test` with mocked provider responses. They cover confirmation,
moderation failure, WAV persistence, voice-specific caching, rejection races,
Pause during TTS, failed TTS and preserving parent approvals. Live checkpoint:
two browser windows, symbols -> Claude draft -> confirm -> Cartesia audio on the
other window, followed by rejection, an unsafe test line, and parent Pause.

Provider references:
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- https://docs.cartesia.ai/api-reference/tts/bytes
- https://docs.cartesia.ai/use-the-api/api-conventions

## Frontend integration status

Latest main includes Person D's parent screens; Person C's `KidView.tsx` is still
an explicit placeholder. The development-only `voice-check.html` entry and
`src/dev/VoiceCheck.tsx` provide a separate manual two-client test harness,
without replacing that screen. Start Vite and open the page with `room` and
`child` query parameters from `diagnostics:createSmokeRoom`. Enable audio on
both clients before sending. Use only synthetic operator test records.

Two browser clients completed the live flow on October 24, 2026:
- Both received Claude drafts before confirmation; nothing played at draft time.
- Maya confirmed; Leo's browser reached `playing`, then `ended`.
- Leo confirmed a reply using Parker; Maya's browser reached `playing`.
- Pause from Leo stopped Maya's active audio, changed both screens to paused,
  and disabled Send/Replay. Resume re-enabled interaction.
- A fresh draft was rejected; both clients showed `rejected` and the backend
  confirmed that message had no audio storage ID.

Testing caught a WebKit autoplay failure in the original media-element player.
`src/audio/useVoicePlayback.ts` now unlocks an AudioContext on an explicit
Enable audio click and plays decoded WAV buffers through it. Pause cancels
pending downloads/decodes and stops the active source. Person C can reuse this
hook; the actual kid screen is still a placeholder, so this verifies the
separate two-browser harness rather than C's finished UI. The two clients ran
in the same in-app browser on one machine; physical two-device listening still
needs a demo rehearsal. Live parent intake now replaces the scripted chat; see the intake section below.


## Live parent intake

Open `/parent?parent=maya&tab=intake` (or another synthetic seeded parent).
The frontend calls public `ai.intakeTurn({ parentId, message, requestId })`.
Claude Sonnet asks short follow-ups and returns `{ reply, profile }`, with
`profile: null` until ready. After at most three successful parent answers it
must produce a reviewable profile, using “Not provided” for missing details.

The optional `parents.intake` object is the only application-schema addition.
It stores the component thread ID, draft, status, monotonic revision, request
lease and retry metadata. Conversation history is stored in the mounted
`@convex-dev/agent` component, not a new application messages table. Existing
parent rows remain valid. `intake.get` reloads durable conversation and draft
state. `intake.restart` clears the conversation/draft and deletes the old thread,
while leaving the approved child profile in place.

Drafts do not change `children`. The review form permits parent edits, and only
`intake.approve({ parentId, revision, profile })` updates the child profile and
stores the approved transcript in `parents.intakeTranscript`. Name, age,
voice ID, and symbol set are preserved. Interaction style is appended to the
existing `communicationStyle` string to preserve the shared child schema.
Matching reads the approved child fields; already-generated match reasons are
not automatically regenerated. Run `ai:proposeMatches` to refresh unapproved
suggestions after a profile change.

Requests are serialized with a 90-second lease; provider calls time out after
45 seconds. Completed request IDs are idempotent, and a failed request reuses
the same saved parent prompt on retry. Late results cannot overwrite a newer
request token. Revisions remain monotonic across restarts, preventing an old
browser from approving a previous draft. The chat limits message length and
rejects common contact details before persistence/provider calls; the prompt
never solicits surnames, school names, addresses or diagnoses. These checks are
limited safeguards; all demo details must remain synthetic. The app still uses
the team's existing parent-ID demo contract, not authenticated ownership.

Verification: a live two-answer conversation produced a grounded profile. In the
parent browser, editing interests, approving, and refreshing preserved the edits
and conversation. Before approval, the child still had its original profile.
Unit tests cover draft isolation, approval, preserved identity/voice, stale
revisions/tokens, retries, malformed output and contact details. Both string
messages and the SDK's text-block arrays are supported when reading history.

## Profile entry page

The `/` route now offers all five synthetic child screens and a parent login.
Select a child and enter the case-sensitive shared demo password `Parent` to
open that parent's screen. Direct `/parent` links use the same gate, including
intake links. The selected parent stays unlocked in that tab's session storage;
"Lock and switch profile" clears it and returns to `/`.

This is a frontend demo gate, not authentication or authorization for Convex
queries/mutations. Do not rely on it to protect real family data. No password
is saved in browser storage or sent in a URL.

Verified in browser: wrong password rejected, direct parent link gated, correct
password opens the selected parent/tab, locking revokes access, and child links
open without a password. Production build and lint pass.
