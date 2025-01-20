import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { Highlight, themes, type Language } from "prism-react-renderer";
import Link from "next/link";

function getLanguageFromFilename(filename: string): Language {
  const ext = path.extname(filename).toLowerCase();
  const langMap: { [key: string]: Language } = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".py": "python",
    ".md": "markdown",
    ".txt": "text",
  };
  return langMap[ext] || "text";
}

export default async function FilePage({
  params,
}: {
  params: { dir: string; path: string[] };
}) {
  const workspaceRoot = process.cwd();
  const paramsPath = params.path.map(decodeURIComponent);
  const filePath = path.join(
    workspaceRoot,
    "..",
    params.dir,
    "evals",
    ...paramsPath,
  );
  const content = await fs.readFile(filePath, "utf-8");
  const language = getLanguageFromFilename(paramsPath[paramsPath.length - 1]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link
          href={`/viewer/${params.dir}`}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to test results
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          {paramsPath[paramsPath.length - 1]}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {paramsPath.slice(0, -1).join("/")}
        </p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <Highlight theme={themes.github} code={content} language={language}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${className} p-4 overflow-auto`} style={style}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  <span className="text-gray-400 mr-4 text-xs select-none">
                    {(i + 1).toString().padStart(3, " ")}
                  </span>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
