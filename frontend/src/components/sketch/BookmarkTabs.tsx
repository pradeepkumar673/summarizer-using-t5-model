import { Link, useLocation } from "react-router-dom";

interface BookmarkTabsProps {
  documentId: string;
  /** Document status — tabs are disabled (greyed out) when not "ready" */
  status?: string;
  /** Callback when search tab is clicked (opens overlay instead of navigating) */
  onSearchClick?: () => void;
  /** Callback when heatmap tab is clicked */
  onHeatmapClick?: () => void;
}

interface TabDef {
  key: string;
  icon: string;
  label: string;
  color: string;
  activeColor: string;
  /** If set, navigates to this path (relative to /documents/:id) */
  path?: string;
  /** If true, calls a callback instead of navigating */
  isAction?: boolean;
}

const TABS: TabDef[] = [
  {
    key: "notes",
    icon: "edit_note",
    label: "Notes",
    color: "bg-primary-fixed text-on-primary-fixed",
    activeColor: "bg-primary text-on-primary",
    path: "",
  },
  {
    key: "heatmap",
    icon: "local_fire_department",
    label: "Heatmap",
    color: "bg-secondary-fixed text-on-secondary-fixed",
    activeColor: "bg-secondary-container text-on-secondary-container",
    isAction: true,
  },
  {
    key: "exam",
    icon: "assignment_turned_in",
    label: "Exam",
    color: "bg-tertiary-fixed text-on-tertiary-fixed",
    activeColor: "bg-tertiary-container text-on-tertiary-container",
    path: "/exam-essentials",
  },
  {
    key: "graph",
    icon: "hub",
    label: "Graph",
    color: "bg-primary-fixed-dim text-on-primary-fixed",
    activeColor: "bg-primary-container text-on-primary-container",
    path: "/graph",
  },
  {
    key: "viva",
    icon: "record_voice_over",
    label: "Viva",
    color: "bg-error-container text-on-error-container",
    activeColor: "bg-error text-on-error",
    path: "/viva",
  },
  {
    key: "search",
    icon: "search",
    label: "Search",
    color: "bg-surface-variant text-on-surface-variant",
    activeColor: "bg-inverse-surface text-inverse-on-surface",
    isAction: true,
  },
];

const ROTATIONS = [1, -1, 2, -2, 1, -1];

export default function BookmarkTabs({
  documentId,
  status,
  onSearchClick,
  onHeatmapClick,
}: BookmarkTabsProps) {
  const location = useLocation();
  const isReady = status === "ready";
  const basePath = `/documents/${documentId}`;

  return (
    <nav className="fixed right-0 top-24 w-16 md:w-20 flex flex-col gap-3 z-40 items-end">
      {TABS.map((tab, i) => {
        const isActive =
          tab.path !== undefined
            ? location.pathname === `${basePath}${tab.path}`
            : false;
        const rotation = ROTATIONS[i] || 0;
        const colorClass = isActive ? tab.activeColor : tab.color;
        const disabled = !isReady && tab.key !== "notes";

        const content = (
          <div
            className={`
              ${colorClass}
              py-3 px-2 -mr-1 rounded-l-full
              border-2 border-on-surface
              flex items-center gap-1
              transition-all duration-200
              ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:translate-x-[-8px]"}
              ${isActive ? "translate-x-0 shadow-sketch-sm" : "translate-x-3"}
            `}
            style={{ transform: `rotate(${rotation}deg) translateX(${isActive ? "0" : "12px"})` }}
            title={tab.label}
          >
            <span className="material-symbols-outlined text-xl">{tab.icon}</span>
          </div>
        );

        if (tab.isAction) {
          return (
            <button
              key={tab.key}
              onClick={tab.key === "search" ? onSearchClick : onHeatmapClick}
              disabled={disabled}
              className="appearance-none border-0 bg-transparent p-0"
            >
              {content}
            </button>
          );
        }

        if (disabled) {
          return <div key={tab.key}>{content}</div>;
        }

        return (
          <Link key={tab.key} to={`${basePath}${tab.path}`}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
