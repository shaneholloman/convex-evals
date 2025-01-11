import os
import time
from bs4 import BeautifulSoup
from anthropic import Anthropic

def generate(input_dir: str, output_dir: str, client: Anthropic):
    start = time.time()

    with open(f"{input_dir}/PROMPT.txt", "r") as f:
        prompt = f.read()

    user_prompt = USER_PROMPT_TEMPLATE % prompt

    message = client.messages.create(
        model="claude-3-5-sonnet-latest",
        system=SYSTEM_PROMPT,
        messages=[            
            {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
            {"role": "assistant", "content": [{"type": "text", "text": "<analysis>"}]}
        ],
        max_tokens=4096,        
    )
    if len(message.content) != 1 or message.content[0].type != 'text':
        raise ValueError("Message content is not text: %s" % message.content)

    soup = BeautifulSoup('<analysis>' + message.content[0].text, 'html.parser')
    
    project_dir = os.path.abspath(os.path.join(output_dir, 'project'))
    os.makedirs(project_dir, exist_ok=True)

    generated = 0
    for file_tag in soup.find_all('file'):
        path = file_tag.attrs['path']
        if not path:
            raise ValueError("File path is not set")

        print(f"Writing {path}...")
        abs_file_path = os.path.abspath(os.path.join(project_dir, path))        
        
        if not abs_file_path.startswith(project_dir):
            raise ValueError(f"File path {abs_file_path} is not underneath {project_dir}")

        os.makedirs(os.path.dirname(abs_file_path), exist_ok=True)

        with open(abs_file_path, "w") as f:
            f.write(file_tag.text.strip())
            generated += len(file_tag.text)

    print(f"Generated {generated} bytes in {time.time() - start} seconds to {output_dir}")    

SYSTEM_PROMPT = "You are convexbot, a highly advanced AI programmer specialized in creating backend systems using Convex."

USER_PROMPT_TEMPLATE = """
Your task is to generate a Convex backend based on the following task description:
<task_description>
%s
</task_description>

Before writing any code, analyze the task and think through your approach. Use <analysis> tags to show your thought process, covering the following areas:

1. Summarize the task requirements
2. List out the main components needed for the backend
3. Design the public API:
   - List each function with its purpose and expected arguments
4. Plan the schema design (if needed):
   - List each table with its fields and types
5. Outline background processing requirements (if any):

After your analysis, generate the necessary files for a Convex backend that implements the requested functionality. 

<guidelines>
  <file_structure>
   - You can write to `package.json` and any files within the `convex/` folder.
   - Do NOT write to the `convex/_generated` folder. You can assume that `npx convex dev` will populate this folder.
   - Use <file path="file_path" /> syntax to output each file.
   - Always start with a `package.json` file.
   - Use Convex version "^1.17.4".
  </file_structure>

  <general_coding_standards>
    - Use 2 spaces for code indentation.
  </general_coding_standards>

  <guidelines>
    <function_guidelines>
        <new_function_syntax>
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
        </new_function_syntax>
        <http_endpoint_syntax>
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
        </http_endpoint_syntax>
        <function_calling>
            - Use `ctx.runQuery` to call a query from a mutation or action.
            - Use `ctx.runMutation` to call a mutation from an action.
            - Try to use as few calls from actions to queries and mutations as possible. Queries
              and mutations are transactions, so splitting logic up into multiple calls introduces
              the risk of race conditions.
            - Use `ctx.runAction` to call an action from an action. ONLY call an action from another
            action if you need to cross runtimes (e.g. from V8 to Node). Otherwise, pull out the
            shared code into a helper async function and call that directly instead.        
            - All of these calls take in a `FunctionReference` from the `api` and `internal` objects
              defined by the framework in `convex/_generated/api.ts`. If you're calling a public
              function (i.e. one defined with `query`, `mutation`, or `action`), use the `api` object.
              If you're calling an internal function (i.e. one defined with `internalQuery`, 
              `internalMutation`, or `internalAction`), use the `internal` object. Do NOT try to
              pass the callee function directly into one of these calls.
        </function_calling>
        <api_design>
        - Convex uses file-based routing, so thoughtfully organize files with public query, mutation,
            or action functions within the `convex/` directory.
        </api_design>
    </function_guidelines>
    <schema_guidelines>
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
    </schema_guidelines>
    <query_guidelines>
        - Do NOT use `filter` in queries. Instead, define an index in the schema and use `withIndex` instead.
        - Convex queries do NOT support `.delete()`. Instead, `.collect()` the results, iterate over them, and call `ctx.db.delete(row._id)` on each result.
    </query_guidelines>
    <mutation_guidelines>
        - Use `ctx.db.replace` to fully replace an existing document. This method will throw an error if the document does not exist.
        - Use `ctx.db.patch` to shallow merge updates into an existing document. This method will throw an error if the document does not exist.
    </mutation_guidelines>
</guidelines>

<best_practices>
  - Ensure your code is clear, efficient, concise, and innovative.
  - Maintain a friendly and approachable tone in any comments or documentation.
</best_practices>

Begin your response with your thought process, then proceed to generate the necessary files for the Convex backend.
"""    