import os
import sys
import subprocess

name = sys.argv[1]
difficulty = sys.argv[2]

assert difficulty in ('trivial', 'easy', 'medium', 'hard')

if not os.path.exists(difficulty):
    os.makedirs(difficulty)

existing = [int(l.split('-')[0]) for l in os.listdir(difficulty)]

if existing:
    next_id = max(existing) + 1
else:
    next_id = 0

testdir_name = f'{next_id:03d}-{name}'

os.makedirs(os.path.join(difficulty, testdir_name))

with open(os.path.join(difficulty, testdir_name, 'PROMPT.txt'), 'w') as f:
    f.write(f'Create a backend for a {name} system.')

answer_dir = os.path.join(difficulty, testdir_name, 'answer')
os.makedirs(answer_dir)

package_json = """{
  "name": "convexbot",
  "version": "1.0.0",
  "dependencies": {
    "convex": "^1.17.4"
  }
}""".strip()

with open(os.path.join(answer_dir, 'package.json'), 'w') as f:    
    f.write(package_json)

convex_dir = os.path.join(answer_dir, 'convex')
os.makedirs(convex_dir)

with open(os.path.join(convex_dir, 'public.ts'), 'w') as f:
    f.write('import { v } from "convex/values"')
    f.write('import { query } from "./_generated/server"')
    
subprocess.run(['bun', 'install'], cwd=answer_dir, check=True)
subprocess.run(['bunx', 'convex', 'codegen'], cwd=answer_dir, check=True)