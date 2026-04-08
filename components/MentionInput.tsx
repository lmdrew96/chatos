import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// Lazy-load the heavy emoji picker bundle
const Picker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

interface Attachment {
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
  data?: string; // local base64 for immediate AI context
}

interface MentionInputProps {
  participants: Doc<"participants">[];
  onSend: (content: string, attachments?: Attachment[]) => void;
  currentDisplayName: string;
  disabled?: boolean;
  onTyping?: () => void;
}

export default function MentionInput({
  participants,
  onSend,
  currentDisplayName,
  disabled,
  onTyping,
}: MentionInputProps) {
  const [value, setValue] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionOptions, setMentionOptions] = useState<string[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [atPos, setAtPos] = useState(-1);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);

  const claudeNames = participants.map((p) => p.claudeName);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  // Browsers return empty or wrong MIME types for code/config files
  const resolveContentType = (file: File): string => {
    if (file.type && file.type !== "video/mp2t") return file.type;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      ts: "text/typescript", tsx: "text/typescript",
      js: "text/javascript", jsx: "text/javascript", mjs: "text/javascript",
      py: "text/x-python", rb: "text/x-ruby",
      go: "text/x-go", rs: "text/x-rust", java: "text/x-java",
      json: "application/json", yaml: "text/yaml", yml: "text/yaml",
      toml: "text/toml", xml: "application/xml", csv: "text/csv",
      html: "text/html", css: "text/css", scss: "text/scss",
      md: "text/markdown", mdx: "text/markdown", txt: "text/plain",
      sh: "text/x-shellscript", sql: "text/x-sql",
      graphql: "text/x-graphql", prisma: "text/plain",
      env: "text/plain", log: "text/plain",
      c: "text/x-c", cpp: "text/x-c++", h: "text/x-c",
      swift: "text/x-swift", kt: "text/x-kotlin",
    };
    return map[ext] ?? "application/octet-stream";
  };

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const validFiles = files.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        alert(`${f.name} is too large (max 50MB)`);
        return false;
      }
      return true;
    });

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setValue(text);
    onTyping?.();

    const cursor = e.target.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");

    if (lastAt !== -1) {
      const query = before.slice(lastAt + 1);
      if (!query.includes(" ") && !query.includes("\n")) {
        const allOptions = ["everyone", ...claudeNames];
        const matches = allOptions.filter((n) =>
          n.toLowerCase().startsWith(query.toLowerCase())
        );
        if (matches.length > 0) {
          setMentionOptions(matches);
          setMentionIndex(0);
          setAtPos(lastAt);
          setShowMentions(true);
          return;
        }
      }
    }
    setShowMentions(false);
  };

  const insertMention = (name: string) => {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, atPos);
    const after = value.slice(cursor);
    const newVal = `${before}@${name} ${after}`;
    setValue(newVal);
    setShowMentions(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + name.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const insertEmoji = (emoji: { native: string }) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const newVal = before + emoji.native + after;
    setValue(newVal);
    setShowEmojiPicker(false);

    setTimeout(() => {
      if (textarea) {
        const pos = cursor + emoji.native.length;
        textarea.focus();
        textarea.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const send = async () => {
    const trimmed = value.trim();
    if ((!trimmed && selectedFiles.length === 0) || disabled || isUploading) return;

    setIsUploading(true);
    try {
      const attachments: Attachment[] = [];

      for (const file of selectedFiles) {
        // Convert to base64 for immediate AI context
        const data: string = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(file);
        });

        const contentType = resolveContentType(file);
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!result.ok) {
          throw new Error(`Upload failed for ${file.name}: ${result.status}`);
        }
        const { storageId } = await result.json();
        attachments.push({
          storageId,
          fileName: file.name,
          contentType,
          size: file.size,
          data,
        });
      }

      onSend(trimmed, attachments.length > 0 ? attachments : undefined);
      setValue("");
      setSelectedFiles([]);
      setShowMentions(false);
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload files. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionOptions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionOptions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Escape" && showEmojiPicker) {
      setShowEmojiPicker(false);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newVal = value.slice(0, start) + "\t" + value.slice(end);
        setValue(newVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
        }, 0);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const canSend = (value.trim().length > 0 || selectedFiles.length > 0) && !disabled && !isUploading;

  return (
    <div className="relative">
      {/* @mention dropdown */}
      {showMentions && mentionOptions.length > 0 && (
        <div
          className="absolute bottom-full mb-2 left-0 right-0 rounded-xl overflow-hidden z-10"
          style={{
            background: "var(--popover)",
            border: "1px solid rgba(139,189,185,0.2)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
          }}
        >
          {mentionOptions.map((name, i) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                insertMention(name);
              }}
              className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
              style={{
                background:
                  i === mentionIndex
                    ? name === "everyone"
                      ? "rgba(223,166,73,0.1)"
                      : "rgba(139,189,185,0.12)"
                    : "transparent",
                color: "var(--fg)",
              }}
              onMouseEnter={() => setMentionIndex(i)}
            >
              <span style={{ color: name === "everyone" ? "var(--amber)" : "var(--sage-teal)" }}>@</span>
              <span style={{ color: name === "everyone" ? "var(--amber)" : undefined }}>
                {name}
              </span>
              {name === "everyone" && (
                <span className="ml-auto text-[10px]" style={{ color: "var(--text-dim)" }}>
                  all Claudes
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-full mb-2 right-0 z-20"
        >
          <Picker
            data={async () => (await import("@emoji-mart/data")).default}
            onEmojiSelect={insertEmoji}
            theme="dark"
            previewPosition="none"
            skinTonePosition="none"
            set="native"
            perLine={8}
          />
        </div>
      )}

      {/* Input container */}
      <div
        className="flex flex-col gap-2 p-3 rounded-2xl transition-all"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Previews */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedFiles.map((file, i) => (
              <div
                key={i}
                className="relative group w-16 h-16 rounded-lg overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {file.type.startsWith("image/") ? (
                  <img
                    src={URL.createObjectURL(file)}
                    className="w-full h-full object-cover"
                    alt="preview"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-1 text-[10px] text-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="truncate w-full mt-1 px-1">{file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0">
            {/* Hint */}
            <div className="text-xs mb-1.5 select-none" style={{ color: "var(--text-dim)" }}>
              {currentDisplayName ? (
                <>
                  Sending as{" "}
                  <span style={{ color: "var(--amber)" }}>{currentDisplayName}</span>
                  {" · "}
                </>
              ) : null}
              Type{" "}
              <span style={{ color: "var(--sage-teal)" }}>@name</span> to invoke a Claude
            </div>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={isUploading ? "Uploading files..." : "Say something…"}
              rows={1}
              disabled={disabled || isUploading}
              className="w-full bg-transparent outline-none resize-none text-sm"
              style={{
                color: "var(--fg)",
                lineHeight: "1.6",
                maxHeight: "140px",
                overflowY: "auto",
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />

            {/* Emoji button */}
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              disabled={disabled || isUploading}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 hover:bg-white/5"
              style={{
                color: showEmojiPicker ? "var(--amber)" : "var(--text-muted)",
              }}
              title="Emoji"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 13s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" strokeLinecap="round" />
                <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>

            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 hover:bg-white/5"
              style={{
                color: "var(--text-muted)",
              }}
              title="Attach files (max 50MB)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Send button */}
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90"
              style={{
                background: canSend ? "var(--amber)" : "rgba(255,255,255,0.05)",
                color: canSend ? "var(--deep-dark)" : "var(--text-dim)",
                boxShadow: canSend ? "0 0 16px rgba(223,166,73,0.25)" : "none",
              }}
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-deep-dark/20 border-t-deep-dark rounded-full animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1 7h12M8 2l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
