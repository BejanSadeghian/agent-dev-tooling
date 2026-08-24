// Tiny console reporter shared by the validator, rubric gate, and regression runner.
const ESC = String.fromCharCode(27);
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `${ESC}[${code}m${s}${ESC}[0m` : s);

export const red = (s) => paint('31', s);
export const green = (s) => paint('32', s);
export const yellow = (s) => paint('33', s);
export const dim = (s) => paint('2', s);
export const bold = (s) => paint('1', s);

/** Print a titled block of findings. Returns the number of blocking errors. */
export function printFindings(title, findings) {
  if (findings.length === 0) {
    console.log(`${green('PASS')} ${title}`);
    return 0;
  }
  const errors = findings.filter((f) => f.level !== 'warn');
  console.log(`${errors.length ? red('FAIL') : yellow('WARN')} ${title}`);
  for (const f of findings) {
    const tag = f.level === 'warn' ? yellow('warn') : red('error');
    const where = f.where ? dim(` (${f.where})`) : '';
    console.log(`  ${tag} ${f.message}${where}`);
  }
  return errors.length;
}
