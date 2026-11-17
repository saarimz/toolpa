import { readdirSync, readFileSync, statSync } from 'node:fs';

const ALLOWED = new Set([
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'LGPL-2.0-only',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'ISC',
  '0BSD',
  'BlueOak-1.0.0',
  'Unlicense',
  'OFL-1.1',
]);

export interface LicenseEntry {
  name: string;
  license?: string;
  firstParty: boolean;
}

export function licenseText(license: unknown): string {
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && 'type' in license && typeof license.type === 'string') return license.type;
  return '';
}

export function auditEntry(entry: LicenseEntry): string | null {
  const license = entry.license ?? '';
  if (entry.firstParty) {
    return license === 'GPL-3.0-or-later' ? null : `${entry.name} is ${license || 'unlicensed'}, expected GPL-3.0-or-later`;
  }
  if (/AGPL/i.test(license) || !ALLOWED.has(license)) {
    return `${entry.name} license ${license || 'missing'} is not a GPL-compatible license`;
  }
  return null;
}

function readPackage(path: string): { name?: string; license?: unknown; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof readPackage>;
  } catch {
    return null;
  }
}

function dependencyLicense(root: string, name: string): string {
  const candidates = [
    `${root}/node_modules/${name}/package.json`,
    ...readdirSync(`${root}/packages`).map((pkg) => `${root}/packages/${pkg}/node_modules/${name}/package.json`),
    ...readdirSync(`${root}/apps`).map((app) => `${root}/apps/${app}/node_modules/${name}/package.json`),
  ];
  for (const path of candidates) {
    try {
      statSync(path);
      const pkg = readPackage(path);
      if (pkg) return licenseText(pkg.license);
    } catch {
      // The next candidate is a different install layout.
    }
  }
  return '';
}

export function workspaceLicenses(root: string): LicenseEntry[] {
  const manifests = [
    `${root}/package.json`,
    ...readdirSync(`${root}/packages`).map((name) => `${root}/packages/${name}/package.json`),
    ...readdirSync(`${root}/apps`).map((name) => `${root}/apps/${name}/package.json`),
  ];
  const entries: LicenseEntry[] = [];
  for (const path of manifests) {
    const pkg = readPackage(path);
    if (!pkg?.name) continue;
    entries.push({ name: pkg.name, license: licenseText(pkg.license), firstParty: true });
    const deps = { ...pkg.devDependencies, ...pkg.dependencies };
    for (const [name, range] of Object.entries(deps)) {
      if (range.startsWith('workspace:')) continue;
      entries.push({ name, license: dependencyLicense(root, name), firstParty: false });
    }
  }
  return entries;
}

export function auditWorkspace(root: string): string[] {
  return workspaceLicenses(root).map(auditEntry).filter((problem): problem is string => problem !== null);
}
