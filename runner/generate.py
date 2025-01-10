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
   - List each background task with its trigger and purpose

After your analysis, generate the necessary files for a Convex backend that implements the requested functionality. Use the following guidelines:

1. File Structure:
   - You can write to `package.json` and any files within the `convex/` folder.
   - Do NOT write to the `convex/_generated` folder. You can assume that `npx convex dev` will populate this folder.
   - Use <file path="file_path" /> syntax to output each file.

2. Version and Dependencies:
   - Always start with a `package.json` file.
   - Use Convex version "^1.17.4".

3. Coding Standards:
   - Always use the new function syntax for Convex functions. For example:
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
   - Use 2 spaces for code indentation.

4. Best Practices:
   - Ensure your code is clear, efficient, concise, and innovative.
   - Maintain a friendly and approachable tone in any comments or documentation.

Begin your response with your thought process, then proceed to generate the necessary files for the Convex backend.
"""    