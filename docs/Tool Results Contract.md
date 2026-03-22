# Tool Results Contract

This document explains the persisted tool-result envelope contract used by adopted tools such as `shell_cmd`, `load_skill`, and `web_fetch`.

The contract separates what the user sees in the transcript from what the next LLM continuation step reads.

## Envelope Shape

The shared envelope shape is defined in `core/tool-execution-envelope.ts` and contains these top-level fields:

| Field | Required | Purpose |
| --- | --- | --- |
| `__type` | Yes | Identifies this payload as a tool execution envelope |
| `version` | Yes | Envelope version. Current value is `1` |
| `tool` | Yes | Tool name such as `shell_cmd` |
| `tool_call_id` | No | Tool call identifier for lifecycle correlation |
| `status` | No | Tool completion status such as `completed` or `failed` |
| `preview` | Yes | Durable UI-facing preview payload |
| `display_content` | No | Optional directly displayable content shortcut |
| `result` | Yes | Canonical payload reintroduced into LLM continuation |

## The Three Content Fields

These are the three content-bearing fields to focus on:

| Field | Primary consumer | Purpose | Fed back to next LLM step? |
| --- | --- | --- | --- |
| `preview` | Frontend transcript and tool result rendering | Show human-friendly preview content | No |
| `display_content` | Synthetic assistant display adoption and direct UI rendering | Promote directly displayable content such as markdown, html, or svg | No |
| `result` | Message preparation and tool continuation | Provide the canonical tool payload for the next model step | Yes |

Short version:

- `preview` is for humans.
- `result` is for the next LLM continuation.
- `display_content` is an optional shortcut for content that can be displayed directly.

## How `shell_cmd` Uses The Contract

When `shell_cmd` runs in the normal orchestrated agent flow, it is typically called with:

- `persistToolEnvelope: true`
- `llmResultMode: "minimal"`

That means the stored tool message content is an envelope.

In that envelope:

- `preview` contains a markdown transcript block such as `Command Execution` and `Standard Output (preview)`
- `result` contains a compact summary such as `status: success`, `exit_code: 0`, and bounded `stdout_preview`
- `display_content` is only present when stdout itself is directly displayable as explicit `markdown`, `html`, or `svg`
- valid top-level JSON stdout remains regular shell output even if nested string fields contain markdown or HTML-like text

## Direct Tool Call vs Skill Script Tool Call

For `shell_cmd`, a direct tool call and a skill-script tool call use the same envelope contract.

The difference is not the envelope shape. The difference is only how the command path is resolved before execution.

| Case | Command resolution | Envelope contract |
| --- | --- | --- |
| Direct tool call | Uses the provided command and cwd/trusted working directory | Same `preview`, `display_content`, `result` contract |
| Skill script tool call | May resolve `./script` or `scripts/foo.sh` against active skill context | Same `preview`, `display_content`, `result` contract |

## Minimal vs Verbose Result Modes

For `shell_cmd`, `llmResultMode` changes the `result` field much more than the `preview` field.

| Mode | `result` field | `preview` field |
| --- | --- | --- |
| `minimal` | Compact continuation payload with status, exit code, bounded previews, and truncation flags | Human-readable markdown preview block |
| `verbose` | Full markdown or structured JSON result, depending on `output_format` | Human-readable markdown preview block |

In practice:

- `minimal` is optimized for continuation safety and bounded context size
- `verbose` is optimized for direct tool-return readability

## Streaming Rows vs Terminal Envelope

During live execution, clients may render transient tool-stream rows such as incremental shell stdout.

Those rows are not the persisted contract of record.

The authoritative completed shell result is the terminal persisted tool envelope.

In practice, this means:

- live stdout rows are temporary UI updates while the command is still running
- once the terminal tool result is available, the merged tool card should keep the terminal envelope content rather than show both the transient stream row and the final envelope
- transcript/debug analysis after completion should read the persisted envelope fields (`preview`, optional `display_content`, and `result`) as the canonical artifact

## Concrete Example: `shell_cmd` Search Script

Assume the tool runs this resolved command:

```text
/Users/esun/Documents/Projects/test-agent-world/skills/search/scripts/search.sh "{\"query\": \"google workspace cli\"}"
```

### Stored `preview`

This is the kind of content users see in the tool result UI:

```markdown
### Command Execution

**Command:** `/Users/esun/Documents/Projects/test-agent-world/skills/search/scripts/search.sh "{\"query\": \"google workspace cli\"}"`
**Duration:** 959ms
**Status:** ✅ Exit code 0

### Standard Output (preview)

```
{
  "query": "google workspace cli",
  "follow_up_questions": null,
  "answer": null,
  "images": [],
  "results": [
    {
      "url": "https://github.com/googleworkspace/cli",
      "title": "Google Workspace CLI — one command-line tool for Drive ... - GitHub"
    }
  ]
}
```

*(Output truncated to minimum necessary preview. Use `output_detail: "full"` for full output.)*
```

### Stored `result` in normal orchestrated minimal mode

This is the kind of payload the next LLM continuation step receives after envelope unwrapping:

```text
status: success
exit_code: 0
timed_out: false
canceled: false
stdout_preview:
{
  "query": "google workspace cli",
  "follow_up_questions": null,
  "answer": null,
  "images": [],
  "results": [
    {
      "url": "https://github.com/googleworkspace/cli",
      "title": "Google Workspace CLI — one command-line tool for Drive ... - GitHub"
    }
  ]
}
stdout_truncated: true
```

Notice the difference:

- the preview is formatted for a human transcript
- the result is compact and structured for the next LLM step

## Example With `display_content`

If stdout is itself directly displayable, `shell_cmd` may also set `display_content`.

The allow-list is explicit:

- `markdown`
- `html`
- `svg`

For example, if stdout contains markdown for an inline image:

```markdown
![score](data:image/svg+xml;base64,AAAA...)
```

the envelope may contain:

| Field | Example value |
| --- | --- |
| `preview` | Markdown preview containing the image markdown |
| `display_content` | `![score](data:image/svg+xml;base64,AAAA...)` |
| `result` | Compact continuation payload, often with `stdout_redacted: true` |

`display_content` is what allows directly displayable shell output to be carried separately from the bounded continuation payload.

## Synthetic Assistant Rows

Some enveloped tool results can also produce a separate display-only assistant message.

That synthetic assistant row:

- is derived only from explicit `display_content`
- exists for transcript display only
- is filtered back out before LLM history is prepared

In practice, this remains narrower than generic `display_content` storage. The runtime only creates a synthetic assistant row when the content is renderable through the assistant markdown surface, so ordinary text preview blocks do not duplicate and raw SVG payloads can stay envelope-only.

This means the persisted envelope remains the source of truth, while the synthetic assistant row is only a display artifact.

## JSON Guardrail

Top-level valid JSON stdout must remain ordinary shell output even if nested string fields contain markdown, HTML-like text, or inline image references.

That guardrail prevents JSON payloads from being reclassified as directly displayable `display_content`, which in turn prevents duplicate synthetic display artifacts for structured shell results.

## Operational Rules To Remember

| Rule | Why it matters |
| --- | --- |
| Read `preview` as transcript/UI content | It explains what the user saw |
| Read `result` as continuation content | It explains what the next LLM step saw |
| Do not assume `display_content` exists | It is optional and only appears for directly displayable outputs |
| Do not treat skill-script shell calls as a separate contract | They use the same envelope shape as direct `shell_cmd` calls |

## Related Docs

- [Shell Command Tool (shell_cmd)](shell-cmd-tool.md)
- [HITL Approval Flow](hitl-approval-flow.md)
- [Logging Guide](logging-guide.md)