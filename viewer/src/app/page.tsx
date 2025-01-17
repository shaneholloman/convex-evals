import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { FolderIcon, ChevronRight } from 'lucide-react';

interface OutputDir {
  name: string;
  createdAt: Date;
  path: string;
}

async function getOutputDirectories(): Promise<OutputDir[]> {
  const workspaceRoot = process.cwd();
  const parentDir = path.join(workspaceRoot, '..');
  const entries = await fs.readdir(parentDir, { withFileTypes: true });
  
  const outputDirs = await Promise.all(
    entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('output-'))
      .map(async (entry) => {
        const fullPath = path.join(parentDir, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          createdAt: stats.birthtime,
          path: entry.name,
        };
      })
  );

  return outputDirs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export default async function Home() {
  const outputDirs = await getOutputDirectories();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="border-b pb-6">
        <h1 className="text-3xl font-bold text-gray-900">Test Output Viewer</h1>
        <p className="mt-2 text-base text-gray-600">
          View and analyze test results from evaluation runs
        </p>
      </div>

      <div className="rounded-xl border shadow-sm bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <ChevronRight className="h-5 w-5 text-gray-400" />
            Output Directories
            <span className="ml-2 text-sm font-normal text-gray-500">
              {outputDirs.length} total
            </span>
          </h2>
        </div>

        <div className="divide-y divide-gray-100">
          {outputDirs.map((dir) => (
            <Link
              key={dir.path}
              href={`/viewer/${dir.path}`}
              className="flex items-center gap-4 px-6 py-5 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                <FolderIcon className="h-6 w-6" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate text-lg">
                  {dir.name}
                </h3>
                <p className="text-sm text-gray-600">
                  Created {formatDate(dir.createdAt)}
                </p>
              </div>

              <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-500 transition-colors" />
            </Link>
          ))}

          {outputDirs.length === 0 && (
            <div className="px-6 py-16 text-center text-gray-500">
              <FolderIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg">No output directories found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 