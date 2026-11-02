import { readWslgDisplayHealth } from "./display-health.mjs";
import { access } from "node:fs/promises";
import { createConnection } from "node:net";

async function reachable(path, timeoutMs = 1_000) {
  try {
    await access(path);
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    const socket = createConnection({ path });
    let done = false;
    const finish = (value) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(value);
      }
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/** Reuse an observed local display. Never creates Xvfb or changes desktop security settings. */
export async function resolveAttendedDisplay(
  env = process.env,
  probe = reachable,
  healthProbe = readWslgDisplayHealth,
) {
  if (env.WSL_DISTRO_NAME && (await healthProbe()).state === "crash_loop") {
    return {
      ready: false,
      source: "wslg_compositor",
      code: "display_compositor_crash_loop",
      detail:
        "WSLg's Weston compositor is repeatedly crashing (signal 11). Visible Google sign-in cannot be verified. Have the host coordinator restore WSLg after other jobs reach a clean checkpoint, then rerun this command. Existing credentials were not replaced; no hidden display or WSL restart was started.",
    };
  }
  const display = env.DISPLAY?.match(/^:(\d+)(?:\.\d+)?$/);
  if (display && (await probe(`/tmp/.X11-unix/X${display[1]}`))) {
    return { ready: true, source: "existing_x11", env: { ...env } };
  }
  // WSLg owns this well-known local Unix socket. Only restore the child's environment.
  if (env.WSL_DISTRO_NAME && (await probe("/mnt/wslg/.X11-unix/X0"))) {
    return { ready: true, source: "existing_wslg", env: { ...env, DISPLAY: ":0" } };
  }
  return {
    ready: false,
    source: "unavailable",
    code: "display_unavailable",
    detail:
      "A human Google challenge needs a visible WSLg display. Open this command in a local Windows/WSL terminal with WSLg available, then run it again. No hidden display was started.",
  };
}
