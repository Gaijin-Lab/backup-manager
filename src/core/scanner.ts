import fg from "fast-glob";
import path from "path";

export type FileEntry = {
  absPath: string;
  relPath: string;
  sourceRoot: string;
  sourceParent: string;
};

export async function scanSources(
  sources: string[],
  ignore: string[]
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  for (const src of sources) {
    const sourceRoot = path.resolve(src);
    const sourceParent = path.dirname(sourceRoot);
    const sourceBase = path.basename(sourceRoot);
    const patterns = ["**/*"];
    const files = await fg(patterns, {
      cwd: sourceRoot,
      onlyFiles: true,
      dot: true,
      ignore,
      followSymbolicLinks: false,
    });

    for (const rel of files) {
      entries.push({
        absPath: path.join(sourceRoot, rel),
        relPath: `${sourceBase}/${rel}`.replace(/\\/g, "/"),
        sourceRoot,
        sourceParent,
      });
    }
  }

  return entries;
}
