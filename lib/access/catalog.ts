import { currentActor } from './http';
import { canProject } from './policy';
import { getFlowCatalog } from '../server/flow-catalog-store';
export async function accessibleCatalog() {
  const actor=await currentActor();
  if(!actor) return [];
  return (await getFlowCatalog()).filter(project=>canProject(actor,project.slug,'read'));
}
