export function onlyDigits(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

export function optionalText(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

export function optionalDate(value: unknown): string | null {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function hasAnyValue(payload: Record<string, unknown>): boolean {
  return Object.values(payload).some((value) => {
    if (value == null) {
      return false;
    }

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    return Boolean(value);
  });
}
