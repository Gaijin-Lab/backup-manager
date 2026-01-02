import fg from "fast-glob";
import path from "path";

export type FileEntry = {
  absPath: string;
  relPath: string;
};

export async function scanSources(
  sources: string[],
  ignore: string[]
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  for (const src of sources) {
    const patterns = ["**/*"];
    const files = await fg(patterns, {
      cwd: src,
      onlyFiles: true,
      dot: true,
      ignore,
      followSymbolicLinks: false,
    });

    for (const rel of files) {
      entries.push({
        absPath: path.join(src, rel),
        relPath: `${path.basename(src)}/${rel}`.replace(/\\/g, "/"),
      });
    }
  }

  return entries;
}
