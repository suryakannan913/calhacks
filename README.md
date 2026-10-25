# LittleHello

*A little hello for a big friendship.*

LittleHello is a parent-mediated friendship prototype for children ages 8–12
who are minimally verbal or use augmentative and alternative communication (AAC).
Children choose from 250 pictograms, review a Claude-generated sentence, and
confirm or reject it. After moderation, Cartesia speaks the accepted message
on their friend's device. Voice is the conversation channel, not a narrated demo.
Both children participate; replies come from the other child, not a chatbot.

## How we use Convex
Convex reactive queries keep child rooms, parent transcripts, and match screens live.
Mutations enforce child confirmation and mutual parent approval before progressing.
Scheduled actions coordinate AI and speech; file storage holds audio; components support intake and rate limits.
See [the hackathon log](hackathon.md) for source evidence and commit history.

## Setup

Requires Node.js 22+, npm, a Convex project, and Anthropic/Cartesia API access.

1. Install and connect the backend:
   ```bash
   cd app
   npm ci
   npx convex dev
   ```
   Complete the Convex setup and leave this process running. The CLI creates
   the local frontend configuration pointing to the selected deployment.
2. In that deployment's Convex dashboard, set `ANTHROPIC_API_KEY` and
   `CARTESIA_API_KEY`. Keep credentials server-side; never commit them or expose
   them through browser variables.
3. In a second terminal, from `app`, **only for a fresh, disposable deployment**,
   initialize fictional profiles:
   ```bash
   npx convex run seed:reset
   ```
   This command deletes existing application records. Skip it for a populated project.
4. In that second terminal, run `npm run dev`. Open the displayed URL,
   choose Maya on one client and Leo on another, and complete each audio-start
   gesture. Select pictures, send, and confirm the draft. A parent can monitor
   the transcript and pause the room.

For Vercel, set Root Directory to `app` and configure `VITE_CONVEX_URL` for the
intended backend. Build/routing settings are in [app/vercel.json](app/vercel.json).
Provider credentials stay in Convex. Frontend deployment does not automatically
publish backend changes under this configuration.

## What Cartesia contributes

- **Speech generation:** Cartesia's `/tts/bytes` endpoint with `sonic-3.6`
  generates WAV audio: 16-bit PCM at 44.1 kHz. Claude supplies wording and
  moderation; Cartesia supplies the spoken output.
- **Consistent identity:** five fictional profiles use distinct stock voices:
  Skylar, Parker, Corey, Ella, and Daniel. No real person's voice is cloned.
- **Conversation playback:** Convex stores generated audio; the receiving browser
  plays it through the Web Audio API. Gesture unlocking, replay, and pause-aware
  cancellation address browser playback behavior.
- **Reuse and failure handling:** exact text/voice/model/format matches can reuse
  recent room audio. Reuse still requires confirmation and moderation. Provider
  timeouts, invalid WAV responses, stale results, and paused rooms cannot commit
  through the guarded speech-completion path.

Implementation: [providers.ts](app/convex/providers.ts),
[voice.ts](app/convex/voice.ts), [messages.ts](app/convex/messages.ts), and
[useVoicePlayback.ts](app/src/audio/useVoicePlayback.ts).
