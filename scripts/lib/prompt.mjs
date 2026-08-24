// Minimal interactive prompting for the generators. Works in a terminal, in
// Claude Code, and in GitHub Copilot CLI; falls back to defaults when stdin is
// not a TTY (CI) or --yes was passed.
import readline from 'node:readline/promises';
import { bold, dim, yellow } from './report.mjs';

export class Prompter {
  /**
   * @param {{answers?: Record<string, any>, assumeYes?: boolean}} options
   *   answers: pre-supplied values keyed by question id (skips the question)
   *   assumeYes: never ask; take the default or the pre-supplied answer
   */
  constructor({ answers = {}, assumeYes = false } = {}) {
    this.answers = answers;
    this.assumeYes = assumeYes || !process.stdin.isTTY;
    this.transcript = [];
    this.rl = null;
  }

  #open() {
    if (!this.rl) this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return this.rl;
  }

  close() {
    this.rl?.close();
    this.rl = null;
  }

  say(text = '') {
    console.log(text);
  }

  /** Ask a free-text question. `validate` returns an error string or null. */
  async ask(id, question, { default: fallback = '', hint = '', validate = null } = {}) {
    const preset = this.answers[id];
    if (preset !== undefined) return this.#remember(id, question, String(preset));
    if (this.assumeYes) return this.#remember(id, question, fallback);

    for (;;) {
      if (hint) console.log(dim(`  ${hint}`));
      const raw = await this.#open().question(`${bold(question)}${fallback ? dim(` [${fallback}]`) : ''}\n> `);
      const value = raw.trim() || fallback;
      const problem = validate ? validate(value) : null;
      if (problem) {
        console.log(yellow(`  ${problem}`));
        continue;
      }
      return this.#remember(id, question, value);
    }
  }

  /** Ask a yes/no question. */
  async confirm(id, question, { default: fallback = true } = {}) {
    const preset = this.answers[id];
    if (preset !== undefined) return Boolean(preset);
    if (this.assumeYes) return fallback;
    const raw = await this.#open().question(`${bold(question)} ${dim(fallback ? '[Y/n]' : '[y/N]')}\n> `);
    const value = raw.trim().toLowerCase();
    const result = value === '' ? fallback : ['y', 'yes'].includes(value);
    this.#remember(id, question, result ? 'yes' : 'no');
    return result;
  }

  /** Ask for a list; one item per line, blank line ends it. */
  async list(id, question, { hint = '', min = 0 } = {}) {
    const preset = this.answers[id];
    if (preset !== undefined) return Array.isArray(preset) ? preset : [preset];
    if (this.assumeYes) return [];

    console.log(bold(question));
    if (hint) console.log(dim(`  ${hint}`));
    console.log(dim('  one per line; blank line to finish'));
    const items = [];
    for (;;) {
      const raw = (await this.#open().question(`> `)).trim();
      if (!raw) {
        if (items.length >= min) break;
        console.log(yellow(`  at least ${min} needed`));
        continue;
      }
      items.push(raw);
    }
    this.#remember(id, question, items.join(' | '));
    return items;
  }

  /** Ask to pick one of a fixed set. */
  async choose(id, question, choices, { default: fallback = choices[0] } = {}) {
    const preset = this.answers[id];
    if (preset !== undefined) return String(preset);
    if (this.assumeYes) return fallback;
    return this.ask(id, `${question} (${choices.join(' / ')})`, {
      default: fallback,
      validate: (v) => (choices.includes(v) ? null : `pick one of: ${choices.join(', ')}`),
    });
  }

  #remember(id, question, value) {
    this.transcript.push({ id, question, answer: value });
    return value;
  }
}
