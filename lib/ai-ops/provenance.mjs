const eventTypes = new Set(['response_item','event_msg','user','assistant']);
const channels = new Set(['final','commentary','analysis','summary']);
const contentTypes = new Set(['text','input_text','output_text']);
export function validProvenance(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(k => ['eventType','channel','synthetic','contentTypes'].includes(k)) &&
    (value.eventType === undefined || eventTypes.has(value.eventType)) &&
    (value.channel === undefined || channels.has(value.channel)) &&
    (value.synthetic === undefined || typeof value.synthetic === 'boolean') &&
    (value.contentTypes === undefined || (Array.isArray(value.contentTypes) && value.contentTypes.length <= 3 && value.contentTypes.every(t => contentTypes.has(t))));
}
export function sourceDescriptor(entry, content, channel) {
  return {
    ...(eventTypes.has(entry.type) ? {eventType:entry.type} : {}),
    ...(channels.has(channel) ? {channel} : {}),
    synthetic: !!(entry.isSynthetic || entry.isMeta || entry.isCompactSummary),
    contentTypes: [...new Set(Array.isArray(content) ? content.map(x=>x?.type).filter(t=>contentTypes.has(t)) : ['text'])],
  };
}
