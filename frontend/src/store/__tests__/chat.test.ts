import { renderHook, act } from "@testing-library/react";
import { useChatStore } from "@/store/chat";

beforeEach(() => {
  useChatStore.setState({
    conversations: [],
    activeId: null,
    selectedModel: "analysis-assistant",
  });
});

describe("newConversation", () => {
  it("creates a conversation and sets it active", () => {
    const { result } = renderHook(() => useChatStore());
    let id: string;
    act(() => {
      id = result.current.newConversation("qwen2.5:3b");
    });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeId).toBe(id!);
    expect(result.current.conversations[0].model).toBe("qwen2.5:3b");
  });
});

describe("addMessage", () => {
  it("appends a message to the correct conversation", () => {
    const { result } = renderHook(() => useChatStore());
    let id: string;
    act(() => {
      id = result.current.newConversation("analysis-assistant");
      result.current.addMessage(id, { role: "user", content: "Hello" });
    });
    expect(result.current.conversations[0].messages).toHaveLength(1);
    expect(result.current.conversations[0].messages[0].content).toBe("Hello");
  });

  it("updates the title from the first user message", () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      const id = result.current.newConversation("analysis-assistant");
      result.current.addMessage(id, { role: "user", content: "What is AI?" });
    });
    expect(result.current.conversations[0].title).toBe("What is AI?");
  });
});

describe("appendToken", () => {
  it("appends to the last assistant message if one is streaming", () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      const id = result.current.newConversation("analysis-assistant");
      result.current.addMessage(id, { role: "assistant", content: "He" });
      result.current.appendToken(id, "llo");
    });
    const msg = result.current.conversations[0].messages[0];
    expect(msg.content).toBe("Hello");
  });

  it("creates a new assistant message if none exists", () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      const id = result.current.newConversation("analysis-assistant");
      result.current.appendToken(id, "Hi");
    });
    expect(result.current.conversations[0].messages[0].role).toBe("assistant");
    expect(result.current.conversations[0].messages[0].content).toBe("Hi");
  });
});

describe("deleteConversation", () => {
  it("removes the conversation and clears activeId if it was active", () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      const id = result.current.newConversation("analysis-assistant");
      result.current.deleteConversation(id);
    });
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });
});

describe("setModel", () => {
  it("updates selectedModel", () => {
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.setModel("qwen2.5:3b");
    });
    expect(result.current.selectedModel).toBe("qwen2.5:3b");
  });
});
