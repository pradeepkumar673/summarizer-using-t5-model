import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import SketchHeader from "./SketchHeader";
import BookmarkTabs from "./BookmarkTabs";

interface SketchLayoutProps {
  children: ReactNode;
  /** Document ID for bookmark tabs (if in document context) */
  documentId?: string;
  /** Document status for bookmark tab enable/disable */
  documentStatus?: string;
  /** Show bookmark tabs */
  showTabs?: boolean;
  /** Show header */
  showHeader?: boolean;
  /** User email */
  userEmail?: string;
  /** Search click handler */
  onSearchClick?: () => void;
  /** Heatmap click handler */
  onHeatmapClick?: () => void;
  /** Extra className for the main content area */
  className?: string;
}

export default function SketchLayout({
  children,
  documentId,
  documentStatus,
  showTabs = false,
  showHeader = true,
  userEmail,
  onSearchClick,
  onHeatmapClick,
  className = "",
}: SketchLayoutProps) {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("access_token");
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-checkered text-on-surface font-body overflow-x-hidden relative">
      {showHeader && (
        <SketchHeader
          userEmail={userEmail}
          onLogout={handleLogout}
        />
      )}

      {showTabs && documentId && (
        <BookmarkTabs
          documentId={documentId}
          status={documentStatus}
          onSearchClick={onSearchClick}
          onHeatmapClick={onHeatmapClick}
        />
      )}

      <main className={`${showHeader ? "pt-20 md:pt-24" : ""} ${showTabs ? "pr-16 md:pr-24" : ""} ${className}`}>
        {children}
      </main>
    </div>
  );
}
