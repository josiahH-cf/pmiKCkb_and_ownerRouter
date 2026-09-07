// Minimal argument helpers shared by the S112 auth scripts.

export function readArg(argv: readonly string[], name: string): string | undefined {
  const inline = argv.find((entry) => entry.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return undefined;
}

export function hasArg(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

export function requireArg(argv: readonly string[], name: string): string {
  const value = readArg(argv, name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
