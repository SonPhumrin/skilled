import { useCallback, useEffect, useState } from "react";
import type { DiffFile } from "../../../shared/types";
import { api } from "../api";
import { IconChevron, IconRefresh } from "../icons";
import { useStore } from "../store";

export function DiffPanel({ projectId }: { projectId: string }) {
  const diffVersion = useStore((s) => s.diffVersion);
  const [files, setFiles] = useState<DiffFile[] | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    void api().getDiff(projectId).then(setFiles);
  }, [projectId]);
  useEffect(load, [load, diffVersion]);

  const adds = files?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const dels = files?.reduce((n, f) => n + f.deletions, 0) ?? 0;

  return (
    <aside className="inspector">
      <div className="inspector-head drag">
        <strong>Changes</strong>
        <span className="grow" />
        <button className="icon-button" title="Refresh" onClick={load}>
          <IconRefresh />
        </button>
      </div>
      <div className="inspector-body">
        {files === null ? (
          <div className="diff-summary">Loading…</div>
        ) : files.length === 0 ? (
          <div className="diff-summary">No uncommitted changes.</div>
        ) : (
          <>
            <div className="diff-summary">
              {files.length} file{files.length === 1 ? "" : "s"} changed · <span style={{ color: "var(--success)" }}>+{adds}</span>{" "}
              <span style={{ color: "var(--danger)" }}>−{dels}</span>
            </div>
            {files.map((f) => {
              const open = !closed[f.path];
              return (
                <div className="diff-file" key={f.path}>
                  <button className="diff-file-head" onClick={() => setClosed((c) => ({ ...c, [f.path]: open }))}>
                    <IconChevron open={open} />
                    <span className="path" title={f.path}>
                      {f.path}
                    </span>
                    {f.status !== "modified" && <span className="badge">{f.status === "untracked" ? "new" : f.status}</span>}
                    <span className="adds">+{f.additions}</span>
                    <span className="dels">−{f.deletions}</span>
                  </button>
                  {open && (
                    <div className="diff-lines">
                      {f.hunks.map((h, i) => (
                        <div key={i}>
                          <div className="hunk">{h.header}</div>
                          {h.lines.map((l, j) => (
                            <div key={j} className={`line ${l.kind}`}>
                              {l.text}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}
