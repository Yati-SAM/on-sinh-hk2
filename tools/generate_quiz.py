from __future__ import annotations

import json
import re
import unicodedata
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph


ROOT_DIR = Path(__file__).resolve().parent.parent
SOURCE_DOC = Path(r"C:\Users\darkf\Downloads\ĐỀ CƯƠNG ÔN THI HỌC KỲ II SINH 12.docx")
MEDIA_DIR = ROOT_DIR / "assets" / "doc-media"
OUTPUT_FILE = ROOT_DIR / "quiz-data.js"

VI_LOWER_D = "\u0111"
VI_UPPER_D = "\u0110"


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def simplify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.replace("\xa0", " "))
    stripped = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", stripped).strip().lower()


def extract_question_number(value: str) -> int | None:
    match = re.search(r"(\d+)", value)
    return int(match.group(1)) if match else None


def strip_question_prefix(value: str) -> str:
    text = normalize_text(value)
    digits = re.search(r"\d+", text)
    if not digits:
        return text
    return text[digits.end() :].lstrip(" .:)")


def is_heading(block: dict) -> bool:
    if block["type"] != "paragraph":
        return False
    simple = block["simple"]
    return (
        simple.startswith("bai ")
        or simple.startswith("phan ")
        or simple.startswith("i. cau")
        or bool(re.match(r"^[12]\. cau", simple))
    )


def is_question_start(block: dict) -> bool:
    return block["type"] == "paragraph" and bool(re.match(r"^c\D{0,5}\d+", block["simple"]))


def is_true_false_heading(simple: str) -> bool:
    return "sai" in simple and ("dung" in simple or f"{VI_LOWER_D}ung" in simple)


def starts_option(block: dict) -> bool:
    if block["type"] != "paragraph":
        return False
    simple = block["simple"]
    return bool(re.match(r"^[abcd]\.\s*", simple)) or all(tag in block["text"] for tag in ("A.", "B.", "C.", "D."))


def starts_true_false_statement(block: dict) -> bool:
    if block["type"] != "paragraph":
        return False
    simple = block["simple"]
    return bool(re.match(rf"^([ds{VI_LOWER_D}]|[a-d])\.\s*", simple))


def first_option_answer(block: dict) -> str | None:
    for run in block.get("runs", []):
        if run["underline"]:
            match = re.search(r"([ABCD])", run["text"])
            if match:
                return match.group(1)
    return None


def statement_answer(block: dict) -> bool | None:
    text = normalize_text(block["text"])
    if text.startswith(f"{VI_UPPER_D}.") or text.startswith("S."):
        return text.startswith(f"{VI_UPPER_D}.")

    if re.match(r"^[a-dA-D]\.", text):
        return any(run["underline"] for run in block.get("runs", [])[:2])

    return None


def split_options(option_blocks: list[dict]) -> list[dict]:
    full_text = " ".join(normalize_text(block["text"]) for block in option_blocks)
    matches = list(re.finditer(r"([ABCD])\.\s*", full_text))
    options: list[dict] = []

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(full_text)
        options.append(
            {
                "key": match.group(1),
                "text": normalize_text(full_text[start:end]),
            }
        )

    return options


def export_image(image_part, exported: dict[str, str]) -> str:
    filename = Path(image_part.partname).name
    output_path = MEDIA_DIR / filename

    if filename not in exported:
        MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(image_part.blob)
        exported[filename] = output_path.relative_to(ROOT_DIR).as_posix()

    return exported[filename]


def extract_blocks(document: Document) -> list[dict]:
    blocks: list[dict] = []
    relations = document.part.rels
    exported_images: dict[str, str] = {}

    for child in document._element.body.iterchildren():
        if child.tag == qn("w:p"):
            paragraph = Paragraph(child, document)
            text = "".join(run.text for run in paragraph.runs).replace("\n", " ").strip()
            runs = []
            images = []

            for run in paragraph.runs:
                run_text = run.text.replace("\n", " ")
                if run_text:
                    runs.append(
                        {
                            "text": run_text,
                            "underline": bool(run.underline),
                        }
                    )

            for drawing in child.findall(".//" + qn("w:drawing")):
                for blip in drawing.findall(".//" + qn("a:blip")):
                    relationship_id = blip.get(qn("r:embed"))
                    if relationship_id and relationship_id in relations:
                        image_part = relations[relationship_id].target_part
                        images.append(export_image(image_part, exported_images))

            if text or images:
                blocks.append(
                    {
                        "type": "paragraph",
                        "text": text,
                        "simple": simplify(text),
                        "runs": runs,
                        "images": images,
                    }
                )

        elif child.tag == qn("w:tbl"):
            table = Table(child, document)
            rows = [
                [normalize_text(cell.text.replace("\n", " / ")) for cell in row.cells]
                for row in table.rows
            ]
            blocks.append({"type": "table", "rows": rows})

    return blocks


def finalize_question(question: dict) -> dict:
    if question["type"] == "choice":
        question["options"] = split_options(question["optionBlocks"])
        answer = None

        for option_block in question["optionBlocks"]:
            answer = first_option_answer(option_block) or answer

        # Requested correction from the user.
        if question["chapter"] == "Phần mở đầu" and question["number"] == 5:
            answer = "D"

        question["answer"] = answer
        del question["optionBlocks"]
    else:
        statements = []
        for statement_block in question["statementBlocks"]:
            statement_text = re.sub(
                rf"^([{VI_UPPER_D}S]|[a-dA-D])\.\s*",
                "",
                normalize_text(statement_block["text"]),
            )
            statements.append(
                {
                    "text": statement_text,
                    "answer": statement_answer(statement_block),
                }
            )

        question["statements"] = statements
        del question["statementBlocks"]

    return question


def build_questions(blocks: list[dict]) -> list[dict]:
    questions: list[dict] = []
    current_question: dict | None = None
    mode = "choice"
    chapter = "Phần mở đầu"
    section_title = "I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN"

    for block in blocks:
        if is_heading(block):
            if current_question:
                questions.append(finalize_question(current_question))
                current_question = None

            simple = block["simple"]

            if simple.startswith("bai "):
                chapter = normalize_text(block["text"])
                section_title = "Câu hỏi trắc nghiệm"
                mode = "choice"
            else:
                section_title = normalize_text(block["text"])
                if is_true_false_heading(simple):
                    mode = "true_false"
                elif "trac nghiem" in simple or "nhieu lua chon" in simple or "lua chon" in simple:
                    mode = "choice"

            continue

        if is_question_start(block):
            if current_question:
                questions.append(finalize_question(current_question))

            current_question = {
                "chapter": chapter,
                "sectionTitle": section_title,
                "type": mode,
                "number": extract_question_number(block["text"]),
                "label": f"Câu {extract_question_number(block['text'])}",
                "title": strip_question_prefix(block["text"]),
                "contextBlocks": [],
                "optionBlocks": [],
                "statementBlocks": [],
            }
            continue

        if not current_question:
            continue

        if block["type"] == "table":
            current_question["contextBlocks"].append({"type": "table", "rows": block["rows"]})
            continue

        if block["images"]:
            for image_src in block["images"]:
                current_question["contextBlocks"].append(
                    {
                        "type": "image",
                        "src": image_src,
                        "alt": f"Hình minh họa cho {current_question['label']}",
                    }
                )

            if block["text"]:
                current_question["contextBlocks"].append(
                    {
                        "type": "text",
                        "text": normalize_text(block["text"]),
                    }
                )
            continue

        if current_question["type"] == "choice":
            if starts_option(block) or current_question["optionBlocks"]:
                current_question["optionBlocks"].append(block)
            else:
                current_question["contextBlocks"].append(
                    {
                        "type": "text",
                        "text": normalize_text(block["text"]),
                    }
                )
        else:
            if starts_true_false_statement(block):
                current_question["statementBlocks"].append(block)
            else:
                current_question["contextBlocks"].append(
                    {
                        "type": "text",
                        "text": normalize_text(block["text"]),
                    }
                )

    if current_question:
        questions.append(finalize_question(current_question))

    for sequence, question in enumerate(questions, start=1):
        question["id"] = f"q-{sequence:03d}"
        question["seq"] = sequence

    return questions


def validate_questions(questions: list[dict]) -> None:
    for question in questions:
        if question["type"] == "choice":
            if len(question["options"]) != 4:
                raise ValueError(f"{question['label']} chưa tách đủ 4 phương án.")
            if question["answer"] not in {"A", "B", "C", "D"}:
                raise ValueError(f"{question['label']} chưa xác định được đáp án.")
        else:
            if len(question["statements"]) != 4:
                raise ValueError(f"{question['label']} chưa có đủ 4 mệnh đề đúng/sai.")
            if any(statement["answer"] is None for statement in question["statements"]):
                raise ValueError(f"{question['label']} còn thiếu đáp án đúng/sai.")


def main() -> None:
    if not SOURCE_DOC.exists():
        raise FileNotFoundError(f"Không tìm thấy file nguồn: {SOURCE_DOC}")

    document = Document(str(SOURCE_DOC))
    blocks = extract_blocks(document)
    questions = build_questions(blocks)
    validate_questions(questions)

    payload = {
        "title": "Ôn tập trắc nghiệm Sinh học 12 kì II",
        "source": str(SOURCE_DOC),
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "stats": {
            "questionCount": len(questions),
            "choiceCount": sum(question["type"] == "choice" for question in questions),
            "trueFalseCount": sum(question["type"] == "true_false" for question in questions),
        },
        "questions": questions,
    }

    OUTPUT_FILE.write_text(
        "window.__QUIZ_DATA__ = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )

    print(f"Generated {OUTPUT_FILE}")
    print(f"Question count: {payload['stats']['questionCount']}")
    print(f"Choice questions: {payload['stats']['choiceCount']}")
    print(f"True/false questions: {payload['stats']['trueFalseCount']}")


if __name__ == "__main__":
    main()
