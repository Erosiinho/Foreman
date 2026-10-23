# Foreman 🛠️

A web interface for managing tasks across GitHub projects, with automatic execution via Claude Code
and delivery as Pull Requests.

## How it works

1. `POST /tasks` creates a GitHub issue (`todo` label) on the target repo.
2. `foreman-server` polls your repos on an interval (`POLL_INTERVAL_SECONDS`, default 30s) for
   issues carrying the `todo` label and pushes a job onto a Redis/BullMQ queue for each one found.
3. `foreman-worker` picks up the job: checks out a `task/<id>-<slug>` branch in the project's working
   copy, runs `claude -p "<description>" --output-format stream-json --dangerously-skip-permissions`,
   commits, pushes, and opens a PR via `gh pr create`.
4. The issue's label tracks progress: `todo` → `in-progress` → `done` (or `paused`/`failed`/`cancelled`).
5. On `done`/`failed`, a Telegram notification goes out if configured (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`).

Manually labeling an issue `todo` directly on GitHub triggers the same flow — the API call isn't the
trigger, the next poll tick is. Polling (rather than a GitHub webhook) is a deliberate choice: it
means `foreman-server` never needs to be reachable from the public internet — it only makes outbound
calls to GitHub's API, so it can stay local/VPN-only.

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
├── server/          # foreman-api — REST endpoints + GitHub issue poller + queue producer
│   └── src/
│       ├── github/       # IGitHub abstraction wrapping Octokit
│       ├── queue/        # BullMQ producer + Redis pub/sub control channel + IssuePoller
│       ├── repositories/ # GitHub Issues as the task "database" (labels = status)
│       ├── services/     # task domain logic
│       └── http/         # Express controllers/routes/middleware (REST)
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
cp .env.example .env   # fill in GITHUB_TOKEN
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
env var to set. In Docker, there's no login inside the container: run `claude setup-token` once on your
machine and set the resulting token as `CLAUDE_CODE_OAUTH_TOKEN` (valid ~1 year, then regenerate it).
Note the worker's agent runs with `--dangerously-skip-permissions` and can read its own environment,
so give Foreman its own token rather than one shared with other apps.

### Manual end-to-end smoke test

Against a disposable test repo, with `server` and `worker` both running:

```bash
curl -X POST localhost:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"owner":"<you>","repo":"<test-repo>","title":"Add a line to README","description":"Add a one-line note to the top of README.md"}'
```

Confirm the issue label progresses `todo` → `in-progress` → `done` and a PR appears on the repo
(the `todo` → `in-progress` step happens within `POLL_INTERVAL_SECONDS` of creation, not instantly).

## Status

Feature-complete for personal use: project dashboard, task creation, pause/resume/cancel, task
history, in-app diffs, Telegram notifications, and per-project settings via `.foreman.json`. Some
things are deliberate simplifications rather than gaps — e.g. no settings UI, since `.foreman.json`
covers it.
