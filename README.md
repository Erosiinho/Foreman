# Foreman 🛠️

A web interface for managing tasks across GitHub projects, with automatic execution via Claude Code
and delivery as Pull Requests.

## How it works

1. `POST /tasks` creates a GitHub issue (`todo` label) on the target repo.
2. GitHub fires a webhook back to `foreman-server` (`issues` event, `opened`/`labeled`).
3. The webhook handler verifies the signature and pushes a job onto a Redis/BullMQ queue.
4. `foreman-worker` picks up the job: checks out a `task/<id>-<slug>` branch in the project's working
   copy, runs `claude -p "<description>" --output-format stream-json --dangerously-skip-permissions`,
   commits, pushes, and opens a PR via `gh pr create`.
5. The issue's label tracks progress: `todo` → `in-progress` → `done` (or `paused`/`failed`/`cancelled`).
6. On `done`/`failed`, a Telegram notification goes out if configured (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`).

Manually labeling an issue `todo` directly on GitHub triggers the same flow — the API call isn't the
trigger, the webhook is.

**Pause/resume/cancel**: pausing sends the worker's `claude` process a clean abort over a Redis
pub/sub channel (`control:<owner>/<repo>`); the session_id (known as soon as the run starts, via
streamed JSON events) is saved as an issue comment, and resuming does `claude --resume <id>` on the
same branch. Cancelling aborts the run, discards whatever was uncommitted, and deletes the task
branch. A `RepoLock` caps each repo at one active-or-paused task at a time (the working copy is
shared, no worktree), while different repos run in parallel up to `WORKER_CONCURRENCY`. A run that
exceeds `RUN_TIMEOUT_MINUTES` (default 45) is killed and marked `failed`.

**Per-project settings**: drop an optional `.foreman.json` at the root of a project repo (not in
Foreman itself — see "Per-project settings" below) to customize how it runs.

**Task history & diffs**: the per-project view splits tasks into "Active" and "History" once they're
`done`/`failed`/`cancelled`. A `done` task's row has a "View diff" toggle — it loads the PR's changed
files (via the same `PR: <url>` comment used to resolve the PR) and renders per-file +/− stats with
an expandable patch view, so you can sanity-check a change before merging without leaving Foreman.

## Tech stack

| Layer | Choice |
|---|---|
| Server | Node.js, Express 5, BullMQ (Redis-backed queue), Octokit |
| Worker | Node.js, BullMQ, Octokit, `git`/`gh`/`claude` CLIs |
| Client | Vue 3, TypeScript, Tailwind CSS 4, Vite, Vue Router |
| Testing | Vitest (+ Supertest on the server) |
| Infra | Docker Compose (Redis for local dev), Dockerfiles for server and worker |

## Architecture

```
Foreman/
├── server/          # foreman-api — REST endpoints + GitHub webhook receiver + queue producer
│   └── src/
│       ├── github/       # IGitHub abstraction wrapping Octokit
│       ├── queue/        # BullMQ producer + Redis pub/sub control channel
│       ├── repositories/ # GitHub Issues as the task "database" (labels = status)
│       ├── services/     # task domain logic
│       └── http/         # Express controllers/routes/middleware/webhook (REST)
├── worker/           # foreman-worker — consumes the queue, runs Claude Code, opens the PR
│   └── src/
│       ├── github/       # minimal label/comment client (no shared package with server)
│       ├── lib/           # git/gh/claude CLI wrappers + telegram notifier + project-config/setup
│       ├── queue/         # ControlBus (pause/cancel pub/sub) + RepoLock (per-repo mutex)
│       └── jobs/          # run-task.processor.ts — checkout/setup/claude/commit/push/PR, plus pause/resume/cancel/timeout
└── client/           # foreman-client — dashboard: projects, task history, diffs, create/pause/resume/cancel
    └── src/
        ├── api/           # fetch wrapper for foreman-server's REST API
        ├── composables/   # usePolling — status refresh, no websocket infra
        ├── components/    # ProjectCard, TaskRow, TaskDiffPanel, TaskCreateForm, StatusLamp
        └── views/         # DashboardView (all projects), ProjectView (active + history task lists)
```

No database: GitHub Issues is the source of truth (status = label), and a task's Claude Code
`session_id` (needed for `--resume`) is stored as a hidden HTML comment on the issue.

## REST API

| Endpoint | Purpose |
|---|---|
| `GET /projects` | List repos visible to `GITHUB_TOKEN`, with task counts per status |
| `POST /tasks` | Create a task (`{ owner, repo, title, description }`) — opens a GitHub issue |
| `GET /tasks?owner=&repo=` | List tasks for a repo |
| `POST /tasks/:owner/:repo/:number/pause` | Publish a pause request on the Redis control channel |
| `POST /tasks/:owner/:repo/:number/resume` | Re-enqueue a run for that issue |
| `POST /tasks/:owner/:repo/:number/cancel` | Publish a cancel request on the Redis control channel |
| `GET /tasks/:owner/:repo/:number/diff` | Changed-files summary for a task's PR (404 until one exists) |
| `POST /webhooks/github` | GitHub webhook receiver (HMAC-verified) — the actual queue trigger |

Pause/resume/cancel are fully wired end-to-end: the API publishes the request, the worker acts on it
(see "How it works" above).

## Per-project settings

Drop a `.foreman.json` at the root of a project **repo itself** (not in Foreman) to customize how
tasks run there — no settings UI, no separate storage: it's a versioned file, editable via
code-server like any other:

```json
{
  "setup": "npm install",
  "timeoutMinutes": 60,
  "env": { "NODE_ENV": "test" }
}
```

All fields are optional. `setup` is a shell command that runs once before Claude Code starts (not
re-run on resume). `timeoutMinutes` overrides `RUN_TIMEOUT_MINUTES` for that repo. `env` is merged
into the environment `claude` runs in. The worker reads this file **after** checking out the task
branch, so a task that edits its own `.foreman.json` affects its own run.

## Getting started

```bash
# 1. Infra (Redis)
cp .env.example .env
docker compose up -d

# 2. Server
cd server
npm install
cp .env.example .env   # fill in GITHUB_TOKEN + GITHUB_WEBHOOK_SECRET
npm run test
npm run dev

# 3. Worker
cd ../worker
npm install
cp .env.example .env   # fill in GITHUB_TOKEN, GH_TOKEN, PROJECTS_ROOT; TELEGRAM_* optional
npm run test
npm run dev

# 4. Client (dashboard)
cd ../client
npm install
cp .env.example .env   # VITE_API_URL, defaults to http://localhost:3000
npm run dev
```

`claude` and `gh` must be installed **and already authenticated** on your machine for `worker` to run
locally outside Docker (the worker Dockerfile installs both — see `worker/Dockerfile`). Claude Code
auth uses the Pro/Max subscription, not an API key: run `claude` once and complete the browser login
(`/login` if you're not prompted automatically) before starting the worker — there's no `ANTHROPIC_API_KEY`
env var to set. In Docker, this is a one-time interactive step per container, with the resulting
session persisted on a volume so it survives restarts.

### Wiring up the GitHub webhook

On the target repo: **Settings → Webhooks → Add webhook**
- Payload URL: `https://<your-foreman-server-host>/webhooks/github`
- Content type: `application/json`
- Secret: same value as `GITHUB_WEBHOOK_SECRET` in `server/.env`
- Events: just the **Issues** event

### Manual end-to-end smoke test

Against a disposable test repo, with `server` and `worker` both running:

```bash
curl -X POST localhost:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"owner":"<you>","repo":"<test-repo>","title":"Add a line to README","description":"Add a one-line note to the top of README.md"}'
```

Confirm the issue label progresses `todo` → `in-progress` → `done` and a PR appears on the repo.

## Status

Feature-complete for personal use: project dashboard, task creation, pause/resume/cancel, task
history, in-app diffs, Telegram notifications, and per-project settings via `.foreman.json`. Some
things are deliberate simplifications rather than gaps — e.g. no settings UI, since `.foreman.json`
covers it.
