import json
from groq import Groq
from anthropic import Anthropic
from app.config import settings
from loguru import logger


SYSTEM_PROMPT = """You are a Senior Legal-Tech Clerk for the Centre for e-Governance. Your task is to analyze Indian Court Judgments and extract structured data per the CCMS-AI Agent Protocol.

EXTRACTION REQUIREMENTS:
1. Case Identity: Case Type, Number, Year, Bench, Judge, and the Respondent Department (e.g., Department of Collegiate Education)
2. The Verdict: Determine if the petition was 'Allowed', 'Dismissed', or 'Disposed with Directions'
3. Operative Paragraphs: Identify specific paragraph numbers where the judge issues directions

ACTION PLAN LOGIC:
1. Compliance: Do NOT simply extract the order. Convert every directive into a Sequential Task List with three roles:
   - Administrative: Notify the responsible officer of the deadline
   - Operational: Submit weekly progress reports and execute compliance
   - Legal: Draft the final report/Charge Sheet/Affidavit for court submission
2. Departmental Sub-tasks: When the court orders an affidavit or report, break it into department-specific tasks:
   - IT Department: Provide technical architecture
   - Legal Cell: Identify pending cases, prepare legal documents
   - Personnel Department: Designate Nodal Officers
3. Streamlining: If the court critiques "routine file movement" or delays, create internal action items for streamlining approvals
4. Appeals: Check limitation period. If condonation of delay is DISMISSED, set appeal_status to "FINALITY_REACHED" with notes explaining no further appeal is possible
5. Tracking: Use Order Date as T=0 and calculate all task deadlines relative to it
6. Post-Mortem: If a relist date has passed, mark as CRITICAL OVERDUE and suggest a Post-Mortem Report task

CRITICAL RULES:
- Always include the exact 'Source Text' from the judgment for every extracted field
- SOURCE TEXT RULE: If a deadline is based on law (like the Limitation Act) and not explicitly stated in the PDF text, use: "Source: Statutory Limitation (Article 114 of Limitation Act, 1963)" instead of "Not found in judgment"
- DEPARTMENT RULE: Extract the respondent department/authority from the cause title or first page (e.g., "Department of Collegiate Education", "State of Karnataka")
- If a field cannot be determined from the judgment, use "Not Specified" as value with "Not found in judgment" as source_text
- For dates, use DD.MM.YYYY format
- Calculate all deadlines relative to T=0 (Order Date)
- Be precise with paragraph numbers
- Map every compliance task to its specific Operative Paragraph Number
- Detect if "condonation of delay" was dismissed — this means finality reached, no appeal possible
- Output ONLY valid JSON matching the schema below

REQUIRED JSON STRUCTURE:
{
  "case_identity": {
    "case_type": {"value": "string", "source_text": "exact quote"},
    "case_number": {"value": "string", "source_text": "exact quote"},
    "year": {"value": "string", "source_text": "exact quote"},
    "bench": {"value": "string", "source_text": "exact quote"},
    "judge": {"value": "string", "source_text": "exact quote"},
    "department": {"value": "Respondent Department Name", "source_text": "exact quote from cause title"}
  },
  "dates": {
    "reserved_on": {"value": "DD.MM.YYYY", "source_text": "exact quote"},
    "pronounced_on": {"value": "DD.MM.YYYY", "source_text": "exact quote"},
    "order_date": {"value": "DD.MM.YYYY", "source_text": "exact quote"},
    "relist_on": {"value": "DD.MM.YYYY or Not Specified", "source_text": "exact quote"}
  },
  "verdict": {"value": "Allowed|Dismissed|Disposed with Directions", "source_text": "exact quote"},
  "operative_paragraphs": [
    {"para_number": 1, "direction": "summary", "source_text": "exact quote"}
  ],
  "action_plan": {
    "compliance_tasks": [
      {"task_id": "T001", "description": "string", "status": "Pending", "priority": "High|Critical", "deadline": "T+30 days (DD.MM.YYYY)", "source_text": "exact quote", "operative_para": 10, "department": "Department Name"}
    ],
    "appeal_review": {
      "limitation_period": "string or N/A",
      "review_deadline": "T+X days (DD.MM.YYYY) or N/A",
      "filing_deadline": "T+X days (DD.MM.YYYY) or N/A",
      "appeal_status": "AVAILABLE|FINALITY_REACHED",
      "notes": "string",
      "source_text": "exact quote or Statutory Limitation reference"
    },
    "tracking": {
      "t_zero": "DD.MM.YYYY",
      "milestones": [
        {"label": "T+X", "date": "DD.MM.YYYY", "description": "string"}
      ]
    }
  }
}"""


class LLMAnalyzer:
    """Sends extracted PDF text to LLM and parses structured response."""

    def __init__(self):
        if settings.llm_provider == "groq":
            self.client = Groq(api_key=settings.groq_api_key)
        elif settings.llm_provider == "anthropic":
            self.client = Anthropic(api_key=settings.anthropic_api_key)

    def _smart_truncate_for_legal(self, text: str, max_chars: int = 10000) -> str:
        """Preserve critical sections of legal judgment while staying within Groq free-tier TPM limit.
        ~10000 chars ≈ 2500 tokens (input), well within 12000 TPM limit with system prompt.
        Indian judgments: header at top, operative order at END. Always include last 3000 chars.
        """
        if len(text) <= max_chars:
            return text

        last_3000 = text[-3000:]
        header_size = max_chars - 3000

        lines = text.split('\n')
        important = []
        in_critical = False
        skip_count = 0
        current_size = 0

        critical_keywords = [
            'weareofthe', 'wefind', 'inviewof', 'accordingly',
            'petition is', 'appeal is', 'direction', 'directed',
            'ordered', 'it is directed', 'compliance', 'we direct',
            'we order', 'conclusion', 'finalorder', 'operative',
            'intheresult', 'consequently', 'hence', 'allowed',
            'dismissed', 'disposed', 'wetherefore', 'itishereby',
            'it is ordered', 'it is directed', 'shall pay', 'respondent shall',
            'amount of', 'compensation', 'salary', 'appointment', 'within',
            'costs of', 'imposed', 'set aside', 'quashed', 'granted',
            'liberty to', 'interim', 'maintainable', 'merits'
        ]

        header_keywords = [
            'inthecourtof', 'before', 'coram', 'judgment',
            'caseno', 'wp(', 'civil', 'criminal',
            'petitioner', 'respondent', 'counsel', 'advocate',
            'dated', 'order', 'prayer'
        ]

        for line in lines:
            if current_size >= header_size:
                break

            lower = line.lower().strip()
            lower_clean = lower.replace(' ', '').replace('-', '')

            is_header = any(kw in lower_clean for kw in header_keywords)
            is_critical = any(kw in lower_clean for kw in critical_keywords)

            if is_header or is_critical:
                in_critical = True
                skip_count = 0

            if in_critical:
                important.append(line)
                current_size += len(line) + 1
                if line.strip() == '':
                    skip_count += 1
                    if skip_count > 3:
                        in_critical = False

        result = '\n'.join(important)

        if len(result) < 1000:
            result = text[:header_size]

        combined = result + '\n\n--- CONCLUSION ---\n' + last_3000

        if len(combined) > max_chars:
            combined = combined[:max_chars]

        return combined

    def analyze(self, extracted_text: str) -> dict:
        truncated_text = self._smart_truncate_for_legal(extracted_text)

        logger.info(f"Sending {len(truncated_text)} chars to {settings.llm_provider}")

        if settings.llm_provider == "groq":
            response = self._call_groq(truncated_text)
        else:
            response = self._call_anthropic(truncated_text)

        parsed = self._parse_response(response)
        logger.info("LLM analysis complete, JSON parsed successfully")
        return parsed

    def _call_groq(self, text: str) -> str:
        logger.info(f"Groq API call: model={settings.groq_model}, input_chars={len(text)}")
        try:
            response = self.client.chat.completions.create(
                model=settings.groq_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Analyze the following court judgment and return the structured JSON:\n\n{text}",
                    },
                ],
                temperature=0.1,
                max_tokens=4096,
                response_format={"type": "json_object"},
            )
        except Exception as api_error:
            error_type = type(api_error).__name__
            error_str = str(api_error)
            logger.error(f"Groq API error [{error_type}]: {error_str}")

            if error_type in ("RateLimitError", "APIStatusError") or "429" in error_str:
                import re
                retry_match = re.search(r'try again in ([\d.]+[sm])', error_str)
                retry_info = retry_match.group(1) if retry_match else "a few minutes"
                raise RuntimeError(f"Groq API rate limit reached. Please try again in {retry_info}.")

            if "credit" in error_str.lower() or "quota" in error_str.lower():
                raise RuntimeError("Groq API quota exceeded. Check your API key and billing.")

            if "model" in error_str.lower():
                raise RuntimeError(f"Groq model error. Verify the model name: {settings.groq_model}")

            raise RuntimeError(f"Groq API failed ({error_type}): {error_str}")

        if not hasattr(response, 'choices') or not response.choices:
            raise RuntimeError("Groq API returned empty response (no choices)")

        choice = response.choices[0]
        if not hasattr(choice, 'message') or choice.message is None:
            raise RuntimeError("Groq API returned response with no message")

        content = choice.message.content
        if not content:
            raise RuntimeError("Groq API returned empty content")

        logger.info(f"Groq response: {len(content)} chars")
        return content

    def _call_anthropic(self, text: str) -> str:
        response = self.client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            temperature=0.1,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Analyze the following court judgment and return the structured JSON:\n\n{text}",
                },
            ],
        )
        return response.content[0].text

    def _parse_response(self, response: str) -> dict:
        cleaned = response.strip()

        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            logger.error(f"Raw response (first 500 chars): {cleaned[:500]}")
            raise ValueError(f"LLM returned invalid JSON: {e}")
