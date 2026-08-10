export type FlowsView = "projects" | "components";

export function resolveFlowsView(
  value: string | string[] | undefined
): FlowsView {
  return value === "components" ? "components" : "projects";
}
