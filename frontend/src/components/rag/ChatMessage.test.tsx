import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import type { RAGSource } from "@/types/embeddings";

function makeSource(overrides: Partial<RAGSource> = {}): RAGSource {
  return {
    chunk_id: "cccccccc-0000-0000-0000-000000000001",
    document_title: "Test Paper",
    content:
      "The attention mechanism allows the model to focus on relevant parts.",
    distance: 0.1,
    ...overrides,
  };
}

function makeUserMessage(
  overrides: Partial<ChatMessageData> = {},
): ChatMessageData {
  return {
    id: "msg-1",
    role: "user",
    content: "What is the attention mechanism?",
    ...overrides,
  };
}

function makeAssistantMessage(
  overrides: Partial<ChatMessageData> = {},
): ChatMessageData {
  return {
    id: "msg-2",
    role: "assistant",
    content:
      "The attention mechanism allows a model to focus on relevant parts of the input.",
    ...overrides,
  };
}

// ChatMessage uses Accordion internally for sources — wrap to satisfy context
function renderMessage(message: ChatMessageData) {
  return render(<ChatMessage message={message} />);
}

describe("ChatMessage", () => {
  it("role=user renders the user content", () => {
    renderMessage(makeUserMessage());
    expect(
      screen.getByText("What is the attention mechanism?"),
    ).toBeInTheDocument();
  });

  it("role=user does not render a Sources section", () => {
    renderMessage(makeUserMessage());
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument();
  });

  it("role=assistant renders the answer content", () => {
    renderMessage(makeAssistantMessage());
    expect(
      screen.getByText(/The attention mechanism allows a model/),
    ).toBeInTheDocument();
  });

  it("role=assistant with no sources does not render Sources section", () => {
    renderMessage(makeAssistantMessage({ sources: [] }));
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument();
  });

  it("role=assistant with sources renders the Sources accordion header", () => {
    renderMessage(makeAssistantMessage({ sources: [makeSource()] }));
    expect(screen.getByText(/📎 Sources/)).toBeInTheDocument();
  });

  it("source count in header matches sources array length", () => {
    renderMessage(
      makeAssistantMessage({
        sources: [
          makeSource(),
          makeSource({ chunk_id: "cccccccc-0000-0000-0000-000000000002" }),
        ],
      }),
    );
    expect(screen.getByText(/2 chunks used/)).toBeInTheDocument();
  });

  it("isLoading=true renders TypingIndicator instead of answer text", () => {
    renderMessage(makeAssistantMessage({ isLoading: true, content: "" }));
    expect(screen.getByLabelText(/claude is thinking/i)).toBeInTheDocument();
  });

  it("isLoading=false renders content directly", () => {
    renderMessage(makeAssistantMessage({ isLoading: false }));
    expect(
      screen.getByText(/The attention mechanism allows a model/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/claude is thinking/i),
    ).not.toBeInTheDocument();
  });

  it("sources accordion is collapsed by default", () => {
    renderMessage(makeAssistantMessage({ sources: [makeSource()] }));
    // content inside accordion item should not be visible before clicking
    expect(
      screen.queryByText(/The attention mechanism allows the model/),
    ).not.toBeInTheDocument();
  });

  it("clicking a source accordion item expands it to show chunk content", async () => {
    const user = userEvent.setup();
    renderMessage(makeAssistantMessage({ sources: [makeSource()] }));

    // click the trigger (document title shown in accordion trigger)
    await user.click(screen.getByText("Test Paper"));

    expect(
      screen.getByText(/The attention mechanism allows the model to focus/),
    ).toBeInTheDocument();
  });
});
