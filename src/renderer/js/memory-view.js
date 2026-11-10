export function memoryView(state, labels) {
  const facts = Array.isArray(state?.facts) ? state.facts : [];
  const activity = state?.activity || {};
  const apps = Object.values(activity.apps || {})
    .sort((a, b) => Number(b.totalMs || 0) - Number(a.totalMs || 0))
    .slice(0, 8)
    .map((item) => `• ${item.label} — ${labels.duration(Math.round(Number(item.totalMs || 0) / 60000))}`);
  const allRoutines = Array.isArray(activity.routines) ? activity.routines : [];
  const routines = allRoutines.slice()
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .slice(0, 4)
    .map((item) => `• ${labels.routines[item.routine] || labels.routines.general}: ${item.count}`);
  const learnedFacts = facts.slice(0, 10).map((fact) =>
    `• ${labels.categories[fact.category] || labels.categories.general}: ${fact.text}`);
  const reply = [
    `${labels.facts} (${facts.length})`,
    ...(learnedFacts.length ? learnedFacts : [labels.noFacts]),
    ...(facts.length > learnedFacts.length ? [labels.more(facts.length - learnedFacts.length)] : []),
    '',
    `${labels.activity} — ${activity.enabled ? labels.activityOn : labels.activityOff}`,
    ...(apps.length ? apps : [labels.noApps]),
    ...(Object.keys(activity.apps || {}).length > apps.length ? [labels.more(Object.keys(activity.apps).length - apps.length)] : []),
    ...(routines.length ? ['', labels.patterns, ...routines] : []),
    ...(allRoutines.length > routines.length ? [labels.more(allRoutines.length - routines.length)] : []),
  ].join('\n');
  return { line: labels.title, reply };
}
