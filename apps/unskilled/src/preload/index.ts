import { contextBridge, ipcRenderer } from "electron";
import type { LiveUpdate, UnskilledApi } from "../shared/types";

const api: UnskilledApi = {
  platform: process.platform,
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: () => ipcRenderer.invoke("projects:add"),
  listThreads: (projectId) => ipcRenderer.invoke("threads:list", projectId),
  createThread: (projectId, agent) => ipcRenderer.invoke("threads:create", projectId, agent),
  updateThread: (threadId, patch) => ipcRenderer.invoke("threads:update", threadId, patch),
  deleteThread: (threadId) => ipcRenderer.invoke("threads:delete", threadId),
  listEvents: (threadId) => ipcRenderer.invoke("events:list", threadId),
  listSkills: () => ipcRenderer.invoke("skills:list"),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  send: (request) => ipcRenderer.invoke("turn:send", request),
  interrupt: (threadId) => ipcRenderer.invoke("turn:interrupt", threadId),
  respondPermission: (requestId, decision) => ipcRenderer.invoke("permission:respond", requestId, decision),
  getDiff: (projectId) => ipcRenderer.invoke("diff:get", projectId),
  browserAttached: (webContentsId) => ipcRenderer.invoke("browser:attached", webContentsId),
  browserPick: () => ipcRenderer.invoke("browser:pick"),
  onUpdate: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, update: LiveUpdate) => listener(update);
    ipcRenderer.on("unskilled:update", handler);
    return () => ipcRenderer.removeListener("unskilled:update", handler);
  },
};

contextBridge.exposeInMainWorld("unskilled", api);
