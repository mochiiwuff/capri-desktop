// Runtime capabilities come from the main process, never from saved preferences.
export function unavailable(brain, feature) {
  return brain.system?.features?.[feature]?.status === 'unavailable';
}

export function featureMessage(brain, feature) {
  const system = brain.system;
  const value = system?.features?.[feature];
  if (!value || !system.text) return '';
  return `${system.text.features[feature]}: ${system.text.reasons[value.reason] || system.text.states[value.status]}`;
}
