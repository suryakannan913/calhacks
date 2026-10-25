# TapTalk

TapTalk is a parent-mediated AAC friendship prototype for children ages 8–12.
Children compose messages with pictograms, review AI-generated wording, and
confirm or reject each draft before it can be spoken aloud.

The app uses React, Vite, TypeScript, Convex, Claude, and Cartesia stock voices.
All demo profiles are fictional.

## Deployment

Import this repository into Vercel with **Root Directory** set to `app`.
The build and single-page routing settings are in `app/vercel.json`.
Set `VITE_CONVEX_URL` in Vercel to the URL of the intended Convex deployment.
Anthropic and Cartesia API keys belong in that Convex deployment's environment
settings, not in the frontend or repository.

See [demo readiness and evaluation](app/DEMO_READINESS.md) for verified results
and remaining limitations. The shared parent password is a demo gate, not real
authentication or server-side authorization.
