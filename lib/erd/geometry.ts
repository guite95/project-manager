export const ENTITY_HEADER = 58;
export const ENTITY_ROW = 23;
export const ENTITY_FOOTER = 27;
export const entityHeight = (fieldCount: number) => ENTITY_HEADER + ENTITY_ROW * fieldCount + ENTITY_FOOTER + 2;
