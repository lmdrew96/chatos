import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface Attachment {
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
}

interface MentionInputProps {
  participants: Doc<"participants">[];
  onSend: (content: string, attachments?: Attachment[]) => void;
  currentDisplayName: string;
  disabled?: boolean;
}

export default function MentionInput({
  participants,
  onSend,
  currentDisplayName,
  disabled,
}: MentionInputProps) {
  const [value, setValue] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionOptions, setMentionOptions] = useState<string[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [atPos, setAtPos] = useState(-1);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);

  const claudeNames = participants.map((p) => p.claudeName);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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

    const cursor = e.target.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");

    if (lastAt !== -1) {
      const query = before.slice(lastAt + 1);
      if (!query.includes(" ") && !query.includes("\n")) {
        const matches = claudeNames.filter((n) =>
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

  const send = async () => {
    const trimmed = value.trim();
    if ((!trimmed && selectedFiles.length === 0) || disabled || isUploading) return;

    setIsUploading(true);
    try {
      const attachments: Attachment[] = [];

      for (const file of selectedFiles) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await result.json();
        attachments.push({
          storageId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
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
            background: "rgba(30,24,48,0.97)",
            border: "1px solid rgba(139,189,185,0.2)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
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
                  i === mentionIndex ? "rgba(139,189,185,0.12)" : "transparent",
                color: "var(--off-white)",
              }}
              onMouseEnter={() => setMentionIndex(i)}
            >
              <span style={{ color: "var(--sage-teal)" }}>@</span>
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Input container */}
      <div
        className="flex flex-col gap-2 p-3 rounded-2xl transition-all"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(247,245,250,0.08)",
        }}
      >
        {/* Previews */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedFiles.map((file, i) => (
              <div
                key={i}
                className="relative group w-16 h-16 rounded-lg overflow-hidden border border-white/10"
                style={{ background: "rgba(255,255,255,0.05)" }}
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
            <div className="text-xs mb-1.5 select-none" style={{ color: "rgba(247,245,250,0.28)" }}>
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
                color: "var(--off-white)",
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 hover:bg-white/5"
              style={{
                color: "rgba(247,245,250,0.4)",
              }}
              title="Attach files (max 50MB)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90"
              style={{
                background: canSend ? "var(--amber)" : "rgba(255,255,255,0.05)",
                color: canSend ? "var(--deep-dark)" : "rgba(247,245,250,0.2)",
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
