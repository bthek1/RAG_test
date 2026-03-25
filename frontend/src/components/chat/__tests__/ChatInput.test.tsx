import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "@/components/chat/ChatInput";

const onSend = vi.fn();

beforeEach(() => vi.clearAllMocks());

describe("ChatInput", () => {
  it("calls onSend with trimmed text on Enter", async () => {
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("does not send empty text", async () => {
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send on Shift+Enter", async () => {
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Hello{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears the input after sending", async () => {
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(textarea, "Hello{Enter}");
    expect(textarea.value).toBe("");
  });

  it("calls onSend when Send button is clicked", async () => {
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Test message");
    const sendBtn = screen.getByRole("button", { name: /send/i });
    await userEvent.click(sendBtn);
    expect(onSend).toHaveBeenCalledWith("Test message");
  });

  it("disables input when disabled prop is true", () => {
    render(<ChatInput onSend={onSend} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });
});
