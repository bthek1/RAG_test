import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskStatusBadge } from "./TaskStatusBadge";
import type { TaskStatus } from "@/types/tasks";

describe("TaskStatusBadge", () => {
  const cases: Array<{ status: TaskStatus; expectedLabel: string }> = [
    { status: "PENDING", expectedLabel: "Pending" },
    { status: "RECEIVED", expectedLabel: "Received" },
    { status: "STARTED", expectedLabel: "In Progress" },
    { status: "SUCCESS", expectedLabel: "Success" },
    { status: "FAILURE", expectedLabel: "Failed" },
    { status: "REVOKED", expectedLabel: "Revoked" },
    { status: "RETRY", expectedLabel: "Retrying" },
  ];

  it.each(cases)(
    "renders '$expectedLabel' for status $status",
    ({ status, expectedLabel }) => {
      render(<TaskStatusBadge status={status} />);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    },
  );

  it("applies custom className", () => {
    render(<TaskStatusBadge status="SUCCESS" className="my-custom-class" />);
    const badge = screen.getByText("Success");
    expect(badge).toHaveClass("my-custom-class");
  });

  it("applies success styling for SUCCESS status", () => {
    render(<TaskStatusBadge status="SUCCESS" />);
    const badge = screen.getByText("Success");
    expect(badge.className).toMatch(/green/);
  });

  it("applies destructive styling for FAILURE status", () => {
    render(<TaskStatusBadge status="FAILURE" />);
    const badge = screen.getByText("Failed");
    expect(badge.className).toMatch(/destructive/);
  });

  it("applies blue styling for STARTED status", () => {
    render(<TaskStatusBadge status="STARTED" />);
    const badge = screen.getByText("In Progress");
    expect(badge.className).toMatch(/blue/);
  });
});
