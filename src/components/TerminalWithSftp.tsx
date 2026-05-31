import { useState } from "react";
import { Terminal } from "./Terminal";
import { SftpPanel } from "./SftpPanel";

interface TerminalWithSftpProps {
  sessionId: string;
}

export function TerminalWithSftp({ sessionId }: TerminalWithSftpProps) {
  const [showSftp, setShowSftp] = useState(false);
  const [sftpWidth, setSftpWidth] = useState(400);

  return (
    <div className="h-full flex">
      {/* Terminal */}
      <div className="flex-1 min-w-0 relative">
        <Terminal sessionId={sessionId} />
        {/* Toggle SFTP button */}
        <button
          onClick={() => setShowSftp(!showSftp)}
          className={`absolute top-2 right-2 z-10 h-7 px-2 text-xs rounded border transition-colors ${
            showSftp
              ? "bg-accent text-bg-0 border-accent"
              : "bg-bg-2 text-fg-2 border-border hover:text-fg-0 hover:bg-bg-3"
          }`}
          title="切换 SFTP 面板"
        >
          {showSftp ? "隐藏 SFTP" : "SFTP"}
        </button>
      </div>

      {/* SFTP panel */}
      {showSftp && (
        <>
          {/* Resize handle */}
          <div
            className="w-1 hover:bg-accent/30 cursor-col-resize flex-shrink-0 transition-colors"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startWidth = sftpWidth;
              const onMouseMove = (e: MouseEvent) => {
                const delta = startX - e.clientX;
                const newWidth = Math.max(300, Math.min(600, startWidth + delta));
                setSftpWidth(newWidth);
              };
              const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
              };
              document.addEventListener("mousemove", onMouseMove);
              document.addEventListener("mouseup", onMouseUp);
            }}
          />
          <div style={{ width: sftpWidth }} className="flex-shrink-0 border-l border-border">
            <SftpPanel sessionId={sessionId} />
          </div>
        </>
      )}
    </div>
  );
}
