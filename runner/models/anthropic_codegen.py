from anthropic import Anthropic
import os
from bs4 import BeautifulSoup
from typing import Union
from . import ConvexCodegenModel, SYSTEM_PROMPT
from .guidelines import Guideline, GuidelineSection, CONVEX_GUIDELINES


class AnthropicModel(ConvexCodegenModel):
    def __init__(self, model: str):
        assert model in ["claude-3-5-sonnet-latest"]
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set")
        self.client = Anthropic(api_key=api_key)
        self.model = model

    def generate(self, prompt: str):
        user_prompt = USER_PROMPT_TEMPLATE % (prompt, CONVEX_GUIDELINES)
        message = self.client.messages.create(
            model=self.model,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": [{"type": "text", "text": user_prompt}]},
                {"role": "assistant", "content": [{"type": "text", "text": "<analysis>"}]},
            ],
            max_tokens=8192,
        )
        if len(message.content) != 1 or message.content[0].type != "text":
            raise ValueError("Message content is not text: %s" % message.content)

        soup = BeautifulSoup("<analysis>" + message.content[0].text, "html.parser")
        out = {}

        for file_tag in soup.find_all("file"):
            path = file_tag.attrs["path"]
            if not path:
                raise ValueError("File path is not set")

            out[path.strip()] = file_tag.text.strip()

        return out


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
    - Ensure your code is clear, efficient, concise, and innovative.
    - Maintain a friendly and approachable tone in any comments or documentation.
  </general_coding_standards>

  %s

Begin your response with your thought process, then proceed to generate the necessary files for the Convex backend.
"""


def render_guidelines(node: Union[GuidelineSection, Guideline], indentation=""):
    if isinstance(node, Guideline):
        yield indentation + "- "
        yield node.content
        yield "\n"
    else:
        yield indentation + f"<{node.name}>\n"
        for child in node.children:
            yield from render_guidelines(child, indentation + "  ")
        yield indentation + f"</{node.name}>\n"


ANTHROPIC_CONVEX_GUIDELINES = "".join(render_guidelines(CONVEX_GUIDELINES))
