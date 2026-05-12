export function toCamelCase(value: string) {
  return value.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

export function toPascalCase(value: string) {
  const camel = toCamelCase(value);
  return `${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

export function escapeString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
