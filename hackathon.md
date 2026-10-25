# Hackathon log

- **Project:** LittleHello
- **Event:** Cal Hacks 13.0
- **What it does:** A parent-mediated AAC friendship prototype with child-confirmed pictogram messages and synthesized speech.
- **Live app:** not deployed
- **Repo:** https://github.com/suryakannan913/calhacks
- **Frontend:** Vercel
- **Convex deployment:** not deployed
- **Components:** @convex-dev/rate-limiter, @convex-dev/agent
- **Convex features:** schema, indexes, queries, mutations, actions, scheduled functions, file storage, realtime useQuery, paginated queries
- **Auth:** none
- **AI models:** claude-haiku-5-5, claude-sonnet-5-5, sonic-3.6
- **Started:** 2026-10-25T02:27:27Z
- **Last updated:** 2026-10-25T10:27:29Z

Deployment URLs are not recorded in tracked files; Vercel configuration is in `app/vercel.json`. Demo profiles have no authentication.

## How we use Convex

- **Shared hangout:** child screens update messages and pause state live without refresh through `useQuery`; `app/src/kid/KidView.tsx`, `app/convex/rooms.ts`.
- **Parent monitor:** transcript and room state update live without refresh; history uses paginated queries; `app/src/parent/Monitor.tsx`, `app/convex/messages.ts`.
- **Mutual approval:** mutations open a room after both parents approve; match screens subscribe live; `app/convex/matches.ts`, `app/src/parent/Matches.tsx`.
- **Confirmed speech:** scheduled actions expand, moderate and synthesize; file storage holds audio; `app/convex/messages.ts`, `app/convex/voice.ts`.
- **Parent intake:** Agent component threads persist conversation; mutations save only approved profiles; `app/convex/intake.ts`, `app/convex/convex.config.ts`.
- **Traffic limits:** rate-limiter component bounds sends, confirmations and intake; `app/convex/rateLimit.ts`, `app/convex/convex.config.ts`.

## Log

Dates are UTC; paths are relative to the repository root. Routine merges, duplicate snapshots and housekeeping omitted.

- 2026-10-25T02:27:27Z `281e936` Repository created: README.md.
- 2026-10-25T02:55:45Z `3366709` Backend/schema scaffold: app/convex/schema.ts.
- 2026-10-25T03:14:47Z `eba1955` Register rate limiter: app/convex/convex.config.ts, app/convex/rateLimit.ts.
- 2026-10-25T03:53:48Z `173767e` Parent screens: app/src/parent/Monitor.tsx.
- 2026-10-25T04:33:01Z `80dad1d` Guarded AI/voice pipeline and matching: app/convex/ai.ts, app/convex/voice.ts.
- 2026-10-25T04:40:07Z `6184ea0` Browser audio unlock: app/src/audio/useVoicePlayback.ts.
- 2026-10-25T04:46:03Z `c3e0102` Kid UI and pictograms: app/src/kid/KidView.tsx.
- 2026-10-25T04:47:01Z `dd5740a` Shared room audio player: app/src/kid/hooks/useRoomAudio.ts.
- 2026-10-25T04:54:25Z `fe3b415` 250-word backend vocabulary: app/convex/symbols.ts.
- 2026-10-25T07:47:36Z `b905980` Durable intake and profile approval: app/convex/intake.ts, app/convex/intakeAgent.ts.
- 2026-10-25T07:57:34Z `be82c2d` Demo profile/password entry: app/src/login/Login.tsx.
- 2026-10-25T08:48:16Z `c69864d` Chat redesign: app/src/kid/components/Conversation.tsx.
- 2026-10-25T09:11:04Z `0f66c9d` Voices, evaluation, history cleanup: app/convex/evaluation.ts, app/convex/retention.ts.
- 2026-10-25T09:14:29Z `79dbfca` Connect new repository history: no file changes (history-only merge).
- 2026-10-25T09:19:16Z `dae4c44` Vercel build/routing config: app/vercel.json.
- 2026-10-25T09:44:40Z `f80a5c9` Message bubble styling: app/src/kid/kid.css.
- 2026-10-25T09:58:51Z `8c6bc93` Overview and deployment instructions: README.md.
- 2026-10-25T10:27:29Z `b14003f` Partner identity from match, not history: app/convex/rooms.ts, app/src/kid/KidView.tsx.
