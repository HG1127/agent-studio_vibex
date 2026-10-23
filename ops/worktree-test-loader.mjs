// Read-only test-time resolution of two declared, pinned optional packages.
// Handles Git worktrees whose node_modules is a junction into a shared parent.
// Does not install, delete, or modify any module directory.
import { registerHooks } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
const packages = {
  exceljs: { range: manifest.dependencies?.exceljs, entry: "excel.js" },
  playwright: { range: manifest.devDependencies?.playwright, entry: "index.mjs" },
}
function exactEntry(name) {
  const item = packages[name]
  if (!item) return ""
  const match = /^(?:[~^])?(\d+\.\d+\.\d+)$/.exec(String(item.range || ""))
  if (!match) throw Error("worktree_test_dependency_not_pinned: " + name)
  const absolute = path.join(root, "node_modules", ".pnpm",
    name + "@" + match[1], "node_modules", name, item.entry)
  if (!fs.existsSync(absolute))
    throw Error("worktree_test_dependency_unavailable: " + name + "@" + match[1])
  return absolute
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!Object.hasOwn(packages, specifier)) return nextResolve(specifier, context)
    try {
      // Prefer properly installed node_modules when it is present.
      return nextResolve(specifier, context)
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error
      return nextResolve(pathToFileURL(exactEntry(specifier)).href, context)
    }
  },
})
