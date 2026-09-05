# Tests

`./run.sh` (or `python3 validate_skills.py`) checks every skill's frontmatter,
naming, cross-references, and install state — everything derivable from the
files on disk. Exit code is non-zero on any failure, so it is CI-safe.

It cannot check whether a skill actually fires when it should; that requires a
live agent session. See [MANUAL-CHECKS.md](MANUAL-CHECKS.md) for that half.

Run after any change to `skills/`:

```bash
./run.sh
```

Pass `--project /path/to/repo` to also check that project's installed symlinks resolve back into this repo:

```bash
python3 validate_skills.py --project /path/to/repo
```
