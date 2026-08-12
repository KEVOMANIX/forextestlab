/** Parse `--name=value`, `--name value`, and standalone boolean CLI flags. */
export function parseCliFlags(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) continue;
    const equal = arg.indexOf("=");
    if (equal >= 0) {
      parsed[arg.slice(2, equal)] = arg.slice(equal + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      parsed[arg.slice(2)] = next;
      index += 1;
    } else {
      parsed[arg.slice(2)] = "true";
    }
  }
  return parsed;
}
