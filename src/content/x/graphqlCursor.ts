function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function findBottomCursor(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (stringValue(value.cursorType)?.toLowerCase() === 'bottom' && stringValue(value.value)) {
    return stringValue(value.value) ?? null;
  }

  if (typeof value.entryId === 'string' && value.entryId.toLowerCase().includes('cursor-bottom')) {
    const content = isRecord(value.content) ? value.content : undefined;
    const cursorValue = stringValue(content?.value) ?? stringValue(value.value);
    if (cursorValue) {
      return cursorValue;
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        const cursor = findBottomCursor(item);
        if (cursor) {
          return cursor;
        }
      }
      continue;
    }

    const cursor = findBottomCursor(nestedValue);
    if (cursor) {
      return cursor;
    }
  }

  return null;
}

export function updateGraphqlCursorUrl(url: string, cursor: string, baseUrl = 'https://x.com') {
  const resolvedUrl = new URL(url, baseUrl);
  const variables = JSON.parse(resolvedUrl.searchParams.get('variables') ?? '{}') as Record<string, unknown>;
  variables.cursor = cursor;
  resolvedUrl.searchParams.set('variables', JSON.stringify(variables));
  return resolvedUrl.toString();
}

export function removeGraphqlCursor(url: string, baseUrl = 'https://x.com') {
  const resolvedUrl = new URL(url, baseUrl);
  const variables = JSON.parse(resolvedUrl.searchParams.get('variables') ?? '{}') as Record<string, unknown>;
  delete variables.cursor;
  resolvedUrl.searchParams.set('variables', JSON.stringify(variables));
  return resolvedUrl.toString();
}
