# development/

Skills being built. One directory per skill, always in pairs:

```text
development/<use-case>-doer/          deterministic processing → structured artifact (schema.md)
development/<use-case>-interpreter/   facts from that artifact, then interpretation
```

Start one with `npm run skill:new`. Test with `npm run subagent -- <use-case> "a real task"` —
never by running the skill in your own chat. Ship a green pair with
`npm run publish -- <use-case>`.

Nothing in this folder is discovered by the authoring agent's harness — that is deliberate: a
work in progress only ever runs inside a clean sub-agent. The contract for what belongs here is
`.framework/FRAMEWORK.md`.
