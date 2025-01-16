import openai
import os
from . import ConvexCodegenModel, SYSTEM_PROMPT    
import re
from markdown_it import MarkdownIt
from markdown_it.token import Token

class OpenAIModel(ConvexCodegenModel):
    def __init__(self, model: str):
        assert model in ["gpt-4o", "gpt-4o-mini", 'o1', 'o1-mini']
        self.chain_of_thought = 'o1' not in model
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set")

        self.client = openai.OpenAI(api_key=api_key)
        self.model = model

    def generate(self, prompt: str):      
        if self.chain_of_thought:            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": 'system', "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt(prompt, self.chain_of_thought)}
                ],
                max_tokens=16384,
            )
            return self._parse_response(response.choices[0].message.content)
        else:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": 'user', "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt(prompt, self.chain_of_thought)}
                ],
                max_completion_tokens=16384,
            )
            return self._parse_response(response.choices[0].message.content)

    def _parse_response(self, response: str):
        md = MarkdownIt()
        tokens = md.parse(response)
        
        files = {}
        current_file = None
        in_files_section = False
        code_lang = None
        
        for i, token in enumerate(tokens):
            if token.type == 'heading_open' and token.tag == 'h1':
                title_token = tokens[i + 1]
                if title_token.content == 'Files':
                    in_files_section = True
                    continue
            
            if not in_files_section:
                continue
                
            if token.type == 'heading_open' and token.tag == 'h2':
                title_token = tokens[i + 1]
                current_file = title_token.content.strip()
            elif token.type == 'fence' and current_file:
                code_lang = token.info
                files[current_file] = token.content.strip()
                current_file = None
                
        return files

TASK_INSTRUCTION = """
Your task is to generate a Convex backend based on the following task description:
```
%s
```
"""

CHAIN_OF_THOUGHT_ANALYSIS_INSTRUCTION = """
Before writing any code, analyze the task and think through your approach. Start with an h1 Analysis
section to show your thought process, covering the following areas:
1. Summarize the task requirements
2. List out the main components needed for the backend
3. Design the public API:
   - List each function with its purpose and expected arguments
4. Plan the schema design (if needed):
   - List each table with its fields and types
5. Outline background processing requirements (if any):

After your analysis, output all files within an h1 Files section that has an h2 section for 
each necessary file for a Convex backend that implements the requested functionality. 
For example, correct output looks like

# Analysis
...
# Files
## package.json
```
...
```
## convex/schema.ts
```
...
```
"""

REASONING_ANALYSIS_INSTRUCTION = """
Output all files within an h1 Files section that has an h2 section for 
each necessary file for a Convex backend that implements the requested functionality. 
For example, correct output looks like

# Files
## package.json
```
...
```
## convex/schema.ts
```
...
```
"""

GUIDELINES_INSTRUCTION = """
# Guidelines
## File structure
- You can write to `package.json` and any files within the `convex/` folder.
- Do NOT write to the `convex/_generated` folder. You can assume that `npx convex dev` will populate this folder.
- Structure your output in Markdown with an h2 section per file, the file's path as the section title, and the file's 
  contents as a code block within the section.
- Always start with a `package.json` file.
- Use Convex version "^1.17.4".

## General coding standards
- Use 2 spaces for code indentation.
- Ensure your code is clear, efficient, concise, and innovative.
- Maintain a friendly and approachable tone in any comments or documentation.

## Convex specific guidelines
### Function guidelines
#### New function syntax
ALWAYS use the new function syntax for Convex functions. For example:
  ```typescript
  import { query } from "./_generated/server";
  import { v } from "convex/values";
  export const f = query({
      args: {},
      returns: v.null(),
      handler: async (ctx, args) => {
      // Function body
      },
  });
  ```
#### HTTP endpoints
HTTP endpoints are defined in `convex/http.ts` and require an `httpAction` decorator. For example:
```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
const http = httpRouter();
http.route({
    path: "/echo",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
    const body = await req.bytes();
    return new Response(body, { status: 200 });
    }),
});
```
For simple HTTP routes, define the handler directly within the route definition.

#### Function calling
- Use `ctx.runQuery` to call a query from a mutation or action.
- Use `ctx.runMutation` to call a mutation from an action.
- Try to use as few calls from actions to queries and mutations as possible. Queries
  and mutations are transactions, so splitting logic up into multiple calls introduces
  the risk of race conditions.
- Use `ctx.runAction` to call an action from an action. ONLY call an action from another
  action if you need to cross runtimes (e.g. from V8 to Node). Otherwise, pull out the
  shared code into a helper async function and call that directly instead.
- All of these calls take in a `FunctionReference`. Do NOT try to pass the callee 
  function directly into one of these calls.

#### Function references    
- Function references are pointers to registered Convex functions.
- Use the `api` object defined by the framework in `convex/_generated/api.ts` to call public functions
  registered with `query`, `mutation`, or `action`.
- Use the `internal` object defined by the framework in `convex/_generated/api.ts` to call internal 
  (or private) functions registered with `internalQuery`, `internalMutation`, or `internalAction`.              
- Convex uses file-based routing, so a public function defined in `convex/public.ts` named `f` has
  a function reference of `api.public.f`.
- A private function defined in `convex/private.ts` named `g` has a function reference of 
  `internal.private.g`.
- Functions can also registered within directories nested within the `convex/` folder. For example,
  a public function `h` defined in `convex/messages/access.ts` has a function reference of
  `api.messages.access.h`.

#### API design
- Convex uses file-based routing, so thoughtfully organize files with public query, mutation,
  or action functions within the `convex/` directory.
- Use `query`, `mutation`, and `action` to define public functions.
- Use `internalQuery`, `internalMutation`, and `internalAction` to define private, internal functions.

### Validator guidelines
- `v.bigint()` is deprecated for representing signed 64-bit integers. Use `v.int64()` instead.

### Schema guidelines
- Always define your schema in `convex/schema.ts`.
- Always import the schema definition functions from `convex/server`:
  ```typescript
  import { defineSchema, defineTable } from "convex/server";
  import { v } from "convex/values";

  export default defineSchema({
    exampleTable: defineTable({
      exampleField: v.string(),
    }),
  });
  ```                  

### Query guidelines
- Do NOT use `filter` in queries. Instead, define an index in the schema and use `withIndex` instead.
- Convex queries do NOT support `.delete()`. Instead, `.collect()` the results, iterate over them, and call `ctx.db.delete(row._id)` on each result.

### Mutation guidelines
- Use `ctx.db.replace` to fully replace an existing document. This method will throw an error if the document does not exist.
- Use `ctx.db.patch` to shallow merge updates into an existing document. This method will throw an error if the document does not exist.
"""

def chain_of_thought_prompt(prompt: str):
    yield TASK_INSTRUCTION % prompt
    yield CHAIN_OF_THOUGHT_ANALYSIS_INSTRUCTION
    yield GUIDELINES_INSTRUCTION
    yield "Begin your response with your thought process, then proceed to generate the necessary files for the Convex backend."

def reasoning_prompt(prompt: str):
    yield TASK_INSTRUCTION % prompt
    yield REASONING_ANALYSIS_INSTRUCTION
    yield GUIDELINES_INSTRUCTION

def user_prompt(prompt: str, chain_of_thought: bool = True):    
    if chain_of_thought:
        return '\n'.join(chain_of_thought_prompt(prompt))
    else:
        return '\n'.join(reasoning_prompt(prompt))
