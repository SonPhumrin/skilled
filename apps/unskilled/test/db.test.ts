import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../src/main/db";
import { tempDir } from "./helpers";

describe("Store", () => {
  it("keeps projects, threads, and ordered events", () => {
    const store = new Store(join(tempDir(), "t.db"));
    const p = store.addProject("/tmp/some/project");
    expect(store.addProject("/tmp/some/project").id).toBe(p.id); // idempotent
    expect(p.name).toBe("project");

    const t = store.createThread(p.id, "claude-opus-5", "ask");
    expect(store.listThreads(p.id).map((x) => x.id)).toEqual([t.id]);

    store.appendEvent(t.id, { kind: "user", text: "hi" });
    store.appendEvent(t.id, { kind: "assistant-text", text: "hello" });
    expect(store.listEvents(t.id).map((e) => [e.seq, e.event.kind])).toEqual([
      [1, "user"],
      [2, "assistant-text"],
    ]);

    const updated = store.updateThread(t.id, { sessionId: "s1", permissionMode: "full" });
    expect(store.getThread(t.id)).toMatchObject({ sessionId: "s1", permissionMode: "full", title: "New thread" });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(t.updatedAt);

    store.deleteThread(t.id);
    expect(store.listThreads(p.id)).toEqual([]);
    expect(store.listEvents(t.id)).toEqual([]);
    store.close();
  });
});
