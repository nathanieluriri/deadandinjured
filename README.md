# Dead & Injured

A code-breaking game: each player hides four different digits and guesses the other's. Dead is a right digit in the right place, injured a right digit in the wrong place.

- The root of this repo is the original Streamlit version (`app.py`, `pages/`), backed by MongoDB.
- [`web/`](web/) is the live multiplayer 3D version that runs on Cloudflare (Workers, Durable Objects and D1): https://dead-and-injured.uririnathaniel.workers.dev
