"""Upload quarantine: what a file is, not what its name says, and what it carries.

The upload gate used to check an extension, a size and that the file was not
empty. A ZIP renamed ``report.pdf`` passed, as did a PDF that runs JavaScript
when opened, a spreadsheet with a macro, a document whose template is fetched
from a remote server, and an archive that inflates to gigabytes. Each of these
is refused here, before the file is stored, with the reason named:

* the type is read from the file's own bytes and must match its extension;
* a PDF may not carry JavaScript, launch actions, embedded files, rich media,
  XFA forms or form submission -- names are matched after hex-unescaping and
  inside compressed object streams, where they are usually hidden;
* an Office Open XML file may not carry macros, ActiveX, embedded OLE
  objects, DDE fields or external relationships that fetch content (remote
  templates, frames, linked images); plain hyperlinks are noted, not refused;
* an archive is refused when it has too many entries, inflates too far or
  holds another archive;
* an image must decode, and within a pixel budget;
* a text file must be text.

Everything here reads bytes; nothing is executed, rendered or followed.
"""

from __future__ import annotations

import io
import re
import zipfile
import zlib
from dataclasses import dataclass, field
from pathlib import Path

TEXT_EXTENSIONS = {".txt", ".md", ".log", ".csv", ".py", ".js", ".ts", ".json", ".yaml", ".yml"}
IMAGE_KINDS = {"png", "jpeg", "gif", "tiff", "bmp", "webp"}

_EXPECTED: dict[str, set[str]] = {
    ".pdf": {"pdf"},
    ".png": {"png"},
    ".jpg": {"jpeg"},
    ".jpeg": {"jpeg"},
    ".webp": {"webp"},
    ".bmp": {"bmp"},
    ".tif": {"tiff"},
    ".tiff": {"tiff"},
    ".gif": {"gif"},
    ".docx": {"ooxml"},
    ".xlsx": {"ooxml"},
    ".pptx": {"ooxml"},
    ".doc": {"ole"},
    ".xls": {"ole"},
    **{extension: {"text"} for extension in TEXT_EXTENSIONS},
}

_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpeg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    (b"II*\x00", "tiff"),
    (b"MM\x00*", "tiff"),
    (b"PK\x03\x04", "zip"),
    (b"PK\x05\x06", "zip"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "ole"),
    (b"\x7fELF", "executable"),
    (b"MZ", "executable"),
    (b"\x1f\x8b", "gzip"),
    (b"7z\xbc\xaf\x27\x1c", "7z"),
    (b"Rar!", "rar"),
)

# PDF names that make a document do something when it is opened or used.
_PDF_REFUSED = {
    "JavaScript": "runs JavaScript",
    "JS": "runs JavaScript",
    "Launch": "launches another program",
    "RichMedia": "carries rich media (Flash or video) with its own code",
    "XFA": "is an XFA form, which can carry scripts",
    "SubmitForm": "submits form data to an address",
    "ImportData": "imports data from another file",
    "GoToR": "opens a remote document",
    "GoToE": "opens an embedded document",
}
# Present in ordinary PDFs; recorded, not refused.
_PDF_NOTED = {
    "OpenAction": "has an open action (checked: it runs no script)",
    "AA": "has additional actions (checked: they run no script)",
    "AcroForm": "has form fields",
    "URI": "contains web links (not followed)",
}

# An attached file is data unless it is something a viewer could be asked
# to run, or another container to hide in. LibreOffice, for one, attaches
# C2PA "Content Credentials" to every exported PDF.
_RUNNABLE = (
    ".exe", ".dll", ".scr", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf",
    ".hta", ".lnk", ".msi", ".jar", ".sh", ".py", ".docm", ".xlsm", ".pptm", ".dotm", ".xlam",
    ".zip", ".rar", ".7z", ".iso", ".img", ".cab", ".gz", ".html", ".htm", ".svg", ".pdf",
)
_MAX_ATTACHMENTS = 5
_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

# OOXML relationship types that fetch content from outside the file.
_FETCHING_RELATIONSHIPS = (
    "attachedTemplate", "oleObject", "frame", "subDocument", "externalLink",
    "image", "package", "control", "externalLinkPath", "aFChunk",
)


@dataclass
class GuardLimits:
    max_archive_entries: int = 5000
    max_inflated_bytes: int = 256 * 1024 * 1024
    max_inflation_ratio: float = 120.0
    max_image_pixels: int = 80_000_000
    max_pdf_stream_bytes: int = 16 * 1024 * 1024
    max_pdf_total_inflated: int = 96 * 1024 * 1024


@dataclass
class GuardVerdict:
    accepted: bool
    detected: str
    reasons: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def refuse(self, reason: str) -> None:
        self.accepted = False
        if reason not in self.reasons:
            self.reasons.append(reason)

    def note(self, note: str) -> None:
        if note not in self.notes:
            self.notes.append(note)


def detect_kind(payload: bytes) -> str:
    """The file's type, from its bytes alone."""
    if b"%PDF-" in payload[:1024]:
        return "pdf"
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return "webp"
    if payload[:2] == b"BM" and len(payload) > 26:
        return "bmp"
    for signature, kind in _SIGNATURES:
        if payload.startswith(signature):
            return kind
    sample = payload[:65536]
    if b"\x00" in sample:
        return "binary"
    try:
        sample.decode("utf-8")
        return "text"
    except UnicodeDecodeError as exc:
        # A multi-byte character cut at the sample boundary is still text.
        if exc.start >= len(sample) - 4:
            return "text"
    controls = sum(1 for byte in sample if byte < 32 and byte not in (9, 10, 12, 13))
    return "text" if controls <= len(sample) * 0.01 else "binary"


def inspect_upload(filename: str, payload: bytes, limits: GuardLimits | None = None) -> GuardVerdict:
    """Decide whether an upload may be stored, and say why."""
    limits = limits or GuardLimits()
    extension = Path(filename).suffix.lower()
    kind = detect_kind(payload)
    if kind == "zip" and extension in (".docx", ".xlsx", ".pptx"):
        kind = "ooxml"
    verdict = GuardVerdict(accepted=True, detected=kind)

    expected = _EXPECTED.get(extension)
    if kind in ("executable", "gzip", "7z", "rar"):
        verdict.refuse(f"the bytes are {'an executable' if kind == 'executable' else f'a {kind} archive'}, "
                       f"whatever the name '{filename}' says")
        return verdict
    if expected is not None and kind not in expected:
        shown = {"ooxml": "an Office document", "zip": "a ZIP archive", "ole": "a legacy Office file",
                 "text": "plain text", "binary": "unrecognised binary data"}.get(kind, f"a {kind.upper()} file")
        verdict.refuse(f"'{filename}' is named {extension} but its bytes are {shown}")
        return verdict

    if kind == "pdf":
        _inspect_pdf(payload, verdict, limits)
    elif kind == "ooxml":
        _inspect_ooxml(payload, extension, verdict, limits)
    elif kind == "ole":
        _inspect_ole(payload, verdict)
    elif kind in IMAGE_KINDS:
        _inspect_image(payload, verdict, limits)
    return verdict


# ----------------------------------------------------------------------- pdf
_PDF_NAME = re.compile(rb"/([A-Za-z0-9#]+)")
_PDF_STREAM = re.compile(rb"stream\r?\n")


def _unescape_name(raw: bytes) -> str:
    """PDF names may hex-escape any character: /J#61vaScript is /JavaScript."""
    text = raw.decode("latin-1")
    return re.sub(r"#([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), text)


def _pdf_names(data: bytes) -> set[str]:
    return {_unescape_name(match.group(1)) for match in _PDF_NAME.finditer(data)}


def _inflated_streams(payload: bytes, limits: GuardLimits) -> list[bytes]:
    """Every Flate stream's content, inflated within a budget."""
    streams: list[bytes] = []
    total = 0
    for match in _PDF_STREAM.finditer(payload):
        start = match.end()
        end = payload.find(b"endstream", start)
        if end < 0:
            break
        body = payload[start:end]
        try:
            inflater = zlib.decompressobj()
            content = inflater.decompress(body, limits.max_pdf_stream_bytes)
        except zlib.error:
            continue
        total += len(content)
        if total > limits.max_pdf_total_inflated:
            streams.append(b"")
            break
        streams.append(content)
    return streams


def _inspect_pdf(payload: bytes, verdict: GuardVerdict, limits: GuardLimits) -> None:
    names = _pdf_names(payload)
    streams = _inflated_streams(payload, limits)
    hidden: set[str] = set()
    for content in streams:
        hidden |= _pdf_names(content)
    if streams and streams[-1] == b"" and sum(len(s) for s in streams) >= limits.max_pdf_total_inflated:
        verdict.refuse("its compressed streams inflate past the inspection budget")
    if "Encrypt" in names:
        verdict.refuse("it is encrypted, so its content cannot be inspected")
    for name, meaning in _PDF_REFUSED.items():
        if name in names:
            verdict.refuse(f"the PDF {meaning} (/{name})")
        elif name in hidden:
            verdict.refuse(f"the PDF {meaning} (/{name}, hidden inside a compressed object stream)")
    for name, meaning in _PDF_NOTED.items():
        if name in names or name in hidden:
            verdict.note(f"the PDF {meaning}")
    if {"EmbeddedFile", "EmbeddedFiles"} & (names | hidden):
        _inspect_pdf_attachments(payload, verdict)


def _inspect_pdf_attachments(payload: bytes, verdict: GuardVerdict) -> None:
    """List what a PDF has attached; refuse what could be run or unpacked."""
    try:
        from pypdf import PdfReader

        attachments = PdfReader(io.BytesIO(payload)).attachments
        files = [(name, len(data)) for name, contents in attachments.items() for data in contents]
    except Exception as exc:  # an attachment table pypdf cannot read cannot be vouched for
        verdict.refuse(f"the PDF carries embedded files that cannot be listed ({type(exc).__name__})")
        return
    if not files:
        verdict.refuse("the PDF declares embedded files that cannot be listed")
        return
    if len(files) > _MAX_ATTACHMENTS:
        verdict.refuse(f"the PDF carries {len(files)} embedded files, over the limit of {_MAX_ATTACHMENTS}")
    for name, size in files:
        if name.lower().endswith(_RUNNABLE):
            verdict.refuse(f"the PDF carries an embedded file '{name}' that could be run or unpacked")
        elif size > _MAX_ATTACHMENT_BYTES:
            verdict.refuse(f"the PDF carries an embedded file '{name}' of {size // (1024 * 1024)} MB")
        else:
            verdict.note(f"the PDF carries an embedded data file '{name}' ({size:,} bytes, never opened)")


# --------------------------------------------------------------------- ooxml
_EXTERNAL_TARGET = re.compile(
    rb"<Relationship\b[^>]*?Type=\"[^\"]*/([A-Za-z]+)\"[^>]*?TargetMode=\"External\"[^>]*>"
    rb"|<Relationship\b[^>]*?TargetMode=\"External\"[^>]*?Type=\"[^\"]*/([A-Za-z]+)\"[^>]*>",
    re.IGNORECASE,
)
_OOXML_PARTS = {".docx": "word/", ".xlsx": "xl/", ".pptx": "ppt/"}


def _inspect_ooxml(payload: bytes, extension: str, verdict: GuardVerdict, limits: GuardLimits) -> None:
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
        entries = archive.infolist()
    except (zipfile.BadZipFile, OSError, ValueError) as exc:
        verdict.refuse(f"the Office package is not a readable archive ({exc})")
        return
    if len(entries) > limits.max_archive_entries:
        verdict.refuse(f"the package holds {len(entries)} entries, over the limit of {limits.max_archive_entries}")
        return
    inflated = sum(entry.file_size for entry in entries)
    compressed = max(1, sum(entry.compress_size for entry in entries))
    if inflated > limits.max_inflated_bytes:
        verdict.refuse(f"the package inflates to {inflated // (1024 * 1024)} MB, past the "
                       f"{limits.max_inflated_bytes // (1024 * 1024)} MB limit (an archive bomb)")
        return
    if inflated > 10 * 1024 * 1024 and inflated / compressed > limits.max_inflation_ratio:
        verdict.refuse(f"the package inflates {inflated / compressed:.0f} times its size (an archive bomb)")
        return

    names = [entry.filename for entry in entries]
    lowered = [name.lower() for name in names]
    if "[content_types].xml" not in lowered:
        verdict.refuse("it has no [Content_Types].xml, so it is not an Office Open XML package")
        return
    part = _OOXML_PARTS.get(extension)
    if part and not any(name.startswith(part) for name in lowered):
        verdict.refuse(f"it is named {extension} but holds no {part} part: it is a different kind of package")
        return

    content_types = archive.read(names[lowered.index("[content_types].xml")])
    if (any(name.endswith("vbaproject.bin") or "vbadata" in name for name in lowered)
            or b"macroEnabled" in content_types or b"vbaProject" in content_types):
        verdict.refuse("it carries macros (a VBA project)")
    if any(name.startswith(f"{part or ''}activex/") or "/activex/" in name for name in lowered):
        verdict.refuse("it carries ActiveX controls")
    if any("/embeddings/" in name and name.endswith((".bin", ".exe", ".dll", ".js", ".vbs")) for name in lowered):
        verdict.refuse("it carries embedded OLE objects or executables")
    if any(name.endswith((".zip", ".jar", ".7z", ".rar", ".gz", ".cab")) for name in lowered):
        verdict.refuse("it holds another archive inside it")

    hyperlinks = 0
    for name, info in zip(names, entries):
        lower = name.lower()
        if not (lower.endswith(".xml") or lower.endswith(".rels")) or info.file_size > 32 * 1024 * 1024:
            continue
        data = archive.read(name)
        if lower.endswith(".rels"):
            for match in _EXTERNAL_TARGET.finditer(data):
                relation = (match.group(1) or match.group(2) or b"").decode("latin-1")
                if relation.lower() == "hyperlink":
                    hyperlinks += 1
                elif relation in _FETCHING_RELATIONSHIPS or relation.lower() in {r.lower() for r in _FETCHING_RELATIONSHIPS}:
                    verdict.refuse(f"it fetches content from outside the file when opened "
                                   f"(external {relation} relationship in {name})")
                else:
                    verdict.refuse(f"it has an external {relation} relationship ({name})")
        elif re.search(rb"DDEAUTO|\bDDE\b|ddeLink|ddeService", data):
            verdict.refuse(f"it carries a DDE field, which runs a command when updated ({name})")
    if hyperlinks:
        verdict.note(f"it contains {hyperlinks} web link(s) (not followed)")


# ----------------------------------------------------------------------- ole
def _inspect_ole(payload: bytes, verdict: GuardVerdict) -> None:
    """Legacy .doc/.xls: macros live in named storages, found by their names."""
    for marker in ("_VBA_PROJECT", "VBA", "Macros"):
        if marker.encode("utf-16-le") in payload:
            verdict.refuse("the legacy Office file carries macros (a VBA storage)")
            return
    verdict.note("legacy binary Office format: inspected for macro storage only")


# --------------------------------------------------------------------- image
def _inspect_image(payload: bytes, verdict: GuardVerdict, limits: GuardLimits) -> None:
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow ships with the vision stage
        verdict.note("image not decoded: Pillow is unavailable")
        return
    try:
        with Image.open(io.BytesIO(payload)) as image:
            width, height = image.size
            if width * height > limits.max_image_pixels:
                verdict.refuse(f"the image is {width}×{height} pixels, past the {limits.max_image_pixels:,} "
                               "pixel budget (a decompression bomb)")
                return
            image.verify()
    except Image.DecompressionBombError:
        verdict.refuse(f"the image declares more pixels than the {limits.max_image_pixels:,} pixel budget "
                       "(a decompression bomb)")
    except Exception as exc:  # Pillow raises many types for a malformed file
        verdict.refuse(f"the image does not decode ({type(exc).__name__})")
