import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FiMessageCircle, FiSend, FiX } from "react-icons/fi";
import { askAgent } from "@/apis/aiAgent";
import { isAiAgentUser } from "@/utils/accessControl";
import styles from "@/styles/chatWidget.module.css";

let messageIdCounter = 0;
const nextMessageId = () => {
  messageIdCounter += 1;
  return messageIdCounter;
};

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "agent",
  text: "Hi! I'm the Spinny Agent. Ask me anything about your data.",
};

const TYPING_INTERVAL_MS = 45;

const createSessionId = (user) => {
  const userKey = user?.id ?? user?.employee_id ?? "guest";
  const randomPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${userKey}-${randomPart}`;
};

export default function ChatWidget() {
  const user = useSelector((state) => state.auth?.user);
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingIntervalRef = useRef(null);

  const canUseAgent = isAiAgentUser(user);

  const stopTyping = useCallback(() => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => stopTyping, [stopTyping]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Reveal the agent's answer word by word instead of dumping it all at once,
  // so it reads like a live response rather than a static block of text.
  const typeOutMessage = useCallback(
    (id, fullText) =>
      new Promise((resolve) => {
        const tokens = fullText.split(/(\s+)/).filter(Boolean);
        if (tokens.length === 0) {
          resolve();
          return;
        }

        let index = 0;
        setIsTyping(true);
        typingIntervalRef.current = setInterval(() => {
          index += 1;
          const partial = tokens.slice(0, index).join("");
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: partial } : m)));

          if (index >= tokens.length) {
            stopTyping();
            setIsTyping(false);
            resolve();
          }
        }, TYPING_INTERVAL_MS);
      }),
    [stopTyping]
  );

  // Opening the widget always starts a brand-new conversation: a fresh
  // sessionId and a cleared transcript, so the agent has no memory of a
  // previous session and the panel never resumes a stale chat.
  const handleToggle = useCallback(() => {
    const nextOpen = !isOpen;

    if (nextOpen) {
      stopTyping();
      setIsLoading(false);
      setIsTyping(false);
      setError("");
      setInput("");
      setMessages([WELCOME_MESSAGE]);
      setSessionId(createSessionId(user));
    }

    setIsOpen(nextOpen);
  }, [isOpen, stopTyping, user]);

  const handleSend = useCallback(
    async (event) => {
      event?.preventDefault();
      const question = input.trim();
      if (!question || isLoading || isTyping || !sessionId) {
        return;
      }

      setMessages((prev) => [...prev, { id: nextMessageId(), role: "user", text: question }]);
      setInput("");
      setError("");
      setIsLoading(true);

      try {
        const answer = await askAgent(question, sessionId);
        setIsLoading(false);
        const agentMessageId = nextMessageId();
        setMessages((prev) => [...prev, { id: agentMessageId, role: "agent", text: "" }]);
        await typeOutMessage(agentMessageId, answer || "(No response received.)");
      } catch (err) {
        setIsLoading(false);
        setError("Something went wrong while reaching the assistant. Please try again.");
      }
    },
    [input, isLoading, isTyping, sessionId, typeOutMessage]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        handleSend(event);
      }
    },
    [handleSend]
  );

  if (!canUseAgent) {
    return null;
  }

  const isBusy = isLoading || isTyping;

  return (
    <div className={styles.widgetRoot}>
      {isOpen && (
        <div className={styles.panel} role="dialog" aria-label="AI Assistant Chat">
          <div className={styles.header}>
            <span className={styles.headerTitle}>Spinny Agent</span>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleToggle}
              aria-label="Close chat"
            >
              <FiX size={18} />
            </button>
          </div>

          <div className={styles.messages}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.messageRow} ${
                  message.role === "user" ? styles.messageRowUser : styles.messageRowAgent
                }`}
              >
                <div
                  className={`${styles.bubble} ${
                    message.role === "user" ? styles.bubbleUser : styles.bubbleAgent
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                <div className={`${styles.bubble} ${styles.bubbleAgent} ${styles.bubbleLoading}`}>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              </div>
            )}

            {error && <div className={styles.errorText}>{error}</div>}
            <div ref={messagesEndRef} />
          </div>

          <form className={styles.inputRow} onSubmit={handleSend}>
            <textarea
              ref={inputRef}
              className={styles.input}
              placeholder="Type your question..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isBusy}
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={isBusy || !input.trim()}
              aria-label="Send message"
            >
              <FiSend size={18} />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={handleToggle}
        aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
      >
        {isOpen ? <FiX size={24} /> : <FiMessageCircle size={24} />}
      </button>
    </div>
  );
}
