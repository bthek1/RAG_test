import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PDFDropZone } from "./PDFDropZone";

function makeFile(name = "test.pdf", sizeBytes = 1024, type = "application/pdf"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

// -------------------------------------------------------------------
// Idle state (no files selected)
// -------------------------------------------------------------------
describe("PDFDropZone — idle state", () => {
  it("renders drop hint when file list is empty", () => {
    render(<PDFDropZone value={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument();
  });

  it("shows 'click to browse' affordance", () => {
    render(<PDFDropZone value={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/click to browse/i)).toBeInTheDocument();
  });

  it("shows supported extensions in the help text", () => {
    render(<PDFDropZone value={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/PDF, TXT/i)).toBeInTheDocument();
  });

  it("is keyboard accessible — drop zone has tabIndex=0", () => {
    render(<PDFDropZone value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("tabIndex", "0");
  });
});

// -------------------------------------------------------------------
// File list rendering
// -------------------------------------------------------------------
describe("PDFDropZone — file list", () => {
  it("shows filename, type label, and size for a single file", () => {
    const file = makeFile("report.pdf", 2048);
    render(<PDFDropZone value={[file]} onChange={vi.fn()} />);
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText(/PDF/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it("renders one list entry per file for multiple files", () => {
    const files = [
      makeFile("a.pdf"),
      makeFile("b.docx", 512, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      makeFile("c.csv", 256, "text/csv"),
    ];
    render(<PDFDropZone value={files} onChange={vi.fn()} />);
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.docx")).toBeInTheDocument();
    expect(screen.getByText("c.csv")).toBeInTheDocument();
  });

  it("shows a remove button for each file in the list", () => {
    const files = [makeFile("x.pdf"), makeFile("y.txt", 100, "text/plain")];
    render(<PDFDropZone value={files} onChange={vi.fn()} />);
    const removeBtns = screen.getAllByRole("button", { name: /remove/i });
    expect(removeBtns).toHaveLength(2);
  });
});

// -------------------------------------------------------------------
// Removing files
// -------------------------------------------------------------------
describe("PDFDropZone — removing files", () => {
  it("calls onChange without the removed file when its remove button is clicked", async () => {
    const onChange = vi.fn();
    const fileA = makeFile("a.pdf");
    const fileB = makeFile("b.txt", 100, "text/plain");
    render(<PDFDropZone value={[fileA, fileB]} onChange={onChange} />);

    const removeBtns = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeBtns[0]); // remove a.pdf

    expect(onChange).toHaveBeenCalledWith([fileB]);
  });

  it("calls onChange with empty array when the only file is removed", async () => {
    const onChange = vi.fn();
    const file = makeFile("solo.pdf");
    render(<PDFDropZone value={[file]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /remove solo\.pdf/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

// -------------------------------------------------------------------
// Drop behaviour
// -------------------------------------------------------------------
describe("PDFDropZone — drag-and-drop", () => {
  it("appends valid dropped files to the existing list via onChange", () => {
    const onChange = vi.fn();
    const existing = makeFile("existing.pdf");
    const dropped = makeFile("new.pdf");
    render(<PDFDropZone value={[existing]} onChange={onChange} />);

    fireEvent.drop(screen.getByRole("button"), {
      dataTransfer: { files: [dropped] },
    });

    expect(onChange).toHaveBeenCalledWith([existing, dropped]);
  });

  it("calls onChange with all dropped files when list was empty", () => {
    const onChange = vi.fn();
    const f1 = makeFile("a.pdf");
    const f2 = makeFile("b.md", 50, "text/markdown");
    render(<PDFDropZone value={[]} onChange={onChange} />);

    fireEvent.drop(screen.getByRole("button"), {
      dataTransfer: { files: [f1, f2] },
    });

    expect(onChange).toHaveBeenCalledWith([f1, f2]);
  });

  it("shows an error and does NOT call onChange for an unsupported extension", () => {
    const onChange = vi.fn();
    render(<PDFDropZone value={[]} onChange={onChange} />);

    const badFile = new File(["data"], "archive.zip", { type: "application/zip" });
    fireEvent.drop(screen.getByRole("button"), {
      dataTransfer: { files: [badFile] },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
  });

  it("adds valid files and shows error even if a mixed drop contains an unsupported file", () => {
    const onChange = vi.fn();
    const good = makeFile("ok.pdf");
    const bad = new File(["data"], "bad.exe", { type: "application/octet-stream" });
    render(<PDFDropZone value={[]} onChange={onChange} />);

    fireEvent.drop(screen.getByRole("button"), {
      dataTransfer: { files: [good, bad] },
    });

    // valid file is added
    expect(onChange).toHaveBeenCalledWith([good]);
    // error is shown for the bad file
    expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
  });
});

// -------------------------------------------------------------------
// Error prop
// -------------------------------------------------------------------
describe("PDFDropZone — external error prop", () => {
  it("displays the error message passed via the error prop", () => {
    render(
      <PDFDropZone
        value={[]}
        onChange={vi.fn()}
        error="File must be under 50 MB."
      />,
    );
    expect(screen.getByText("File must be under 50 MB.")).toBeInTheDocument();
  });
});
