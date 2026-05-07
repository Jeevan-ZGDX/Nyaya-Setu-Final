from datetime import datetime, timedelta
import re
from loguru import logger


class ActionPlanGenerator:
    """Validates, enriches, and programmatically generates compliance tasks from operative paragraphs."""

    COMPLIANCE_STEPS = [
        {
            "step_type": "administrative",
            "role": "Administrative",
            "template": "Notify the responsible officer of the deadline for: {direction_summary}",
            "default_deadline_offset": 7,
        },
        {
            "step_type": "operational",
            "role": "Operational",
            "template": "Submit progress reports and execute compliance for: {direction_summary}",
            "default_deadline_offset": 21,
        },
        {
            "step_type": "legal",
            "role": "Legal",
            "template": "Draft the final compliance report/affidavit for court submission regarding: {direction_summary}",
            "default_deadline_offset": 30,
        },
    ]

    DEPARTMENTAL_SUBTASKS = {
        "affidavit": [
            {"department": "IT Department", "task": "Provide technical architecture for the litigation portal"},
            {"department": "Legal Cell", "task": "Identify all pending cases with delays > 300 days"},
            {"department": "Personnel Department", "task": "Designate Nodal Officers for each department"},
        ],
        "streamlining": [
            {"department": "Administrative", "task": "Audit current file movement procedures and identify bottlenecks"},
            {"department": "IT Department", "task": "Implement digital tracking for all file movements"},
            {"department": "All Departments", "task": "Ensure no future file delay exceeds 30 days"},
        ],
        "payment": [
            {"department": "Finance Department", "task": "Process payment as directed by the Hon'ble Court"},
            {"department": "Legal Cell", "task": "Verify compliance with payment order and obtain receipt"},
            {"department": "Legal Cell", "task": "File compliance affidavit confirming payment"},
        ],
    }

    DIRECTION_KEYWORDS = [
        "pay", "payment", "compensat", "salary", "appoint", "direct",
        "order", "comply", "compliance", "release", "deposit", "refund",
        "grant", "allot", "assign", "transfer", "investigat", "report",
        "status", "action", "reinstat", "promot", "benefit", "pension",
        "arrears", "interest", "cost", "damages", "restitut", "quash",
        "set aside", "reconsider", "review", "fresh", "de novo",
    ]

    APPEAL_LIMITATIONS = {
        "supreme court": 90,
        "division bench": 60,
        "high court": 30,
        "tribunal": 30,
    }

    def validate_and_enrich(self, llm_output: dict) -> dict:
        order_date_str = llm_output.get("dates", {}).get("order_date", {}).get("value", "")
        order_date = self._parse_date(order_date_str)

        operative_paragraphs = llm_output.get("operative_paragraphs", [])
        llm_tasks = llm_output.get("action_plan", {}).get("compliance_tasks", [])
        department = llm_output.get("case_identity", {}).get("department", {}).get("value", "")

        if operative_paragraphs and len(llm_tasks) < len(operative_paragraphs) * 2:
            logger.warning(
                f"LLM returned {len(llm_tasks)} tasks but {len(operative_paragraphs)} operative directions found. "
                f"Generating programmatic tasks to supplement."
            )
            llm_output = self._generate_programmatic_tasks(llm_output, order_date)

        llm_output = self._generate_departmental_subtasks(llm_output, order_date)

        llm_output = self._generate_post_mortem_task(llm_output, order_date)

        llm_output = self._generate_appeal_review(llm_output)

        llm_output = self._calculate_days_overdue(llm_output)

        if department:
            for task in llm_output.get("action_plan", {}).get("compliance_tasks", []):
                if not task.get("department"):
                    task["department"] = department

        if order_date:
            llm_output = self._recalculate_deadlines(llm_output, order_date)

        llm_output["verification_status"] = "PENDING_HUMAN_VERIFICATION"
        llm_output["generated_on"] = datetime.now().strftime("%Y-%m-%d")
        llm_output["protocol_version"] = "CCMS-AI v1.0"

        task_count = len(llm_output.get("action_plan", {}).get("compliance_tasks", []))
        logger.info(f"Action plan validated and enriched with {task_count} compliance tasks")
        return llm_output

    def _generate_departmental_subtasks(self, data: dict, order_date: datetime | None) -> dict:
        """Creates department-specific subtasks when the court orders affidavits or reports."""
        operative_paragraphs = data.get("operative_paragraphs", [])
        action_plan = data.setdefault("action_plan", {})
        existing_tasks = action_plan.get("compliance_tasks", [])
        existing_ids = {t.get("task_id", "") for t in existing_tasks}
        task_counter = len(existing_tasks) + 1

        for para in operative_paragraphs:
            direction = para.get("direction", "").lower()
            para_number = para.get("para_number", 0)
            source_text = para.get("source_text", "")

            matched_category = None
            for category, keywords in {"affidavit": ["affidavit", "digital", "integration"], "streamlining": ["file", "delay", "routine", "movement", "streamlin"], "payment": ["pay", "compensat", "salary", "amount"]}.items():
                if any(kw in direction for kw in keywords):
                    matched_category = category
                    break

            if matched_category:
                subtasks = self.DEPARTMENTAL_SUBTASKS.get(matched_category, [])
                for sub in subtasks:
                    task_id = f"T{task_counter:03d}"
                    if task_id in existing_ids:
                        task_counter += 1
                        task_id = f"T{task_counter:03d}"

                    offset = self.COMPLIANCE_STEPS[0]["default_deadline_offset"]
                    if order_date:
                        target = order_date + timedelta(days=offset)
                        deadline = f"T+{offset} days ({target.strftime('%d.%m.%Y')})"
                    else:
                        deadline = f"T+{offset} days"

                    existing_tasks.append({
                        "task_id": task_id,
                        "description": f"[{sub['department']}] {sub['task']}",
                        "status": "Pending",
                        "priority": "High",
                        "deadline": deadline,
                        "source_text": source_text,
                        "operative_para": para_number,
                        "step_type": "departmental",
                        "department": sub["department"],
                        "parent_para": para_number,
                    })
                    existing_ids.add(task_id)
                    task_counter += 1

        data["action_plan"]["compliance_tasks"] = existing_tasks
        return data

    def _generate_post_mortem_task(self, data: dict, order_date: datetime | None) -> dict:
        """Creates a Post-Mortem Report task when relist dates are overdue."""
        action_plan = data.setdefault("action_plan", {})
        existing_tasks = action_plan.get("compliance_tasks", [])
        dates = data.get("dates", {})

        relist_date_str = dates.get("relist_on", {}).get("value", "")
        if not relist_date_str:
            for para in data.get("operative_paragraphs", []):
                direction = para.get("direction", "").lower()
                if "relist" in direction or "next date" in direction:
                    date_match = re.search(r'(\d{2}[./-]\d{2}[./-]\d{4})', para.get("source_text", ""))
                    if date_match:
                        relist_date_str = date_match.group(1).replace("/", ".").replace("-", ".")
                        break

        if not relist_date_str:
            return data

        relist_date = self._parse_date(relist_date_str)
        if not relist_date:
            return data

        today = datetime.now()
        days_overdue = (today - relist_date).days

        if days_overdue > 0:
            existing_tasks.append({
                "task_id": f"T{len(existing_tasks) + 1:03d}",
                "description": "URGENT: File Post-Mortem Report explaining delay beyond the relist date ordered by the Hon'ble Court",
                "status": "Pending",
                "priority": "Critical",
                "deadline": "IMMEDIATE",
                "deadline_date": today.strftime("%Y-%m-%d"),
                "source_text": f"Relist date was {relist_date.strftime('%d.%m.%Y')} — now {days_overdue} days overdue",
                "operative_para": 0,
                "step_type": "post_mortem",
                "days_overdue": days_overdue,
                "contempt_risk": True,
            })

        data["action_plan"]["compliance_tasks"] = existing_tasks
        return data

    def _calculate_days_overdue(self, data: dict) -> dict:
        """Calculates and attaches days_overdue to every task based on deadline_date."""
        today = datetime.now()
        today.date()

        for task in data.get("action_plan", {}).get("compliance_tasks", []):
            if "days_overdue" in task:
                continue
            deadline_str = task.get("deadline_date", "")
            if not deadline_str:
                deadline_display = task.get("deadline", "")
                if "(" in deadline_display:
                    date_part = deadline_display.split("(")[1].split(")")[0]
                    try:
                        deadline_str = datetime.strptime(date_part, "%d.%m.%Y").strftime("%Y-%m-%d")
                    except ValueError:
                        continue
                else:
                    continue

            try:
                deadline = datetime.strptime(deadline_str, "%Y-%m-%d")
                diff = (today - deadline).days
                if diff > 0:
                    task["days_overdue"] = diff
                    if diff > 7:
                        task["contempt_risk"] = True
                        if task.get("priority") != "Critical":
                            task["priority"] = "Critical"
            except ValueError:
                pass

        return data

    def _generate_programmatic_tasks(self, data: dict, order_date: datetime | None) -> dict:
        """Generates 3-step compliance tasks for each operative direction that the LLM missed."""
        operative_paragraphs = data.get("operative_paragraphs", [])
        action_plan = data.setdefault("action_plan", {})
        existing_tasks = action_plan.get("compliance_tasks", [])
        existing_ids = {t.get("task_id", "") for t in existing_tasks}

        task_counter = len(existing_tasks) + 1
        new_tasks = list(existing_tasks)

        for para in operative_paragraphs:
            direction = para.get("direction", "")
            para_number = para.get("para_number", 0)
            source_text = para.get("source_text", "")

            if not self._has_directive(direction):
                logger.debug(f"Para {para_number} has no actionable directive, skipping")
                continue

            direction_summary = self._summarize_direction(direction)

            for step in self.COMPLIANCE_STEPS:
                task_id = f"T{task_counter:03d}"
                if task_id in existing_ids:
                    task_counter += 1
                    task_id = f"T{task_counter:03d}"

                description = step["template"].format(direction_summary=direction_summary)

                if order_date:
                    offset = step["default_deadline_offset"]
                    target = order_date + timedelta(days=offset)
                    deadline = f"T+{offset} days ({target.strftime('%d.%m.%Y')})"
                else:
                    offset = step["default_deadline_offset"]
                    deadline = f"T+{offset} days"

                new_tasks.append({
                    "task_id": task_id,
                    "description": description,
                    "status": "Pending",
                    "priority": "High",
                    "deadline": deadline,
                    "source_text": source_text,
                    "operative_para": para_number,
                    "step_type": step["step_type"],
                })
                existing_ids.add(task_id)
                task_counter += 1

        data["action_plan"]["compliance_tasks"] = new_tasks
        logger.info(f"Generated {len(new_tasks) - len(existing_tasks)} programmatic tasks")
        return data

    def _generate_appeal_review(self, data: dict) -> dict:
        """Generates appeal review deadlines if not provided by LLM.
        Detects finality when condonation of delay is dismissed.
        """
        action_plan = data.get("action_plan", {})
        appeal = action_plan.get("appeal_review", {})

        verdict = data.get("verdict", {}).get("value", "").lower()
        bench = data.get("case_identity", {}).get("bench", {}).get("value", "").lower()
        order_date_str = data.get("dates", {}).get("order_date", {}).get("value", "")
        order_date = self._parse_date(order_date_str)

        condonation_dismissed = False
        delay_days = 0

        for para in data.get("operative_paragraphs", []):
            direction = para.get("direction", "").lower()
            if "condonation" in direction and ("dismiss" in direction or "reject" in direction or "refus" in direction):
                condonation_dismissed = True
                num_match = re.search(r'(\d+)\s*day', direction)
                if num_match:
                    delay_days = int(num_match.group(1))

        if condonation_dismissed:
            appeal = {
                "limitation_period": "N/A",
                "review_deadline": "N/A",
                "filing_deadline": "N/A",
                "appeal_status": "FINALITY_REACHED",
                "finality_notes": f"Application for condonation of delay ({delay_days} days) has been dismissed. No further appeal possible. The original order attains finality.",
                "source_text": "Condonation of delay dismissed — right to appeal extinguished",
            }
            data["action_plan"]["appeal_review"] = appeal
            return data

        limitation_days = self._detect_limitation_period(bench, appeal.get("limitation_period", ""))

        filing_offset = limitation_days
        review_offset = max(limitation_days - 15, 7)

        if order_date:
            review_date = order_date + timedelta(days=review_offset)
            filing_date = order_date + timedelta(days=filing_offset)

            appeal = {
                "limitation_period": f"{limitation_days} days",
                "review_deadline": f"T+{review_offset} days ({review_date.strftime('%d.%m.%Y')})",
                "review_deadline_label": "Final Decision Date for Legal Cell",
                "filing_deadline": f"T+{filing_offset} days ({filing_date.strftime('%d.%m.%Y')})",
                "filing_deadline_label": "Last Date to File Appeal",
                "appeal_status": "AVAILABLE",
                "notes": f"Review deadline is 15 days before the {limitation_days}-day filing deadline to allow time for legal cell decision.",
                "source_text": f"Statutory Limitation (Article 114 of Limitation Act, 1963) — {limitation_days}-day period for this forum",
            }
        else:
            appeal = {
                "limitation_period": f"{limitation_days} days",
                "review_deadline": f"T+{review_offset} days",
                "review_deadline_label": "Final Decision Date for Legal Cell",
                "filing_deadline": f"T+{filing_offset} days",
                "appeal_status": "AVAILABLE",
                "notes": f"Review deadline is 15 days before the {limitation_days}-day filing deadline to allow time for legal cell decision.",
                "source_text": f"Statutory Limitation (Article 114 of Limitation Act, 1963) — {limitation_days}-day period for this forum",
            }

        data["action_plan"]["appeal_review"] = appeal
        return data

    def _has_directive(self, text: str) -> bool:
        """Checks if a paragraph contains an actionable judicial direction."""
        lower = text.lower()
        return any(kw in lower for kw in self.DIRECTION_KEYWORDS)

    def _summarize_direction(self, text: str) -> str:
        """Extracts a concise summary of the judicial direction."""
        text = text.strip()
        if len(text) <= 150:
            return text
        sentences = re.split(r'(?<=[.!?])\s+', text)
        summary = ""
        for sentence in sentences:
            if len(summary) + len(sentence) + 1 > 150:
                break
            summary = summary + " " + sentence if summary else sentence
        return summary.strip()[:150]

    def _detect_limitation_period(self, bench: str, llm_period: str) -> int:
        """Determines appeal limitation period in days."""
        if llm_period:
            numbers = re.findall(r'\d+', str(llm_period))
            if numbers:
                return int(numbers[0])

        for forum, days in self.APPEAL_LIMITATIONS.items():
            if forum in bench:
                return days

        return 60

    def _parse_date(self, date_str: str) -> datetime | None:
        formats = ["%d.%m.%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"]
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except (ValueError, TypeError):
                continue
        return None

    def _recalculate_deadlines(self, data: dict, order_date: datetime) -> dict:
        if "action_plan" not in data:
            return data

        action_plan = data["action_plan"]
        tracking = action_plan.get("tracking", {})
        milestones = tracking.get("milestones", [])

        for milestone in milestones:
            label = milestone.get("label", "")
            if label.startswith("T+"):
                try:
                    days = int(label[2:])
                    target_date = order_date + timedelta(days=days)
                    milestone["date"] = target_date.strftime("%d.%m.%Y")
                except ValueError:
                    pass

        tasks = action_plan.get("compliance_tasks", [])
        for task in tasks:
            if task.get("deadline") == "IMMEDIATE":
                task["deadline_date"] = datetime.now().strftime("%Y-%m-%d")
                continue
            deadline = task.get("deadline", "")
            if "T+" in deadline and "(" in deadline:
                try:
                    date_part = deadline.split("(")[1].split(")")[0]
                    task["deadline_date"] = datetime.strptime(date_part, "%d.%m.%Y").strftime("%Y-%m-%d")
                except (ValueError, IndexError):
                    pass
                continue
            if "T+" in deadline:
                try:
                    days_part = deadline.split("T+")[1].split(" ")[0]
                    days = int(days_part)
                    target_date = order_date + timedelta(days=days)
                    task["deadline"] = f"T+{days} days ({target_date.strftime('%d.%m.%Y')})"
                    task["deadline_date"] = target_date.strftime("%Y-%m-%d")
                except (ValueError, IndexError):
                    pass

        appeal = action_plan.get("appeal_review", {})
        for field in ["review_deadline", "filing_deadline"]:
            deadline = appeal.get(field, "")
            if deadline in ("N/A", ""):
                continue
            if "T+" in deadline and "(" in deadline:
                try:
                    date_part = deadline.split("(")[1].split(")")[0]
                    appeal[field + "_date"] = datetime.strptime(date_part, "%d.%m.%Y").strftime("%Y-%m-%d")
                except (ValueError, IndexError):
                    pass
                continue
            if "T+" in deadline:
                try:
                    days_part = deadline.split("T+")[1].split(" ")[0]
                    days = int(days_part)
                    target_date = order_date + timedelta(days=days)
                    appeal[field] = f"T+{days} days ({target_date.strftime('%d.%m.%Y')})"
                    appeal[field + "_date"] = target_date.strftime("%Y-%m-%d")
                except (ValueError, IndexError):
                    pass

        data["action_plan"]["tracking"] = tracking
        data["action_plan"]["compliance_tasks"] = tasks
        data["action_plan"]["appeal_review"] = appeal

        return data
