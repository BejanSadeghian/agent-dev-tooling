#!/usr/bin/env node
// Reads a newline-separated list of repo-relative paths on stdin (typically
// `git diff --cached --name-only`) and prints the distinct skills they belong to.
import { loadConfig, skillForPath } from './lib/skills.mjs';

const config = loadConfig();
const input = await new Promise((resolve) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (buf += chunk));
  process.stdin.on('end', () => resolve(buf));
});

const skills = new Set();
for (const line of input.split('\n').map((l) => l.trim()).filter(Boolean)) {
  const skill = skillForPath(config, line);
  if (skill) skills.add(skill);
}
for (const skill of [...skills].sort()) console.log(skill);
