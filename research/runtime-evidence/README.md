# Runtime evidence

Runtime claims require a sanitized record containing source SHA, command, environment,
start/end time, exit code, pass/fail/skip counts, log or artifact path, artifact hash and
known gaps. HTTP 200, compilation, CI success and a ready process are different evidence
levels and must not be substituted for an authenticated task-level end-to-end result.
