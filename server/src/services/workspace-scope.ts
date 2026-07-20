export function workspaceScope(workspaceId: string) {
  return {
    OR: [{ workspaceId }, { workspaceId: null }],
  };
}

export function workspaceStrictScope(workspaceId: string) {
  return { workspaceId };
}
