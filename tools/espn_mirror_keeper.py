# -*- coding: utf-8 -*-
"""AstroSky ESPN mirror keeper — replacement for the broken GitHub schedule.

This file is versioned here for review; the copy that actually runs lives in the
Hermes profile (scripts/espn_mirror_keeper.py) and is invoked every 15 minutes by
the Hermes scheduler. Keep the two in sync when editing.

WHY THIS EXISTS
---------------
`.github/workflows/sport-mirror.yml` is meant to refresh the ESPN copy in the
`data` branch every half hour (48x/day). Two problems, both measured:

  * cron-job.org, the external trigger described in README, is dead:
    only 5 of 81 historical runs were `workflow_dispatch`.
  * GitHub's own `schedule` does not honour the cron. Measured over 17.3 days:
    3.4 runs/day instead of 48 (7.1% of intended), average gap 7.2 h,
    worst gap 11.9 h. Runs land at minutes like :19, :25, :37, :59 instead of
    the configured :07/:37 — the repository is neither a fork nor archived, so
    this is schedule throttling on GitHub's side.

Consequence: the `data` branch goes stale for hours, and Russian visitors (who
cannot reach ESPN directly) see the warning "свежее получить не удалось".

WHAT IT DOES
------------
Runs every 15 minutes from the Hermes scheduler. Reads the age of the last
commit on the `data` branch and, when it is older than STALE_MIN, dispatches
the mirror workflow through the already-authenticated `gh` CLI.

  * Silent while the copy is fresh — watchdog pattern: no output, no message.
  * One line when it dispatches.
  * One line when the copy stays stale long after a dispatch (a broken trigger
    must not pass unnoticed).
  * Never raises: any error is printed and the process still exits 0, so the
    scheduler never sees a crash.

The workflow itself skips a rebuild when the copy is younger than 20 minutes,
so an extra dispatch is harmless.

Auth: uses the `gh` CLI session (scopes `repo`, `workflow`) — no PAT needed.
Configurable via env: ASTROSKY_DATA_STALE_MIN (default 30),
ASTROSKY_DATA_ALERT_MIN (default 180).
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

REPO = os.environ.get("ASTROSKY_REPO", "vsemvamdam/astrocartography")
BRANCH = os.environ.get("ASTROSKY_DATA_BRANCH", "data")
WORKFLOW = os.environ.get("ASTROSKY_MIRROR_WORKFLOW", "sport-mirror.yml")
REF = os.environ.get("ASTROSKY_MIRROR_REF", "main")
STALE_MIN = int(os.environ.get("ASTROSKY_DATA_STALE_MIN", "30"))
ALERT_MIN = int(os.environ.get("ASTROSKY_DATA_ALERT_MIN", "180"))

# gh on Windows may not be on PATH for a non-shell subprocess
GH = os.environ.get("ASTROSKY_GH") or shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"

# `gh workflow run` shells out to git, and fails with "unable to find git
# executable in PATH" when git is not on PATH — measured on this host. Under a
# bare scheduler environment that silently disables the trigger, so make sure
# git's directory is on PATH before calling gh.
_GIT = shutil.which("git") or next(
    (p for p in (r"C:\Program Files\Git\cmd\git.exe",
                 r"C:\Program Files\Git\bin\git.exe") if os.path.exists(p)),
    None,
)
if _GIT:
    _gitdir = os.path.dirname(_GIT)
    if _gitdir.lower() not in os.environ.get("PATH", "").lower():
        os.environ["PATH"] = _gitdir + os.pathsep + os.environ.get("PATH", "")


def run(args, timeout=60):
    """Run gh; return (rc, stdout, stderr). Never raises."""
    try:
        p = subprocess.run(
            [GH] + args,
            capture_output=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
    except Exception as e:  # noqa: BLE001 - the keeper must never die
        return 1, "", "failed to run gh: %s" % e


def data_age_min():
    """Age in minutes of the last commit on the data branch, or None."""
    rc, out, err = run([
        "api", "repos/%s/commits/%s" % (REPO, BRANCH),
        "--jq", ".commit.committer.date",
    ])
    if rc != 0 or not out:
        return None, err or "empty response"
    try:
        # e.g. 2026-11-26T11:45:42Z
        dt = datetime.strptime(out, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None, "unparsable date: %r" % out
    return (datetime.now(timezone.utc) - dt).total_seconds() / 60.0, out


def dispatch():
    """Start the mirror workflow.

    Uses the REST API through `gh api`, NOT `gh workflow run`. `gh workflow run`
    resolves the repository from the current directory and shells out to git, so
    under the scheduler -- which runs this script from a directory that is not a
    git repository -- it failed with:

        failed to run git: fatal: not a git repository (or any of the parent
        directories): .git

    That happened on every 15-minute tick for five hours while the job still
    reported success, because the failure only reached stdout. `gh api` takes the
    repository in the path, so it needs neither a working directory nor git.
    """
    rc, out, err = run([
        "api", "-X", "POST",
        "repos/%s/actions/workflows/%s/dispatches" % (REPO, WORKFLOW),
        "-f", "ref=%s" % REF,
    ], timeout=60)
    return rc == 0, (err or out)


def last_dispatch_ok():
    """Did the most recent run of the mirror workflow succeed?

    `-R REPO` is required here for the same reason: without it gh looks for the
    repository in the current directory.
    """
    rc, out, _ = run([
        "run", "list", "-R", REPO, "--workflow", WORKFLOW, "--limit", "1",
        "--json", "createdAt,status,conclusion",
    ])
    if rc != 0 or not out:
        return None
    try:
        r = json.loads(out)[0]
    except (ValueError, IndexError, KeyError):
        return None
    return r.get("conclusion") or r.get("status")


# Workflow run states that mean "still working, not a failure yet"
RUNNING_STATES = {"queued", "in_progress", "requested", "waiting", "pending"}


def main():
    age, detail = data_age_min()
    if age is None:
        print("ESPN keeper: cannot read the data branch age (%s)" % detail)
        return 1

    if age < STALE_MIN:
        return 0  # fresh: stay silent

    ok, why = dispatch()
    if ok:
        print("ESPN keeper: data was %.0f min old -- mirror dispatched" % age)
    else:
        print("ESPN keeper: data is %.0f min old and the dispatch FAILED: %s" % (age, why))

    # Accepting a dispatch is not success, and this branch must be reachable either way.
    # GitHub can queue or throttle the run, and sport-mirror.yml turns an ESPN outage into
    # a `::warning::` and publishes nothing. Before this was fixed the function returned 0
    # on "dispatched" and never reached here, so a copy could stay stale for days while
    # every 15-minute tick reported success -- the same silent failure this file exists to
    # kill. The age is the ground truth; the dispatch code only says we asked.
    if age < ALERT_MIN:
        return 2 if not ok else 0

    last = last_dispatch_ok()
    if ok and last in RUNNING_STATES:
        # We just asked and the run has not finished: give it time rather than cry wolf.
        print("ESPN keeper: %.0f min stale, run is %s -- waiting" % (age, last))
        return 0

    # A finished run that did not refresh the copy is exactly the silent case: the run
    # shows green, the workflow published nothing, and only the age reveals it.
    print("ESPN keeper: still stale after %.0f min (last run: %s)" % (age, last))
    return 2 if not ok else 4


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 - report, never die silently
        print("ESPN keeper CRASH: %s" % e)
        sys.exit(3)


