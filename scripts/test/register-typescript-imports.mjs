import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const nodeModulesRoot = resolve(repositoryRoot, "node_modules");
const sourceExtensions = [".ts", ".tsx", ".js", ".mjs"];

function isInside(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== ".." && !isAbsolute(pathFromParent));
}

function candidatePaths(basePath) {
  if (extname(basePath)) return [basePath];
  return [basePath, ...sourceExtensions.map((extension) => `${basePath}${extension}`)];
}

function resolveExisting(basePath, context, nextResolve) {
  for (const candidate of candidatePaths(basePath)) {
    if (!isInside(repositoryRoot, candidate) || isInside(nodeModulesRoot, candidate) || !existsSync(candidate)) continue;
    try {
      return nextResolve(pathToFileURL(candidate).href, context);
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = resolve(repositoryRoot, specifier.slice(2));
      if (!isInside(repositoryRoot, target) || isInside(nodeModulesRoot, target)) {
        const error = new Error(`Import alias is outside the repository: ${specifier}`);
        error.code = "ERR_INVALID_MODULE_SPECIFIER";
        throw error;
      }
      const resolved = resolveExisting(target, context, nextResolve);
      if (resolved) return resolved;
      return nextResolve(pathToFileURL(target).href, context);
    }

    if (specifier.startsWith(".") && !extname(specifier)) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND" || !context.parentURL?.startsWith("file:")) throw error;
        const parentPath = fileURLToPath(context.parentURL);
        if (!isInside(repositoryRoot, parentPath) || isInside(nodeModulesRoot, parentPath)) throw error;
        const target = resolve(dirname(parentPath), specifier);
        const resolved = resolveExisting(target, context, nextResolve);
        if (resolved) return resolved;
        throw error;
      }
    }

    return nextResolve(specifier, context);
  }
});
