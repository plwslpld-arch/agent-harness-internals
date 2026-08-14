# Upstream source update

Generated: 2026-08-14T02:50:59.908Z

> This report is mechanical evidence. Human review is required before merging.
> Source-bound documents marked stale: 9.

## acp-typescript-sdk

- Baseline: `e1054d0122e844cca9f1016a598a1da06f78ccef`
- Candidate: `01010146a731212fbbb677d6055e0b7bf183b288`
- Impact areas: `implementation`, `tests`
- Changed paths: 2

| Status | Path |
| --- | --- |
| M | `src/v2/acp.test.ts` |
| M | `src/v2/acp.ts` |

## claude-agent-sdk-typescript

- Baseline: `b5321a4b65ec1b034fea19f684e2d8db728875da`
- Candidate: `8716a39f83dd7506e6421199caface603d4941ab`
- Impact areas: none detected
- Changed paths: 0

| Status | Path |
| --- | --- |
| — | No path diff available |

## codex

- Baseline: `42bb50d5027fbad3431bdd56667bbee30700aad5`
- Candidate: `9d012ca4f54c5adc86e605a7bedbdd03ef63f516`
- Impact areas: `dependencies`, `documentation`, `implementation`, `tests`
- Changed paths: 291

| Status | Path |
| --- | --- |
| M | `codex-rs/Cargo.lock` |
| M | `codex-rs/analytics/src/accepted_lines.rs` |
| M | `codex-rs/analytics/src/analytics_client_tests.rs` |
| M | `codex-rs/analytics/src/client_tests.rs` |
| M | `codex-rs/analytics/src/events.rs` |
| M | `codex-rs/analytics/src/facts.rs` |
| M | `codex-rs/analytics/src/lib.rs` |
| M | `codex-rs/analytics/src/reducer.rs` |
| M | `codex-rs/app-server-protocol/schema/json/ServerNotification.json` |
| M | `codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.schemas.json` |
| M | `codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.v2.schemas.json` |
| M | `codex-rs/app-server-protocol/schema/json/v2/ModelListResponse.json` |
| A | `codex-rs/app-server-protocol/schema/json/v2/ThreadQueueChangedNotification.json` |
| A | `codex-rs/app-server-protocol/schema/json/v2/ThreadRevertedNotification.json` |
| M | `codex-rs/app-server-protocol/schema/precomputed/app-server-exports-experimental.json.zst` |
| M | `codex-rs/app-server-protocol/schema/precomputed/app-server-exports-stable.json.zst` |
| M | `codex-rs/app-server-protocol/schema/typescript/ServerNotification.ts` |
| M | `codex-rs/app-server-protocol/schema/typescript/ServerNotificationEnvelope.ts` |
| M | `codex-rs/app-server-protocol/schema/typescript/v2/ModelUpgradeInfo.ts` |
| A | `codex-rs/app-server-protocol/schema/typescript/v2/QueuedSubmission.ts` |
| A | `codex-rs/app-server-protocol/schema/typescript/v2/ThreadQueueChangedNotification.ts` |
| A | `codex-rs/app-server-protocol/schema/typescript/v2/ThreadRevertedNotification.ts` |
| M | `codex-rs/app-server-protocol/schema/typescript/v2/index.ts` |
| M | `codex-rs/app-server-protocol/src/protocol/common.rs` |
| M | `codex-rs/app-server-protocol/src/protocol/v2/model.rs` |
| M | `codex-rs/app-server-protocol/src/protocol/v2/thread.rs` |
| M | `codex-rs/app-server/README.md` |
| M | `codex-rs/app-server/src/config_manager_service_tests.rs` |
| M | `codex-rs/app-server/src/extensions.rs` |
| M | `codex-rs/app-server/src/external_agent_migration/processor.rs` |
| M | `codex-rs/app-server/src/in_process.rs` |
| M | `codex-rs/app-server/src/lib.rs` |
| M | `codex-rs/app-server/src/mcp_refresh.rs` |
| M | `codex-rs/app-server/src/message_processor.rs` |
| M | `codex-rs/app-server/src/message_processor_tracing_tests.rs` |
| M | `codex-rs/app-server/src/models.rs` |
| M | `codex-rs/app-server/src/request_processors.rs` |
| M | `codex-rs/app-server/src/request_processors/account_processor.rs` |
| M | `codex-rs/app-server/src/request_processors/mcp_processor.rs` |
| M | `codex-rs/app-server/src/request_processors/plugins.rs` |
| M | `codex-rs/app-server/src/request_processors/thread_lifecycle.rs` |
| M | `codex-rs/app-server/src/request_processors/thread_processor.rs` |
| A | `codex-rs/app-server/src/request_processors/thread_queue_processor.rs` |
| M | `codex-rs/app-server/src/request_processors/turn_processor.rs` |
| M | `codex-rs/app-server/src/thread_state.rs` |
| M | `codex-rs/app-server/tests/suite/v2/current_time.rs` |
| M | `codex-rs/app-server/tests/suite/v2/executor_mcp.rs` |
| M | `codex-rs/app-server/tests/suite/v2/mod.rs` |
| M | `codex-rs/app-server/tests/suite/v2/model_auto_review.rs` |
| M | `codex-rs/app-server/tests/suite/v2/model_list.rs` |
| M | `codex-rs/app-server/tests/suite/v2/model_provider_capabilities_read.rs` |
| M | `codex-rs/app-server/tests/suite/v2/plugin_install.rs` |
| M | `codex-rs/app-server/tests/suite/v2/plugin_list.rs` |
| M | `codex-rs/app-server/tests/suite/v2/skills_list.rs` |
| A | `codex-rs/app-server/tests/suite/v2/thread_queue.rs` |
| A | `codex-rs/app-server/tests/suite/v2/thread_revert.rs` |
| M | `codex-rs/app-server/tests/suite/v2/thread_start.rs` |
| M | `codex-rs/app-server/tests/suite/v2/turn_start.rs` |
| M | `codex-rs/chatgpt/src/chatgpt_client.rs` |
| M | `codex-rs/chatgpt/src/connectors.rs` |
| M | `codex-rs/cli/src/debug_sandbox/cloud_config.rs` |
| M | `codex-rs/cli/src/doctor.rs` |
| M | `codex-rs/cli/src/login.rs` |
| M | `codex-rs/cli/src/main.rs` |
| M | `codex-rs/cli/src/marketplace_cmd.rs` |
| M | `codex-rs/cli/src/mcp_cmd.rs` |
| M | `codex-rs/cli/src/mcp_cmd/cloud_config.rs` |
| M | `codex-rs/cli/src/plugin_cmd.rs` |
| M | `codex-rs/cli/tests/login.rs` |
| M | `codex-rs/cloud-config/src/bundle_loader.rs` |
| M | `codex-rs/cloud-tasks/src/util.rs` |
| M | `codex-rs/codex-client/Cargo.toml` |
| M | `codex-rs/codex-client/src/lib.rs` |
| M | `codex-rs/codex-client/src/retry.rs` |
| M | `codex-rs/codex-mcp/src/connection_manager.rs` |
| M | `codex-rs/codex-mcp/src/connection_manager/startup.rs` |
| M | `codex-rs/codex-mcp/src/connection_manager_tests.rs` |
| M | `codex-rs/codex-mcp/src/plugin_config.rs` |
| M | `codex-rs/codex-mcp/src/plugin_config_tests.rs` |
| M | `codex-rs/codex-mcp/src/runtime.rs` |
| A | `codex-rs/config/src/bedrock_runtime_tests.rs` |
| M | `codex-rs/config/src/config_toml.rs` |
| M | `codex-rs/config/src/mcp_types.rs` |
| M | `codex-rs/config/src/mcp_types_tests.rs` |
| M | `codex-rs/core-plugins/src/discoverable_tests.rs` |
| M | `codex-rs/core-plugins/src/manager.rs` |
| M | `codex-rs/core-plugins/src/manager_tests.rs` |
| M | `codex-rs/core-plugins/src/test_support.rs` |
| M | `codex-rs/core/Cargo.toml` |
| M | `codex-rs/core/config.schema.json` |
| M | `codex-rs/core/src/agent/control/spawn.rs` |
| M | `codex-rs/core/src/agent/role_tests.rs` |
| M | `codex-rs/core/src/agents_md.rs` |
| M | `codex-rs/core/src/agents_md_tests.rs` |
| M | `codex-rs/core/src/codex_thread.rs` |
| M | `codex-rs/core/src/compact_remote_v2.rs` |
| M | `codex-rs/core/src/config/config_tests.rs` |
| M | `codex-rs/core/src/config/edit/document_helpers.rs` |
| M | `codex-rs/core/src/config/edit_tests.rs` |
| M | `codex-rs/core/src/config/mod.rs` |
| M | `codex-rs/core/src/config/permissions.rs` |
| M | `codex-rs/core/src/connectors.rs` |
| M | `codex-rs/core/src/connectors_tests.rs` |
| M | `codex-rs/core/src/context/current_time_reminder.rs` |
| M | `codex-rs/core/src/context/mod.rs` |
| M | `codex-rs/core/src/context/node_repl_review_evidence.rs` |
| M | `codex-rs/core/src/context/node_repl_review_evidence_tests.rs` |
| M | `codex-rs/core/src/context/world_state/environment.rs` |
| M | `codex-rs/core/src/environment_selection.rs` |
| M | `codex-rs/core/src/exec_tests.rs` |
| M | `codex-rs/core/src/guardian/prompt.rs` |
| M | `codex-rs/core/src/guardian/review.rs` |
| M | `codex-rs/core/src/guardian/review_session.rs` |
| M | `codex-rs/core/src/guardian/tests.rs` |
| M | `codex-rs/core/src/lib.rs` |
| M | `codex-rs/core/src/mcp_openai_file.rs` |
| M | `codex-rs/core/src/mcp_skill_dependencies.rs` |
| M | `codex-rs/core/src/mcp_tool_call.rs` |
| M | `codex-rs/core/src/mcp_tool_call_tests.rs` |
| M | `codex-rs/core/src/plugins/discoverable_tests.rs` |
| M | `codex-rs/core/src/plugins/mod.rs` |
| M | `codex-rs/core/src/plugins/test_support.rs` |
| M | `codex-rs/core/src/prompt_debug.rs` |
| M | `codex-rs/core/src/responses_metadata.rs` |
| M | `codex-rs/core/src/responses_retry.rs` |
| M | `codex-rs/core/src/session/environment.rs` |
| M | `codex-rs/core/src/session/mcp.rs` |
| M | `codex-rs/core/src/session/mcp_runtime.rs` |
| M | `codex-rs/core/src/session/mod.rs` |
| M | `codex-rs/core/src/session/session.rs` |
| M | `codex-rs/core/src/session/tests.rs` |
| M | `codex-rs/core/src/session/tests/guardian_tests.rs` |
| M | `codex-rs/core/src/session/thread_settings.rs` |
| M | `codex-rs/core/src/session/turn.rs` |
| M | `codex-rs/core/src/session/turn_context.rs` |
| M | `codex-rs/core/src/shell_snapshot.rs` |
| M | `codex-rs/core/src/tasks/lifecycle.rs` |
| M | `codex-rs/core/src/tasks/mod.rs` |
| M | `codex-rs/core/src/thread_manager.rs` |
| M | `codex-rs/core/src/tools/handlers/apply_patch.rs` |
| M | `codex-rs/core/src/tools/handlers/current_time.rs` |
| M | `codex-rs/core/src/tools/handlers/extension_tools.rs` |
| M | `codex-rs/core/src/tools/handlers/mcp.rs` |
| M | `codex-rs/core/src/tools/handlers/mod.rs` |
| M | `codex-rs/core/src/tools/handlers/request_plugin_install_tests.rs` |
| M | `codex-rs/core/src/tools/handlers/shell.rs` |
| M | `codex-rs/core/src/tools/handlers/shell/shell_command.rs` |
| M | `codex-rs/core/src/tools/handlers/shell_tests.rs` |
| M | `codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs` |
| M | `codex-rs/core/src/tools/handlers/view_image.rs` |
| M | `codex-rs/core/src/tools/handlers/wait_for_environment.rs` |
| M | `codex-rs/core/src/tools/lifecycle.rs` |
| M | `codex-rs/core/src/tools/network_approval.rs` |
| M | `codex-rs/core/src/tools/runtimes/apply_patch.rs` |
| M | `codex-rs/core/src/tools/runtimes/apply_patch_tests.rs` |
| M | `codex-rs/core/src/tools/runtimes/shell.rs` |
| M | `codex-rs/core/src/tools/runtimes/shell/unix_escalation.rs` |
| M | `codex-rs/core/src/tools/runtimes/shell_tests.rs` |
| M | `codex-rs/core/src/tools/runtimes/unified_exec.rs` |
| M | `codex-rs/core/src/tools/spec_plan_tests.rs` |
| M | `codex-rs/core/src/turn_metadata.rs` |
| M | `codex-rs/core/src/turn_metadata_tests.rs` |
| M | `codex-rs/core/tests/suite/code_mode.rs` |
| M | `codex-rs/core/tests/suite/compact_remote.rs` |
| M | `codex-rs/core/tests/suite/current_time_reminder.rs` |
| M | `codex-rs/core/tests/suite/mcp_auth_refresh.rs` |
| M | `codex-rs/core/tests/suite/mcp_startup_refresh_http_proxy.rs` |
| M | `codex-rs/core/tests/suite/mod.rs` |
| M | `codex-rs/core/tests/suite/openai_file_mcp.rs` |
| M | `codex-rs/core/tests/suite/plugins.rs` |
| M | `codex-rs/core/tests/suite/remote_env.rs` |
| A | `codex-rs/core/tests/suite/retry_after.rs` |
| M | `codex-rs/core/tests/suite/rmcp_client.rs` |
| M | `codex-rs/core/tests/suite/skills_extension.rs` |
| M | `codex-rs/core/tests/suite/snapshots/all__suite__compact_remote__remote_manual_compact_api_auth_prompt_cache_key_request_diff.snap` |
| M | `codex-rs/core/tests/suite/snapshots/all__suite__compact_remote__remote_manual_compact_chatgpt_auth_service_tier_prompt_cache_key_request_diff.snap` |
| M | `codex-rs/core/tests/suite/subagent_notifications.rs` |
| M | `codex-rs/core/tests/suite/token_budget.rs` |
| M | `codex-rs/core/tests/suite/tool_lifecycle.rs` |
| M | `codex-rs/core/tests/suite/turn_input_submission.rs` |
| M | `codex-rs/core/tests/suite/web_search.rs` |
| M | `codex-rs/exec-server/src/capability_discovery_cache.rs` |
| M | `codex-rs/exec-server/src/client.rs` |
| M | `codex-rs/exec-server/src/client/route_aware_http_client.rs` |
| M | `codex-rs/exec-server/src/client_recovery.rs` |
| M | `codex-rs/exec-server/src/client_recovery_tests.rs` |
| M | `codex-rs/exec-server/src/environment.rs` |
| M | `codex-rs/exec-server/src/fs_sandbox.rs` |
| M | `codex-rs/exec-server/tests/environment.rs` |
| M | `codex-rs/exec/src/lib.rs` |
| M | `codex-rs/ext/extension-api/src/contributors.rs` |
| M | `codex-rs/ext/extension-api/src/contributors/tool_lifecycle.rs` |
| M | `codex-rs/ext/git-attribution/src/world_state.rs` |
| M | `codex-rs/ext/guardian-v2/src/extension.rs` |
| M | `codex-rs/ext/guardian-v2/src/extension_tests.rs` |
| M | `codex-rs/ext/guardian-v2/src/lib.rs` |
| A | `codex-rs/ext/guardian-v2/src/transcript.rs` |
| A | `codex-rs/ext/guardian-v2/src/transcript_tests.rs` |
| M | `codex-rs/ext/mcp/tests/hosted_apps_mcp.rs` |
| M | `codex-rs/ext/queue/src/service.rs` |
| M | `codex-rs/ext/queue/tests/queue_service.rs` |
| M | `codex-rs/ext/skills/src/dynamic_skill_selector/character_routing_card_tests.rs` |
| M | `codex-rs/ext/skills/src/dynamic_skill_selector/routing_card_lexical_tests.rs` |
| M | `codex-rs/ext/skills/src/host_roots_tests.rs` |
| M | `codex-rs/ext/skills/src/host_service_tests.rs` |
| M | `codex-rs/ext/skills/src/loader/environment.rs` |
| M | `codex-rs/ext/skills/src/loader/environment_tests.rs` |
| M | `codex-rs/ext/skills/src/loader/host.rs` |
| M | `codex-rs/ext/skills/src/loader/host_io_tests.rs` |
| M | `codex-rs/ext/skills/src/loader/host_tests.rs` |
| M | `codex-rs/ext/skills/src/loader/metadata.rs` |
| M | `codex-rs/ext/skills/src/state.rs` |
| M | `codex-rs/ext/skills/tests/skills_extension.rs` |
| M | `codex-rs/external-agent-migration/src/detect/mod.rs` |
| M | `codex-rs/external-agent-migration/src/plugins.rs` |
| M | `codex-rs/external-agent-migration/src/service.rs` |
| M | `codex-rs/external-agent-migration/src/service_tests/plugins/basics.rs` |
| M | `codex-rs/features/src/lib.rs` |
| M | `codex-rs/http-client/src/client_builder.rs` |
| M | `codex-rs/http-client/src/lib.rs` |
| M | `codex-rs/http-client/src/route_aware_client_pool.rs` |
| M | `codex-rs/http-client/src/route_aware_client_pool_tests.rs` |
| A | `codex-rs/http-client/src/route_aware_tls_fallback_tests.rs` |
| A | `codex-rs/http-client/src/tls_backend_fallback.rs` |
| A | `codex-rs/http-client/src/tls_backend_fallback_tests.rs` |
| M | `codex-rs/linux-sandbox/src/bwrap.rs` |
| M | `codex-rs/login/src/auth/auth_tests.rs` |
| M | `codex-rs/login/src/auth/manager.rs` |
| M | `codex-rs/login/src/auth/workload_identity.rs` |
| M | `codex-rs/login/src/auth/workload_identity_tests.rs` |
| M | `codex-rs/login/src/lib.rs` |
| M | `codex-rs/mcp-server/src/lib.rs` |
| M | `codex-rs/mcp-server/src/message_processor.rs` |
| A | `codex-rs/mcp-server/src/workload_identity_tests.rs` |
| M | `codex-rs/model-provider-info/src/lib.rs` |
| M | `codex-rs/model-provider-info/src/model_provider_info_tests.rs` |
| M | `codex-rs/model-provider/src/amazon_bedrock/auth.rs` |
| M | `codex-rs/model-provider/src/amazon_bedrock/mantle.rs` |
| M | `codex-rs/model-provider/src/amazon_bedrock/mod.rs` |
| A | `codex-rs/model-provider/src/amazon_bedrock/runtime.rs` |
| A | `codex-rs/model-provider/src/amazon_bedrock/runtime_catalog.rs` |
| A | `codex-rs/model-provider/src/amazon_bedrock/runtime_catalog_tests.rs` |
| A | `codex-rs/model-provider/src/amazon_bedrock/runtime_tests.rs` |
| M | `codex-rs/model-provider/src/lib.rs` |
| R087 | `codex-rs/core/src/environment_config.rs` → `codex-rs/protocol/src/environment.rs` |
| M | `codex-rs/protocol/src/lib.rs` |
| M | `codex-rs/protocol/src/models.rs` |
| M | `codex-rs/protocol/src/openai_models.rs` |
| M | `codex-rs/protocol/src/permissions.rs` |
| M | `codex-rs/protocol/src/protocol.rs` |
| M | `codex-rs/rmcp-client/src/bin/test_stdio_server.rs` |
| M | `codex-rs/sandboxing/src/manager_tests.rs` |
| M | `codex-rs/sandboxing/src/policy_transforms.rs` |
| M | `codex-rs/sandboxing/src/policy_transforms_tests.rs` |
| M | `codex-rs/shell-command/src/parse_command.rs` |
| M | `codex-rs/skills/src/invocation.rs` |
| M | `codex-rs/skills/src/invocation_tests.rs` |
| M | `codex-rs/skills/src/lib.rs` |
| M | `codex-rs/skills/src/model.rs` |
| A | `codex-rs/skills/src/model_delegation.rs` |
| A | `codex-rs/skills/src/model_delegation_tests.rs` |
| M | `codex-rs/skills/src/parser.rs` |
| M | `codex-rs/skills/src/parser_tests.rs` |
| M | `codex-rs/skills/src/selection_tests.rs` |
| M | `codex-rs/state/src/runtime/queued_items.rs` |
| M | `codex-rs/thread-manager-sample/src/main.rs` |
| M | `codex-rs/thread-store/src/queue_store.rs` |
| M | `codex-rs/tui/src/app.rs` |
| M | `codex-rs/tui/src/app/app_server_event_targets.rs` |
| M | `codex-rs/tui/src/app/event_dispatch.rs` |
| M | `codex-rs/tui/src/app/input.rs` |
| M | `codex-rs/tui/src/app/startup_prompts.rs` |
| M | `codex-rs/tui/src/app/tests.rs` |
| A | `codex-rs/tui/src/app/tests/background_exit_tests.rs` |
| M | `codex-rs/tui/src/app/tests/model_catalog.rs` |
| M | `codex-rs/tui/src/app/tests/safety_buffering.rs` |
| M | `codex-rs/tui/src/app_event.rs` |
| M | `codex-rs/tui/src/app_server_session.rs` |
| M | `codex-rs/tui/src/chatwidget.rs` |
| M | `codex-rs/tui/src/chatwidget/interaction.rs` |
| M | `codex-rs/tui/src/chatwidget/protocol.rs` |
| M | `codex-rs/tui/src/chatwidget/turn_runtime.rs` |
| M | `codex-rs/tui/src/exec_cell/render.rs` |
| M | `codex-rs/tui/src/lib.rs` |
| M | `codex-rs/tui/src/onboarding/auth.rs` |
| M | `codex-rs/tui/src/session_archive_commands.rs` |
| M | `codex-rs/utils/image/src/image_tests.rs` |
| M | `codex-rs/utils/image/src/lib.rs` |
| M | `codex-rs/windows-sandbox-rs/BUILD.bazel` |
| A | `codex-rs/windows-sandbox-rs/tests/helper_manifest.rs` |
| M | `defs.bzl` |

## pi

- Baseline: `6f707eb36064e82af9c1320a7634f4dfad21049b`
- Candidate: `9d2ec7ffabe927bfad2214c1cee25b6632a78dcf`
- Impact areas: `implementation`, `tests`
- Changed paths: 8

| Status | Path |
| --- | --- |
| M | `packages/ai/CHANGELOG.md` |
| M | `packages/ai/scripts/generate-models.ts` |
| M | `packages/ai/src/api/anthropic-messages.ts` |
| M | `packages/ai/src/api/openai-codex-responses.ts` |
| A | `packages/ai/src/utils/pi-user-agent.ts` |
| M | `packages/ai/test/anthropic-auth-token.test.ts` |
| M | `packages/ai/test/openai-codex-stream.test.ts` |
| M | `packages/coding-agent/CHANGELOG.md` |

## opencode

- Baseline: `d0c2b41adf90c5300fa2c754c1c66c211a36af20`
- Candidate: `0e3474509aa5ad16afcf9c439785514d6443c6af`
- Impact areas: `documentation`, `implementation`, `tests`
- Changed paths: 23

| Status | Path |
| --- | --- |
| M | `packages/core/src/session/projector.ts` |
| M | `packages/core/test/session-projector.test.ts` |
| M | `packages/core/test/session-runner.test.ts` |
| M | `packages/opencode/src/control-plane/workspace.ts` |
| M | `packages/opencode/test/control-plane/workspace.test.ts` |
| M | `packages/web/src/content/docs/ar/zen.mdx` |
| M | `packages/web/src/content/docs/bs/zen.mdx` |
| M | `packages/web/src/content/docs/da/zen.mdx` |
| M | `packages/web/src/content/docs/de/zen.mdx` |
| M | `packages/web/src/content/docs/es/zen.mdx` |
| M | `packages/web/src/content/docs/fr/zen.mdx` |
| M | `packages/web/src/content/docs/it/zen.mdx` |
| M | `packages/web/src/content/docs/ja/zen.mdx` |
| M | `packages/web/src/content/docs/ko/zen.mdx` |
| M | `packages/web/src/content/docs/nb/zen.mdx` |
| M | `packages/web/src/content/docs/pl/zen.mdx` |
| M | `packages/web/src/content/docs/pt-br/zen.mdx` |
| M | `packages/web/src/content/docs/ru/zen.mdx` |
| M | `packages/web/src/content/docs/th/zen.mdx` |
| M | `packages/web/src/content/docs/tr/zen.mdx` |
| M | `packages/web/src/content/docs/zen.mdx` |
| M | `packages/web/src/content/docs/zh-cn/zen.mdx` |
| M | `packages/web/src/content/docs/zh-tw/zen.mdx` |

## qwen-code

- Baseline: `8e0033d64de83c7c212f9806ea9d39e7aea2cd51`
- Candidate: `d670bb81093496a8e242144a76fa70183bb6abb9`
- Impact areas: `documentation`, `implementation`, `tests`
- Changed paths: 119

| Status | Path |
| --- | --- |
| M | `.github/CODEOWNERS` |
| M | `.github/workflows/e2e.yml` |
| M | `.github/workflows/live-host.yml` |
| M | `.github/workflows/qwen-autofix.yml` |
| A | `.github/workflows/scorecard-monthly.yml` |
| M | `.github/workflows/sdk-python.yml` |
| A | `.github/workflows/security-checks.yml` |
| M | `.gitignore` |
| M | `docs/design/gen-ai-arms-field-alignment.md` |
| M | `docs/design/live-journal-truncation-recovery.md` |
| A | `docs/design/standalone-daemon-sessions.md` |
| A | `docs/design/telemetry-main-agent-spans-design.md` |
| M | `docs/design/telemetry-subagent-spans-design.md` |
| M | `docs/developers/development/telemetry.md` |
| M | `integration-tests/cli/gen-ai-telemetry.test.ts` |
| M | `packages/acp-bridge/src/bridge.test.ts` |
| M | `packages/acp-bridge/src/bridge.ts` |
| M | `packages/acp-bridge/src/bridgeTypes.ts` |
| M | `packages/acp-bridge/src/compactionEngine.test.ts` |
| M | `packages/acp-bridge/src/compactionEngine.ts` |
| M | `packages/acp-bridge/src/daemon-memory-budget.ts` |
| M | `packages/acp-bridge/src/eventBus.test.ts` |
| M | `packages/acp-bridge/src/eventBus.ts` |
| M | `packages/acp-bridge/src/journalGrowthPolicy.ts` |
| M | `packages/acp-bridge/src/replayWindowLimits.ts` |
| M | `packages/cli/src/acp-integration/acpAgent.ts` |
| M | `packages/cli/src/acp-integration/session/Session.test.ts` |
| M | `packages/cli/src/acp-integration/session/Session.ts` |
| M | `packages/cli/src/commands/review/agent-prompt.test.ts` |
| M | `packages/cli/src/commands/review/agent-prompt.ts` |
| M | `packages/cli/src/commands/review/compose-review.ts` |
| M | `packages/cli/src/commands/review/lib/agent-briefs.ts` |
| M | `packages/cli/src/commands/review/lib/authorization.ts` |
| M | `packages/cli/src/commands/review/lib/repository-context.ts` |
| M | `packages/cli/src/commands/review/parse-args.test.ts` |
| M | `packages/cli/src/commands/review/pr-context.ts` |
| M | `packages/cli/src/commands/review/publish-assets.test.ts` |
| M | `packages/cli/src/commands/review/submit.test.ts` |
| M | `packages/cli/src/commands/review/submit.ts` |
| M | `packages/cli/src/nonInteractiveCli.test.ts` |
| M | `packages/cli/src/nonInteractiveCli.ts` |
| M | `packages/cli/src/serve/acp-http/dispatch.ts` |
| A | `packages/cli/src/serve/conversations/conversation-runtime-manager.test.ts` |
| A | `packages/cli/src/serve/conversations/conversation-runtime-manager.ts` |
| R083 | `packages/cli/src/serve/live/conversation-workspace.test.ts` → `packages/cli/src/serve/conversations/conversation-workspace.test.ts` |
| R081 | `packages/cli/src/serve/live/conversation-workspace.ts` → `packages/cli/src/serve/conversations/conversation-workspace.ts` |
| R100 | `packages/cli/src/serve/live/session-source.test.ts` → `packages/cli/src/serve/conversations/session-source.test.ts` |
| R100 | `packages/cli/src/serve/live/session-source.ts` → `packages/cli/src/serve/conversations/session-source.ts` |
| M | `packages/cli/src/serve/live/live-session-coordinator.ts` |
| M | `packages/cli/src/serve/live/live-task-service.test.ts` |
| M | `packages/cli/src/serve/live/live-task-service.ts` |
| M | `packages/cli/src/serve/live/live-worker-workspace.test.ts` |
| M | `packages/cli/src/serve/multi-workspace-sessions.test.ts` |
| M | `packages/cli/src/serve/routes/session.ts` |
| M | `packages/cli/src/serve/routes/workspace-management.test.ts` |
| M | `packages/cli/src/serve/routes/workspace-management.ts` |
| M | `packages/cli/src/serve/run-qwen-serve.ts` |
| M | `packages/cli/src/serve/server.test.ts` |
| M | `packages/cli/src/serve/server.ts` |
| M | `packages/cli/src/ui/hooks/useGeminiStream.test.tsx` |
| M | `packages/cli/src/ui/hooks/useGeminiStream.ts` |
| M | `packages/core/src/agents/agent-transcript.test.ts` |
| M | `packages/core/src/agents/agent-transcript.ts` |
| M | `packages/core/src/agents/background-agent-resume.test.ts` |
| M | `packages/core/src/agents/background-agent-resume.ts` |
| M | `packages/core/src/agents/runtime/workflow-orchestrator.test.ts` |
| M | `packages/core/src/agents/runtime/workflow-orchestrator.ts` |
| M | `packages/core/src/core/client.test.ts` |
| M | `packages/core/src/core/client.ts` |
| M | `packages/core/src/core/coreToolScheduler.test.ts` |
| M | `packages/core/src/core/coreToolScheduler.ts` |
| M | `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` |
| M | `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` |
| M | `packages/core/src/services/chatRecordingService.ts` |
| M | `packages/core/src/skills/bundled/review/DESIGN.md` |
| M | `packages/core/src/skills/bundled/review/SKILL.md` |
| M | `packages/core/src/skills/bundled/review/SKILL.test.ts` |
| M | `packages/core/src/telemetry/detailed-span-attributes.test.ts` |
| M | `packages/core/src/telemetry/detailed-span-attributes.ts` |
| M | `packages/core/src/telemetry/index.ts` |
| M | `packages/core/src/telemetry/sdk.test.ts` |
| M | `packages/core/src/telemetry/sdk.ts` |
| M | `packages/core/src/telemetry/session-tracing.test.ts` |
| M | `packages/core/src/telemetry/session-tracing.ts` |
| M | `packages/core/src/tools/agent/agent.test.ts` |
| M | `packages/core/src/tools/agent/agent.ts` |
| M | `packages/core/src/utils/gitUtils.test.ts` |
| M | `packages/core/src/utils/gitUtils.ts` |
| M | `packages/core/src/utils/transcript-records.test.ts` |
| M | `packages/core/src/utils/transcript-records.ts` |
| M | `packages/sdk-typescript/src/daemon/DaemonClient.ts` |
| M | `packages/sdk-typescript/test/unit/DaemonClient.test.ts` |
| M | `packages/web-shell/client/components/artifacts/ArtifactPanel.tsx` |
| M | `packages/web-shell/client/components/artifacts/CodeReviewArtifactDetail.test.tsx` |
| M | `packages/web-shell/client/components/artifacts/CodeReviewArtifactDetail.tsx` |
| M | `packages/web-shell/client/components/dialogs/GitDialog.tsx` |
| M | `packages/web-shell/client/components/dialogs/GitHubPrsDialog.module.css` |
| M | `packages/web-shell/client/components/dialogs/GitHubPrsDialog.test.tsx` |
| M | `packages/web-shell/client/components/dialogs/GitHubPrsDialog.tsx` |
| M | `packages/web-shell/client/components/mcp/McpManagerPage.tsx` |
| M | `packages/web-shell/client/components/messages/AuthMessage.tsx` |
| M | `packages/web-shell/client/components/messages/Markdown.tsx` |
| M | `packages/web-shell/client/components/messages/ToolGroup.test.tsx` |
| M | `packages/web-shell/client/components/messages/ToolGroup.tsx` |
| M | `packages/web-shell/client/components/messages/tools/ParallelAgentsGroup.module.css` |
| M | `packages/web-shell/client/components/messages/tools/ParallelAgentsGroup.test.tsx` |
| M | `packages/web-shell/client/components/messages/tools/ParallelAgentsGroup.tsx` |
| M | `packages/web-shell/client/components/messages/tools/SubAgentPanel.test.tsx` |
| M | `packages/web-shell/client/components/messages/tools/ToolChrome.module.css` |
| M | `packages/web-shell/client/components/messages/tools/toolDisplay.tsx` |
| A | `packages/web-shell/client/hooks/useExternalLinkOpener.test.ts` |
| A | `packages/web-shell/client/hooks/useExternalLinkOpener.ts` |
| M | `packages/web-shell/client/i18n.tsx` |
| M | `packages/webui/src/daemon/session/DaemonSessionProvider.test.tsx` |
| M | `packages/webui/src/daemon/session/DaemonSessionProvider.tsx` |
| M | `scripts/installation/install-qwen-standalone.bat` |
| M | `scripts/tests/install-script.test.js` |
| M | `scripts/tests/qwen-autofix-workflow.test.js` |
| A | `scripts/tests/security-workflows.test.js` |

## swe-bench

- Baseline: `c7fd5abffe0b2086a8bb9389d23c47d930ef571f`
- Candidate: `b3f33bf3f7dc07080486fa2e1c5d3f0de8ab14e2`
- Impact areas: `implementation`, `tests`
- Changed paths: 10

| Status | Path |
| --- | --- |
| M | `swebench/harness/constants/__init__.py` |
| M | `swebench/harness/grading.py` |
| A | `swebench/harness/infra_failure.py` |
| M | `swebench/harness/reporting.py` |
| M | `swebench/harness/utils.py` |
| M | `swebench/inference/run_api.py` |
| A | `swebench/inference/usage.py` |
| A | `tests/test_grading_spoofed_output.py` |
| A | `tests/test_inference_usage.py` |
| A | `tests/test_infra_failure.py` |
