# Benchmark evidence

A benchmark run is valid only when its manifest fixes the model, endpoint, Harness
commit, task set, prompts, tools, permissions, sandbox, budgets, timeout, retry policy,
temperature and environment. Store sanitized trajectories and failure classifications
alongside aggregate metrics.

Required metrics include task success, cost, input/output/reasoning tokens, cache hit,
time to first token, total latency, tool failures, retries, human interventions,
unsafe-action attempts and reproducibility variance. Results describe the complete
model-plus-Harness configuration, never the model alone.
