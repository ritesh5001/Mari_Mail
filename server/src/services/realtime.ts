import type { Server } from "socket.io";

let io: Server | null = null;

export function setRealtimeServer(server: Server) {
  io = server;
}

export function emitWorkspaceEvent(workspaceId: string, event: string, payload: unknown) {
  io?.to(`workspace:${workspaceId}`).emit(event, payload);
}
