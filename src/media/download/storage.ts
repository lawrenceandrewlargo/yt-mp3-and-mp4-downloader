import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, stat } from 'node:fs/promises';
import { safeFilename, within } from '../../lib/security';

export async function publishFile(source: string, root: string, type: 'audio' | 'video', title: string, ext: string, behavior: 'rename' | 'skip' | 'overwrite') {
  const directory = within(root, type); await mkdir(directory, { recursive: true });
  const actualRoot = await realpath(root), actualDirectory = await realpath(directory);
  within(actualRoot, actualDirectory);
  const base = safeFilename(title);
  for (let suffix = 0; suffix < 10000; suffix++) {
    const filename = `${base}${suffix ? ` (${suffix + 1})` : ''}.${ext}`;
    const destination = within(actualDirectory, filename);
    try {
      if (behavior === 'overwrite') {
        // An explicit user preference. Reject symlinks outside the storage root.
        try { within(actualRoot, await realpath(destination)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        await copyFile(source, destination);
      } else await copyFile(source, destination, constants.COPYFILE_EXCL);
      return { filename, relativePath: `${type}/${filename}`, skipped: false };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (behavior === 'skip') {
        within(actualRoot, await realpath(destination));
        if (!(await stat(destination)).isFile()) throw new Error('An existing output is not a regular file.');
        return { filename, relativePath: `${type}/${filename}`, skipped: true };
      }
    }
  }
  throw new Error('Too many files share this name.');
}
