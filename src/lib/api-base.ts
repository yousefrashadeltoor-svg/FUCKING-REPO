// Compatibility only: there is no remote application API.
export function apiBase(): string { return ""; }
export function isApiOnlyStatic(): boolean { return false; }
export function apiUrl(url: string): string { return url; }
