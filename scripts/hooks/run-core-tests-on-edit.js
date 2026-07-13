// PostToolUse hook for Write|Edit (see .claude/settings.json). Reads the edited
// file path from stdin and, if it's one of core/'s pure-logic modules, immediately
// runs its matching test file so failures surface right away instead of at `npm test` time.

const path = require("path");
const { execSync } = require("child_process");

const TEST_FOR_CORE_FILE = {
  "core/split.js": "test/split.test.js",
  "core/period.js": "test/period.test.js",
};

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return;
  }

  const filePath = (payload.tool_input && payload.tool_input.file_path) || (payload.tool_response && payload.tool_response.filePath);
  if (!filePath) return;

  const rel = path.relative(process.cwd(), filePath).split(path.sep).join("/");
  const testFile = TEST_FOR_CORE_FILE[rel];
  if (!testFile) return;

  try {
    execSync(`node --test ${testFile}`, { stdio: "pipe", encoding: "utf8" });
    console.log(JSON.stringify({ systemMessage: `✅ ${testFile} passed after editing ${rel}` }));
  } catch (err) {
    const output = ((err.stdout || "") + (err.stderr || "")).split("\n").slice(-40).join("\n");
    console.log(
      JSON.stringify({
        systemMessage: `❌ ${testFile} failed after editing ${rel}`,
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `Editing ${rel} just broke ${testFile}:\n${output}`,
        },
      })
    );
  }
});
