/**
 * pre-publish guard, run by `npm publish` through `prepublishOnly`.
 *
 * Refuses to publish while the manifest points at a placeholder owner or a
 * repository name that no longer matches the package. Both are silent
 * mistakes: npm accepts them, and the mistake only shows up on the listing,
 * where the npm package and its repository fail to link.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const folder = basename(root);
const problems = [];

if (pkg.name !== folder) problems.push(`package name "${pkg.name}" does not match the folder "${folder}"`);

const repository = pkg.repository?.url ?? "";
if (!repository.includes("github.com")) problems.push("repository.url does not name a GitHub host");
else if (!repository.endsWith(`${pkg.name}.git`)) {
  problems.push(`repository.url must end with "${pkg.name}.git" (got "${repository}")`);
}

const homepage = pkg.homepage ?? "";
if (!homepage.includes(`/${pkg.name}`)) problems.push(`homepage does not point at "/${pkg.name}"`);

if (pkg.private) problems.push("private is set");

for (const problem of problems) console.error(`[prepublish] ${problem}`);
process.exit(problems.length === 0 ? 0 : 1);
