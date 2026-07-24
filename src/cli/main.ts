import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runValidators } from "../validators/index.ts";
import { runPreCommit } from "../hooks/preCommit.ts";
import { runPreToolUse } from "../hooks/preToolUse.ts";
import { runStop } from "../hooks/stop.ts";
import { runPreCompact } from "../hooks/preCompact.ts";
import { runSessionStart } from "../hooks/sessionStart.ts";
import { runUserPromptSubmit } from "../hooks/userPromptSubmit.ts";
import { installPreCommit } from "../hooks/installHook.ts";
import { runSyncSkills } from "../sync/syncSkills.ts";
import { runEval } from "../eval/evalCli.ts";

/** Amanar CLI dispatcher. One binary all hooks and tools funnel through. */
export async function main(argv: string[]): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case "validate":
      runValidators(repoRoot);
      break;

    case "hook":
      await runHook(rest);
      break;

    case "hooks": {
      // hooks install [--root R] [--remove]
      if (rest[0] !== "install") {
        console.error("amanar hooks: unknown subcommand. Available: install");
        process.exit(2);
      }
      const rootFlag = rest.indexOf("--root");
      installPreCommit({
        root: rootFlag !== -1 ? rest[rootFlag + 1] : ".",
        remove: rest.includes("--remove"),
      });
      break;
    }

    case "sync-skills":
      runSyncSkills(rest);
      break;

    case "eval":
      process.exit(await runEval(repoRoot));
      break;

    default:
      console.error(
        `amanar: unknown command '${cmd ?? ""}'. Available: validate, hook, hooks, sync-skills, eval`,
      );
      process.exit(2);
  }
}

async function runHook(rest: string[]): Promise<void> {
  const name = rest[0];
  switch (name) {
    case "pre-commit":
      process.exit(runPreCommit(process.cwd()));
      break;
    case "pre-tool-use":
      await runPreToolUse();
      break;
    case "stop":
      await runStop();
      break;
    case "pre-compact":
      await runPreCompact();
      break;
    case "session-start":
      await runSessionStart();
      break;
    case "user-prompt-submit":
      await runUserPromptSubmit();
      break;
    default:
      console.error(
        `amanar hook: unknown hook '${name ?? ""}'. Available: ` +
          `pre-commit, pre-tool-use, stop, pre-compact, session-start, user-prompt-submit`,
      );
      process.exit(2);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
