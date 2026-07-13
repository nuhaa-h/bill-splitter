// PreToolUse hook, fired only for `git commit` Bash calls (see .claude/settings.json).
// Runs the test suite and denies the commit if it fails, enforcing the
// "don't commit failing tests" rule from CLAUDE.md instead of just hoping it's followed.

const { execSync } = require("child_process");

try {
  execSync("npm test", { stdio: "pipe", encoding: "utf8" });
} catch (err) {
  const output = ((err.stdout || "") + (err.stderr || "")).split("\n").slice(-30).join("\n");
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "npm test is failing — commit blocked (CLAUDE.md: don't commit failing tests).\n\n" + output,
      },
    })
  );
}
