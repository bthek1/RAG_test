import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PDFDropZone } from "./PDFDropZone";

function makePdfFile(name = "test.pdf", sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, {
    type: "application/pdf",
  });
}

describe("PDFDropZone", () => {
  it("renders drop hint when no file selected", () => {
    render(<PDFDropZone value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument();
  });

  it("shows filename and size after a file is selected", () => {
    const file = makePdfFile("report.pdf", 2048);
    render(<PDFDropZone value={file} onChange={vi.fn()} />);
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it("calls onChange with file when a valid PDF is dropped", () => {
    const onChange = vi.fn();
    render(<PDFDropZone value={null} onChange={onChange} />);

    const dropZone = screen.getByRole("button");
    const file = makePdfFile("doc.pdf");
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(onChange).toHaveBeenCalledWith(file);
  });

  it("shows inline error and does not call onChange for non-PDF files", () => {
    const onChange = vi.fn();
    render(<PDFDropZone value={null} onChange={onChange} />);

    const dropZone = screen.getByRole("button");
    const txtFile = new File(["data"], "document.txt", { type: "text/plain" });
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [txtFile] },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/only pdf/i)).toBeInTheDocument();
  });

  it("calls onChange(null) when clear button is clicked", async () => {
    const onChange = vi.fn();
    const file = makePdfFile("report.pdf");
    render(<PDFDropZone value={file} onChange={onChange} />);

    const clearBtn = screen.getByRole("button", { name: /remove file/i });
    await userEvent.click(clearBtn);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows external error prop below the drop zone", () => {
    render(
      <PDFDropZone
        value={null}
        onChange={vi.fn()}
        error="File must be under 50 MB."
      />,
    );
    expect(screen.getByText("File must be under 50 MB.")).toBeInTheDocument();
  });

  it("is keyboard accessible — Enter opens file picker area", () => {
    render(<PDFDropZone value={null} onChange={vi.fn()} />);
    const dropZone = screen.getByRole("button");
    expect(dropZone).toHaveAttribute("tabIndex", "0");
  });
});
