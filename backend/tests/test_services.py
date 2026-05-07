import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.pdf_extractor import PDFExtractor
from app.services.action_plan_generator import ActionPlanGenerator

def test_extraction():
    print("=" * 60)
    print("TEST 1: PDF Text Extraction")
    print("=" * 60)

    extractor = PDFExtractor()
    result = extractor.extract("E:/Nyaya-Setu/judgment-sample.pdf")

    print(f"Pages extracted: {result['total_pages']}")
    print(f"Characters: {len(result['full_text'])}")
    print(f"Has text: {bool(result['full_text'].strip())}")
    print("PASS")
    return result


def _make_base_llm_output(operative_paragraphs=None, compliance_tasks=None, appeal_review=None):
    return {
        "case_identity": {
            "case_type": {"value": "Writ Petition", "source_text": "WP No.456 OF 2024"},
            "case_number": {"value": "456", "source_text": "WP No.456 OF 2024"},
            "year": {"value": "2024", "source_text": "WP No.456 OF 2024"},
            "bench": {"value": "High Court of Karnataka", "source_text": "IN THE HIGH COURT OF KARNATAKA"},
            "judge": {"value": "Hon'ble Mr. Justice", "source_text": "HON'BLE"}
        },
        "dates": {
            "reserved_on": {"value": "01.01.2026", "source_text": "Reserved"},
            "pronounced_on": {"value": "15.01.2026", "source_text": "Pronounced"},
            "order_date": {"value": "15.01.2026", "source_text": "15.01.2026"}
        },
        "verdict": {"value": "Allowed", "source_text": "petition allowed"},
        "operative_paragraphs": operative_paragraphs or [
            {"para_number": 10, "direction": "Respondent shall pay Rs.5,00,000 as compensation within 8 weeks", "source_text": "pay compensation"},
            {"para_number": 12, "direction": "State shall appoint the petitioner to the post of Clerk", "source_text": "appoint petitioner"}
        ],
        "action_plan": {
            "compliance_tasks": compliance_tasks or [],
            "appeal_review": appeal_review or {},
            "tracking": {
                "t_zero": "15.01.2026",
                "milestones": [
                    {"label": "T+15", "date": "", "description": "Approval target"},
                    {"label": "T+30", "date": "", "description": "Execution target"},
                    {"label": "T+45", "date": "", "description": "Affidavit target"}
                ]
            }
        }
    }


def test_action_plan_generation():
    print("\n" + "=" * 60)
    print("TEST 2: Action Plan Generator — Basic Enrichment")
    print("=" * 60)

    generator = ActionPlanGenerator()
    sample_llm_output = _make_base_llm_output()

    result = generator.validate_and_enrich(sample_llm_output)

    print(f"Verification status: {result['verification_status']}")
    print(f"Generated on: {result['generated_on']}")
    print(f"Protocol version: {result['protocol_version']}")

    milestones = result['action_plan']['tracking']['milestones']
    for m in milestones:
        print(f"  {m['label']}: {m['date']} - {m['description']}")

    assert result['verification_status'] == 'PENDING_HUMAN_VERIFICATION'
    assert len(milestones) == 3
    for m in milestones:
        assert m['date'], f"Milestone {m['label']} should have a date"
    print("PASS")
    return result


def test_programmatic_task_generation():
    print("\n" + "=" * 60)
    print("TEST 3: Programmatic Task Generation from Operative Paragraphs")
    print("=" * 60)

    generator = ActionPlanGenerator()

    operative = [
        {"para_number": 10, "direction": "Respondent shall pay Rs.5,00,000 as compensation within 8 weeks", "source_text": "pay compensation"},
        {"para_number": 12, "direction": "State shall appoint the petitioner to the post of Clerk", "source_text": "appoint petitioner"},
    ]

    llm_output = _make_base_llm_output(operative_paragraphs=operative, compliance_tasks=[])

    result = generator.validate_and_enrich(llm_output)
    tasks = result['action_plan']['compliance_tasks']

    print(f"Operative paragraphs: {len(operative)}")
    print(f"Tasks generated: {len(tasks)}")
    for t in tasks:
        print(f"  {t['task_id']}: {t['description'][:60]}... (deadline: {t['deadline']})")

    expected = len(operative) * 3
    assert len(tasks) == expected, f"Expected {expected} tasks, got {len(tasks)}"

    for i, para in enumerate(operative):
        base = i * 3
        for step_idx, step_type in enumerate(["approval", "execution", "compliance_affidavit"]):
            task = tasks[base + step_idx]
            assert task['operative_para'] == para['para_number']
            assert task['step_type'] == step_type
            assert "(30.01.2026)" in task['deadline'] or "(14.02.2026)" in task['deadline'] or "(01.03.2026)" in task['deadline']

    print("PASS")
    return result


def test_no_duplicate_task_ids():
    print("\n" + "=" * 60)
    print("TEST 4: No Duplicate Task IDs When LLM Returns Some Tasks")
    print("=" * 60)

    generator = ActionPlanGenerator()

    operative = [
        {"para_number": 10, "direction": "Respondent shall pay compensation", "source_text": "pay"},
        {"para_number": 12, "direction": "State shall appoint petitioner", "source_text": "appoint"},
    ]

    llm_tasks = [
        {"task_id": "T001", "description": "LLM-generated task", "status": "Pending", "priority": "High", "deadline": "T+30 days", "source_text": "test"}
    ]

    llm_output = _make_base_llm_output(operative_paragraphs=operative, compliance_tasks=llm_tasks)

    result = generator.validate_and_enrich(llm_output)
    tasks = result['action_plan']['compliance_tasks']

    task_ids = [t['task_id'] for t in tasks]
    print(f"Task IDs: {task_ids}")
    assert len(task_ids) == len(set(task_ids)), f"Duplicate task IDs found: {task_ids}"

    assert "T001" in task_ids, "LLM task T001 should be preserved"
    print(f"Total tasks (1 LLM + programmatic): {len(tasks)}")
    print("PASS")


def test_non_directive_paragraph_skipped():
    print("\n" + "=" * 60)
    print("TEST 5: Non-Directive Paragraphs Are Skipped")
    print("=" * 60)

    generator = ActionPlanGenerator()

    operative = [
        {"para_number": 5, "direction": "The matter was heard on both sides", "source_text": "heard"},
        {"para_number": 10, "direction": "Respondent shall pay Rs.1,00,000 as compensation", "source_text": "pay"},
    ]

    llm_output = _make_base_llm_output(operative_paragraphs=operative, compliance_tasks=[])

    result = generator.validate_and_enrich(llm_output)
    tasks = result['action_plan']['compliance_tasks']

    print(f"Operative paragraphs: {len(operative)} (1 non-directive)")
    print(f"Tasks generated: {len(tasks)}")

    assert len(tasks) == 3, f"Expected 3 tasks (1 directive × 3 steps), got {len(tasks)}"

    for t in tasks:
        assert t['operative_para'] == 10, "Tasks should only be from para 10"

    print("PASS")


def test_appeal_review_auto_generation():
    print("\n" + "=" * 60)
    print("TEST 6: Appeal Review Auto-Generation")
    print("=" * 60)

    generator = ActionPlanGenerator()

    llm_output = _make_base_llm_output(appeal_review={})

    result = generator.validate_and_enrich(llm_output)
    appeal = result['action_plan']['appeal_review']

    print(f"Limitation period: {appeal['limitation_period']}")
    print(f"Review deadline: {appeal['review_deadline']}")
    print(f"Filing deadline: {appeal['filing_deadline']}")

    assert appeal['review_deadline'], "Review deadline should be set"
    assert appeal['filing_deadline'], "Filing deadline should be set"
    assert "30 days" in appeal['limitation_period'], "High Court should have 30-day limitation"

    review_days = int(appeal['review_deadline'].split('T+')[1].split(' ')[0])
    filing_days = int(appeal['filing_deadline'].split('T+')[1].split(' ')[0])
    assert review_days < filing_days, "Review deadline should be before filing deadline"
    assert filing_days - review_days == 15, "Review should be 15 days before filing"

    print("PASS")


def test_appeal_review_preserves_llm_output():
    print("\n" + "=" * 60)
    print("TEST 7: LLM Appeal Review Is Not Overwritten")
    print("=" * 60)

    generator = ActionPlanGenerator()

    llm_appeal = {
        "limitation_period": "60 days",
        "review_deadline": "T+45 days (01.03.2026)",
        "filing_deadline": "T+60 days (16.03.2026)",
        "notes": "Appeal to Division Bench",
        "source_text": "division bench appeal"
    }

    llm_output = _make_base_llm_output(appeal_review=llm_appeal)

    result = generator.validate_and_enrich(llm_output)
    appeal = result['action_plan']['appeal_review']

    assert appeal['limitation_period'] == "60 days", "LLM limitation should be preserved"
    assert appeal['review_deadline'] == "T+45 days (01.03.2026)", "LLM review deadline should be preserved"
    assert appeal['notes'] == "Appeal to Division Bench", "LLM notes should be preserved"

    print("LLM appeal review preserved: PASS")


if __name__ == "__main__":
    test_extraction()
    test_action_plan_generation()
    test_programmatic_task_generation()
    test_no_duplicate_task_ids()
    test_non_directive_paragraph_skipped()
    test_appeal_review_auto_generation()
    test_appeal_review_preserves_llm_output()
    print("\n" + "=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)
