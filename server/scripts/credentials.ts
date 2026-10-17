/**
 * The maintainer's findbolig.nu login for scripts that read their account: `FINDBOLIG_EMAIL` and
 * `FINDBOLIG_PASSWORD` from the environment or `server/.env` (gitignored), else asked for in the
 * terminal, the password without echo.
 */
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { config } from "dotenv";

config({ path: join(import.meta.dirname, "../.env"), quiet: true });

/** Reads a line from the terminal; `hidden` keeps what is typed off the screen. */
async function ask(question: string, hidden = false) {
  process.stdout.write(question);
  const output = hidden ? new Writable({ write: (_chunk, _encoding, done) => done() }) : process.stdout;
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = await rl.question("");
  rl.close();
  if (hidden) process.stdout.write("\n");
  return answer;
}

export async function credentials() {
  let { FINDBOLIG_EMAIL: email, FINDBOLIG_PASSWORD: password } = process.env;
  email ||= await ask("findbolig.nu email: ");
  password ||= await ask("findbolig.nu password: ", true);
  return { email, password };
}
