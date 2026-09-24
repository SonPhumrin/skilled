import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, dialog, ipcMain, nativeTheme, shell } from "electron";
import type { LiveUpdate, PermissionDecision, SendRequest, Thread } from "../shared/types";
import { spawnSync } from "node:child_process";
import { createClaudeDriver, resolvePackagedClaudeBinary } from "./agents/claude";
import { Store } from "./db";
import { Service } from "./service";
import { defaultSkillsCandidates, findSkillsRoot, loadCatalog } from "./skills/catalog";
import { ensurePlugin } from "./skills/plugin";

const here = fileURLToPath(new URL(".", import.meta.url));
const smoke = process.argv.includes("--smoke");

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: "UnSkilled",
    // A frameless-looking window on every OS: traffic lights inset on macOS,
    // native caption buttons overlaid on Windows and Linux.
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    titleBarOverlay: isMac
      ? undefined
      : { color: "#00000000", symbolColor: nativeTheme.shouldUseDarkColors ? "#f5f5f7" : "#1d1d1f", height: 52 },
    vibrancy: isMac ? "sidebar" : undefined,
    visualEffectState: isMac ? "followWindow" : undefined,
    backgroundMaterial: isWin ? "mica" : undefined,
    backgroundColor: isMac || isWin ? "#00000000" : nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#f5f5f7",
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => {
    if (!smoke) win.show();
  });
  // Links open in the user's browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(here, "../renderer/index.html"));
  }
  return win;
}

async function main(): Promise<void> {
  await app.whenReady();

  const userData = app.getPath("userData");
  mkdirSync(userData, { recursive: true });
  const store = new Store(join(userData, "unskilled.db"));
  const root = findSkillsRoot(
    defaultSkillsCandidates({ resourcesPath: app.isPackaged ? process.resourcesPath : undefined, appPath: app.getAppPath() }),
  );
  const catalog = loadCatalog(root);
  const pluginDir = join(userData, "skilled-plugin");
  const driver = createClaudeDriver({
    pluginDir: () => ensurePlugin(catalog, pluginDir),
    guardScript: join(root.skillsDir, "git-guardrails", "scripts", "block-dangerous-git.py"),
  });

  const windows = new Set<BrowserWindow>();
  const broadcast = (update: LiveUpdate) => {
    for (const w of windows) if (!w.isDestroyed()) w.webContents.send("unskilled:update", update);
  };
  const service = new Service(store, catalog, driver, broadcast);

  ipcMain.handle("projects:list", () => store.listProjects());
  ipcMain.handle("projects:add", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: "Open a project folder",
      properties: ["openDirectory", "createDirectory"],
    };
    const res = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const path = res.filePaths[0];
    return res.canceled || !path ? null : store.addProject(path);
  });
  ipcMain.handle("threads:list", (_e, projectId: string) => store.listThreads(projectId));
  ipcMain.handle("threads:create", (_e, projectId: string) => service.createThread(projectId));
  ipcMain.handle("threads:update", (_e, id: string, patch: Partial<Pick<Thread, "title" | "model" | "permissionMode">>) =>
    store.updateThread(id, pick(patch, ["title", "model", "permissionMode"])),
  );
  ipcMain.handle("threads:delete", (_e, id: string) => {
    service.interrupt(id);
    store.deleteThread(id);
  });
  ipcMain.handle("events:list", (_e, threadId: string) => store.listEvents(threadId));
  ipcMain.handle("skills:list", () => service.listSkills());
  ipcMain.handle("models:list", () => service.listModels());
  ipcMain.handle("turn:send", (_e, req: SendRequest) => {
    // Resolve once the turn has started; progress arrives as updates.
    service.send(req).catch((err: unknown) => {
      broadcast({ type: "running", threadId: req.threadId, running: false });
      console.error(err);
    });
  });
  ipcMain.handle("turn:interrupt", (_e, threadId: string) => service.interrupt(threadId));
  ipcMain.handle("permission:respond", (_e, requestId: string, decision: PermissionDecision) =>
    service.respondPermission(requestId, decision),
  );
  ipcMain.handle("diff:get", (_e, projectId: string) => service.getDiff(projectId));

  const open = () => {
    const win = createWindow();
    windows.add(win);
    win.on("closed", () => windows.delete(win));
    return win;
  };
  const first = open();

  if (smoke) {
    // CI smoke test: the window loads, the preload bridge is there, and the
    // skills catalog answers. Exit 0 only if all three hold.
    first.webContents.once("did-finish-load", async () => {
      try {
        const ok = await first.webContents.executeJavaScript(
          "typeof window.unskilled === 'object' && window.unskilled.listSkills().then(s => s.length > 0)",
        );
        // A packaged build must be able to launch the Claude Code binary the
        // Agent SDK ships, from outside the asar archive.
        let binaryOk = true;
        if (app.isPackaged) {
          const bin = resolvePackagedClaudeBinary();
          const run = bin ? spawnSync(bin, ["--version"], { encoding: "utf-8", timeout: 30_000 }) : null;
          binaryOk = Boolean(run && run.status === 0);
          console.log(`smoke: claude binary ${bin ?? "(not found)"} -> ${run?.stdout.trim() || run?.error?.message || "no output"}`);
        }
        console.log(`smoke: ${ok && binaryOk ? "ok" : "failed"}`);
        app.exit(ok && binaryOk ? 0 : 1);
      } catch (err) {
        console.error("smoke: failed", err);
        app.exit(1);
      }
    });
    first.webContents.once("did-fail-load", () => app.exit(1));
  }

  app.on("activate", () => {
    if (windows.size === 0) open();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => store.close());
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

main().catch((err: unknown) => {
  console.error(err);
  dialog.showErrorBox("UnSkilled could not start", err instanceof Error ? err.message : String(err));
  app.exit(1);
});
