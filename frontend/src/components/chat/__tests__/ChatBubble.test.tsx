import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatBubble } from "@/components/chat/ChatBubble";

const userMsg = { role: "user" as const, content: "Hello there" };
const assistantMsg = {
  role: "assistant" as const,
  content: "Hi! How can I help?",
};

describe("ChatBubble", () => {
  it("renders user message content", () => {
    render(<ChatBubble message={userMsg} />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders assistant message content", () => {
    render(<ChatBubble message={assistantMsg} />);
    expect(screen.getByText(/How can I help/)).toBeInTheDocument();
  });

  it("shows streaming indicator when isStreaming is true for assistant", () => {
    render(
      <ChatBubble
        message={{ role: "assistant", content: "Typing" }}
        isStreaming
      />,
    );
    expect(screen.getByLabelText("Streaming")).toBeInTheDocument();
  });

  it("does not show streaming indicator for user messages", () => {
    render(<ChatBubble message={userMsg} isStreaming />);
    expect(screen.queryByLabelText("Streaming")).not.toBeInTheDocument();
  });

  it("shows copy button on hover for assistant messages", async () => {
    render(<ChatBubble message={assistantMsg} />);
    // Copy button is hidden by default (group-hover) but exists in DOM
    const copyBtn = screen.getByLabelText("Copy message");
    expect(copyBtn).toBeInTheDocument();
  });
});
