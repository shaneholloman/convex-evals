import { promises as fs } from 'fs';
import path from 'path';
import { formatDate } from '@/lib/utils';
import DirectoryList from '@/components/DirectoryList';

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

      <DirectoryList directories={outputDirs} />
    </div>
  );
} 