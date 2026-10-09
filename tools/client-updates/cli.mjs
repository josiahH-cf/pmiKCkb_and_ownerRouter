#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { collectContext, contentExample, loadSnapshot } from "./content.mjs";
import { prepareEmail, recordManualSend, validateMailConfig } from "./email.mjs";
import { acceptPack, buildPack, reviewPack, verifyPack } from "./pack.mjs";
import {
  assert,
  continuity,
  date,
  privateConfig,
  readPrivate,
  rendererConfig,
  safePath,
  saveJson,
  setBaseline,
  stateRoot,
} from "./store.mjs";

const [command = "help", ...args] = process.argv.slice(2);
const allowed = {
  status: [],
  doctor: [],
  configure: ["file"],
  collect: ["lane", "date", "since", "notes", "offline"],
  schema: ["snapshot"],
  pack: ["content"],
  "verify-pack": ["run"],
  "review-pack": ["run", "pages", "facts-checked", "privacy-checked"],
  "accept-pack": ["run"],
  "meeting-complete": ["date"],
  "prepare-email": ["content"],
  "record-manual-send": ["preview", "confirmed-sent"],
  help: [],
};
try {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    assert(/^--[a-z-]+$/.test(args[i]), "Expected named argument");
    const name = args[i].slice(2);
    assert(!(name in options), "Duplicate argument");
    options[name] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
  }
  assert(
    command in allowed &&
      Object.keys(options).every((key) => allowed[command].includes(key)),
    "Unknown command or argument; use help",
  );
  const base = stateRoot();
  const input = (flag) => {
    assert(typeof options[flag] === "string", `Missing --${flag}`);
    return readPrivate(base, options[flag]);
  };
  const content = () => {
    const value = input("content");
    return [value, loadSnapshot(base, value.snapshot_id)];
  };
  let result;
  switch (command) {
    case "configure": {
      const value = input("file");
      if (value.email) validateMailConfig(value.email);
      assert(
        !value.publication || value.publication === "disabled",
        "Public publication is not implemented",
      );
      saveJson(safePath(base, "config.json"), value);
      result = {
        state: "configured",
        path: safePath(base, "config.json"),
        email_mode: "copy_only",
      };
      break;
    }
    case "status":
      result = {
        state_root: base,
        email_configured: Boolean(privateConfig(base).email),
        renderer_configured: Boolean(
          rendererConfig(base).python && rendererConfig(base).font_dir,
        ),
        email_mode: "copy_only",
        publication: "disabled",
        baselines: continuity(base),
      };
      break;
    case "doctor": {
      const value = rendererConfig(base);
      assert(value.python && value.font_dir, "Configure python and font_dir");
      const versions = execFileSync(
        value.python,
        [
          "-c",
          "import importlib.metadata as m,json; print(json.dumps({x:m.version(x) for x in ['reportlab','pypdf','pypdfium2']}))",
        ],
        { encoding: "utf8", timeout: 15_000 },
      );
      for (const weight of ["Regular", "Medium", "SemiBold", "Bold"])
        assert(
          existsSync(safePath(value.font_dir, `Poppins-${weight}.ttf`)),
          `Missing Poppins ${weight}`,
        );
      result = {
        renderer: "ready",
        packages: JSON.parse(versions),
        email_mode: "copy_only",
        state_root: base,
      };
      break;
    }
    case "collect":
      result = collectContext(base, {
        lane: options.lane,
        meetingDate: options.date,
        since: options.since,
        notes: options.notes ? input("notes") : undefined,
        refresh: !options.offline,
      });
      break;
    case "schema":
      result = contentExample(loadSnapshot(base, options.snapshot));
      break;
    case "pack":
      result = buildPack(base, ...content());
      break;
    case "verify-pack":
      result = verifyPack(base, options.run);
      break;
    case "review-pack":
      result = reviewPack(
        base,
        options.run,
        input("pages"),
        options["facts-checked"] === true,
        options["privacy-checked"] === true,
      );
      break;
    case "accept-pack":
      result = acceptPack(base, options.run);
      break;
    case "meeting-complete":
      setBaseline(base, "meeting", {
        date: date(options.date),
        recorded_at: new Date().toISOString(),
      });
      result = { state: "recorded" };
      break;
    case "prepare-email":
      result = prepareEmail(base, ...content());
      break;
    case "record-manual-send":
      result = recordManualSend(base, options.preview, options["confirmed-sent"]);
      break;
    default:
      result = {
        commands: allowed,
        input_rule:
          "All JSON inputs belong in the ignored state_root returned by status.",
        email_mode: "copy_only",
        schedules: "none",
      };
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`client-updates: ${error.message}\n`);
  process.exitCode = 1;
}
