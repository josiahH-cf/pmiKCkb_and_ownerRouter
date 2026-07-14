const configured = process.env.FIRESTORE_EMULATOR_HOST?.trim() || "127.0.0.1:8080";
const separator = configured.lastIndexOf(":");
const host = separator > 0 ? configured.slice(0, separator) : configured;
const parsedPort = separator > 0 ? Number(configured.slice(separator + 1)) : 8080;

if (!host || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
  throw new Error("FIRESTORE_EMULATOR_HOST must be a local host:port value.");
}

export const FIRESTORE_EMULATOR_TARGET = Object.freeze({ host, port: parsedPort });
