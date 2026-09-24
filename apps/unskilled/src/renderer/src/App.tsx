import { useEffect } from "react";
import type { PermissionMode } from "../../shared/types";
import { Composer } from "./components/Composer";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { ThreadView } from "./components/ThreadView";
import { IconDiff, IconFolder, IconGlobe, IconSparkle } from "./icons";
import { useSelectedThread, useStore } from "./store";

const MODES: { id: PermissionMode; label: string; title: string }[] = [
  { id: "ask", label: "Ask", title: "Ask before edits and commands" },
  { id: "auto-edit", label: "Auto-edit", title: "Edit files freely, ask before commands" },
  { id: "full", label: "Full", title: "Run everything without asking" },
];

export function App() {
  const projects = useStore((s) => s.projects);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const inspectorTab = useStore((s) => s.inspectorTab);
  const models = useStore((s) => s.models);
  const thread = useSelectedThread();
  const running = useStore((s) => (thread ? Boolean(s.running[thread.id]) : false));
  const { init, newThread, showInspector, updateThread, interrupt, addProject } = useStore.getState();
  const project = projects.find((p) => p.id === selectedProjectId) ?? null;

  useEffect(() => {
    void init();
  }, [init]);

  // ⌘N / Ctrl+N: new thread. ⌘⇧D: changes. Esc: stop the running turn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void newThread();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        showInspector("changes");
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        showInspector("browser");
      } else if (e.key === "Escape" && running && !document.querySelector(".skill-menu")) {
        void interrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newThread, showInspector, interrupt, running]);

  // The browser works without a project; Changes needs one.
  const inspectorVisible = inspectorOpen && (project || inspectorTab === "browser");

  return (
    <div className={`app${inspectorVisible ? " with-inspector" : ""}`}>
      <Sidebar />
      <main className="main">
        <header className="main-header drag">
          <div className="main-title">
            {thread ? thread.title : project ? project.name : "UnSkilled"}
            {thread && project && <span className="sub">{project.name}</span>}
          </div>
          {thread && (
            <>
              <select
                className="select"
                value={thread.model}
                title="Model"
                disabled={running}
                onChange={(e) => void updateThread({ model: e.target.value })}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="segmented" role="radiogroup" aria-label="Permissions">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={thread.permissionMode === m.id}
                    className={thread.permissionMode === m.id ? "on" : ""}
                    title={m.title}
                    disabled={running}
                    onClick={() => void updateThread({ permissionMode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {project && (
            <>
              <button
                className={`icon-button${inspectorOpen && inspectorTab === "changes" ? " active" : ""}`}
                title="Changes (⌘⇧D)"
                onClick={() => showInspector("changes")}
              >
                <IconDiff />
              </button>
              <button
                className={`icon-button${inspectorOpen && inspectorTab === "browser" ? " active" : ""}`}
                title="Browser (⌘⇧B)"
                onClick={() => showInspector("browser")}
              >
                <IconGlobe />
              </button>
            </>
          )}
        </header>

        {!project ? (
          <div className="empty">
            <div>
              <h1>Welcome to UnSkilled</h1>
              <p>Open a project folder to start. Claude works inside it, with the skilled workflow built in.</p>
              <button className="button primary" onClick={() => void addProject()}>
                <IconFolder /> Open Project…
              </button>
            </div>
          </div>
        ) : !thread ? (
          <div className="empty">
            <div>
              <h1>{project.name}</h1>
              <p>Start a thread to work in this project.</p>
              <button className="button primary" onClick={() => void newThread()}>
                <IconSparkle /> New Thread
              </button>
              <div className="hints">
                <Hint skill="skilled-setup" d="Set up the project docs and tracker, once per repo." />
                <Hint skill="domain-interview" d="Get interviewed on an idea before any code." />
                <Hint skill="implement" d="Build a ticket or a small change, test-first." />
              </div>
            </div>
          </div>
        ) : (
          <>
            <ThreadView threadId={thread.id} />
            <Composer threadId={thread.id} />
          </>
        )}
      </main>
      {inspectorVisible && <Inspector projectId={project?.id ?? null} />}
    </div>
  );
}

function Hint({ skill, d }: { skill: string; d: string }) {
  return (
    <button className="hint-card" onClick={() => void useStore.getState().newThread(skill)}>
      <div className="t">/{skill}</div>
      <div className="d">{d}</div>
    </button>
  );
}
