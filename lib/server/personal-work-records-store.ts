import { prisma } from "../db.ts";
import { PERSONAL_WORK_RECORDS_KEY, parsePersonalWorkRecords } from "../personal-work-records.ts";

export async function loadPersonalWorkRecords() {
  const row = await prisma.appSetting.findUnique({ where: { key: PERSONAL_WORK_RECORDS_KEY } });
  return row ? parsePersonalWorkRecords(row.value) : null;
}
