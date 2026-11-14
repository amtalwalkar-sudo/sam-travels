import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../apps/web/src/main.tsx", import.meta.url);
const source = readFileSync(path, "utf8");
const flag = "const ENABLE_TEMPORARY_BREAKEVEN_SANITY_CHECK = ";
const line = source.split("\n").find(value => value.startsWith(flag));
if (!line || !/^const ENABLE_TEMPORARY_BREAKEVEN_SANITY_CHECK = (true|false);$/.test(line)) {
  throw new Error("temporary_breakeven_registration_flag_not_found");
}
if (line.endsWith("false;")) {
  process.stdout.write("Temporary breakeven sanity-check surface is already disabled.\n");
} else {
  writeFileSync(path, source.replace(line, flag + "false;"), "utf8");
  process.stdout.write("Temporary breakeven sanity-check surface disabled; calculation services and data are unchanged.\n");
}
