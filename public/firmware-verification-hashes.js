export function verificationHashParts(key) {
  const match = /^fw2\|(mediatek|pioneer)\|(.+)$/.exec(key || '');
  if (!match) return [];
  if (match[1] === 'mediatek' && /^[a-f0-9]{64}$/.test(match[2])) return [['Image SHA-256', match[2]]];
  if (match[1] === 'pioneer') {
    const components = match[2].split(':');
    if (components.length === 2 && (!components[0] || /^[a-f0-9]{64}$/.test(components[0])) && /^[a-f0-9]{64}$/.test(components[1])) {
      return [...(components[0] ? [['Kernel SHA-256', components[0]]] : []), ['Normal SHA-256', components[1]]];
    }
  }
  return [];
}
