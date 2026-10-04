import { spawn } from "node:child_process";
import { resolveExecutable } from "./executables.js";
export function getOpenUrlCommand(url, platform = process.platform, resolveCommand = resolveExecutable) {
    if (platform === "win32") {
        return {
            command: "explorer",
            args: [url],
        };
    }
    if (platform === "darwin") {
        const command = resolveCommand("open");
        return command ? { command, args: [url] } : undefined;
    }
    const command = resolveCommand("xdg-open");
    return command ? { command, args: [url] } : undefined;
}
export function openUrl(url) {
    const command = getOpenUrlCommand(url);
    if (!command) {
        return false;
    }
    try {
        const child = spawn(command.command, command.args, {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        });
        child.on("error", () => { });
        child.unref();
        return true;
    }
    catch {
        return false;
    }
}
