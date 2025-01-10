import os
import sys
from anthropic import Anthropic
from dotenv import load_dotenv
import xml.etree.ElementTree as ET
from io import StringIO
from xml.parsers.expat import ExpatError

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
   - Use <File path="file_path" /> syntax to output each file.

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

def run_test(test_dir: str, client: Anthropic):
    with open(f"{test_dir}/PROMPT.txt", "r") as f:
        prompt = f.read()

    user_prompt = USER_PROMPT_TEMPLATE % prompt

    stream = client.messages.create(
        model="claude-3-5-sonnet-latest",
        system=SYSTEM_PROMPT,
        messages=[            
            {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
            {"role": "assistant", "content": [{"type": "text", "text": "<analysis>"}]}
        ],
        max_tokens=4096,
        stream=True
    )

    first = next(stream)
    if first.type != 'message_start':
        raise ValueError("First message is not a message start: %s" % first)

    content_start = next(stream)
    if content_start.type != 'content_block_start':
        raise ValueError("Content start is not a content start: %s" % content_start)
    if content_start.content_block.type != 'text':
        raise ValueError("Content start is not a text: %s" % content_start)
    text = '<analysis>' + content_start.content_block.text

    event = next(stream)
    while event.type == 'content_block_delta':    
        print(f"Received {len(event.delta.text)} bytes")
        text += event.delta.text
        event = next(stream)

    if event.type != 'content_block_stop':
        raise ValueError("Content block stop is not a content block stop: %s" % event)

    event = next(stream)
    if event.type != 'message_delta':
        raise ValueError("End turn is not an end turn: %s" % event)
    if event.delta.stop_reason != 'end_turn':
        raise ValueError("End turn is not an end turn: %s" % event)

    output_tokens = event.usage.output_tokens
    print(f"Output tokens: {output_tokens}")
    print(text)

    event = next(stream)
    if event.type != 'message_stop':
        raise ValueError("Message stop is not a message stop: %s" % event)

if __name__ == "__main__":
    load_dotenv()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key is None:
        raise ValueError("ANTHROPIC_API_KEY is not set")
    client = Anthropic(api_key=api_key)

    test_dir = sys.argv[1]
    print(f"Running {test_dir}")
    run_test(test_dir, client)