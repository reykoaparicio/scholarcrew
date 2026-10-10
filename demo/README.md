# Demo videos

Narrated screen recordings of ScholarCrew, made with the vendored [ndemo](../.claude/skills/ndemo) skill. In Claude Code, ask for a demo ("create a demo video of the essay studio") and it uses the skill. You can also run the CLI yourself, as below.

## scholarcrew-tour

A three-minute tour as the seeded student Jordan: This Week and the gap, asking the crew a live question, scholarships, a scholarship's rules and sources, Essay Studio with Quill's comments, the Story Bank, colleges, compare offers, test prep, service hours, family sharing, helper links, memory, and pricing. The finished video is `scholarcrew-tour/scholarcrew-tour.mp4`, with subtitles in `scholarcrew-tour.srt`.

### Render it again

1. Set up the app as in the root README, then serve a production build at `http://localhost:3100` with the worker running. Record against a production build: the dev server recompiles idle pages mid-recording, which freezes the video. Production needs an email provider key to start, so give it a placeholder; the demo sends no email.

   ```bash
   pnpm db:seed
   APP_URL=http://localhost:3100 pnpm --filter @scholarcrew/web build
   (cd apps/web && APP_URL=http://localhost:3100 RESEND_API_KEY=re_local_demo_no_delivery EMAIL_FROM=demo@example.test \
     node --env-file-if-exists=../../.env node_modules/next/dist/bin/next start -p 3100) &
   pnpm --filter @scholarcrew/worker dev &
   ```

2. Build ndemo once and check its dependencies (Node 20+, ffmpeg, Playwright's Chromium):

   ```bash
   (cd .claude/skills/ndemo && npm install && npm run build && npx playwright install chromium)
   .claude/skills/ndemo/ndemo doctor
   ```

3. Arm the demo's sign-in link and render, from the repo root:

   ```bash
   demo/scholarcrew-tour/prepare.sh
   .claude/skills/ndemo/ndemo render "$PWD/demo/scholarcrew-tour/scholarcrew-tour.yaml"
   ```

`ndemo play <playbook>` replays the tour in a visible browser without recording, and `--segment <id>` replays one step.

### How it signs in and stays repeatable

ScholarCrew signs in with emailed links, so `prepare.sh` writes a local sign-in link for `jordan@example.com` with a fixed token into the dev database. The playbook opens that link, and every setup run re-arms it for the next run. The same script restores Jordan's three award letters (which `pnpm db:seed` doesn't create) and removes chats from earlier runs. It only touches the local dev database.

### Narration voice

The tour narrates with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), a free, open-source (Apache 2.0) neural voice that runs offline on your machine. The voice is `am_michael`, a US English male voice. Set it up once:

```bash
.claude/skills/ndemo/kokoro/setup.sh
```

This creates a Python 3.12 environment and downloads about 340 MB of model files into `.claude/skills/ndemo/kokoro/` (git ignores both). To try another voice, change `tts.voice` in the playbook and render again. Other male voices are `am_fenrir`, `am_puck`, and `bm_george` (UK); `af_heart` is a female voice. Only narration whose text or voice changed is regenerated.

Other options: `provider: say` uses a macOS system voice (offline, more robotic), and `provider: openai` with `voice: alloy` uses OpenAI's voices (needs `OPENAI_API_KEY`, costs a few cents per render).
