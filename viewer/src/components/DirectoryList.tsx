'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FolderIcon, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface OutputDir {
  name: string;
  createdAt: Date;
  path: string;
}

interface DirectoryListProps {
  directories: OutputDir[];
}

export default function DirectoryList({ directories }: DirectoryListProps) {
  const router = useRouter();
  const [selectedDirs, setSelectedDirs] = useState<string[]>([]);

  const handleDirSelect = (path: string) => {
    setSelectedDirs(prev => {
      if (prev.includes(path)) {
        return prev.filter(p => p !== path);
      }
      if (prev.length < 2) {
        return [...prev, path];
      }
      return [prev[1], path]; // Replace oldest selection
    });
  };

  const handleCompare = () => {
    if (selectedDirs.length === 2) {
      router.push(`/compare/${selectedDirs[0]}/${selectedDirs[1]}`);
    }
  };

  return (
    <>
      {selectedDirs.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-blue-700">
              {selectedDirs.length === 1 
                ? "Select one more directory to compare"
                : "Ready to compare"}
            </p>
            <p className="text-sm text-blue-600">
              Selected: {selectedDirs.join(" vs ")}
            </p>
          </div>
          {selectedDirs.length === 2 && (
            <button
              onClick={handleCompare}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Compare Results
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border shadow-sm bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <ChevronRight className="h-5 w-5 text-gray-400" />
            Output Directories
            <span className="ml-2 text-sm font-normal text-gray-500">
              {directories.length} total
            </span>
          </h2>
        </div>

        <div className="divide-y divide-gray-100">
          {directories.map((dir) => (
            <div
              key={dir.path}
              className="flex items-center gap-4 px-6 py-5 hover:bg-gray-50 transition-colors group"
            >
              <input
                type="checkbox"
                checked={selectedDirs.includes(dir.path)}
                onChange={() => handleDirSelect(dir.path)}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              
              <Link
                href={`/viewer/${dir.path}`}
                className="flex flex-1 items-center gap-4"
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
            </div>
          ))}

          {directories.length === 0 && (
            <div className="px-6 py-16 text-center text-gray-500">
              <FolderIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg">No output directories found</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
} 