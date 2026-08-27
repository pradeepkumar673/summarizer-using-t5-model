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
    label: "Exam Essentials",
    color: "bg-tertiary-fixed text-on-tertiary-fixed",
    activeColor: "bg-tertiary-container text-on-tertiary-container",
    path: "/exam-essentials",
  },
  {
    key: "graph",
    icon: "hub",
    label: "Knowledge Graph",
    color: "bg-primary-fixed-dim text-on-primary-fixed",
    activeColor: "bg-primary-container text-on-primary-container",
    path: "/graph",
  },
  {
    key: "viva",
    icon: "record_voice_over",
    label: "Viva Simulator",
    color: "bg-error-container text-on-error-container",
    activeColor: "bg-error text-on-error",
    path: "/viva",
  },
  {
    key: "search",
    icon: "search",
    label: "Ask AI Search",
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
    <nav className="fixed right-0 top-24 flex flex-col gap-3 z-40 items-end pr-0 pointer-events-auto">
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
              group flex items-center gap-2
              py-2.5 px-3 -mr-1 rounded-l-full
              border-2 border-on-surface
              transition-all duration-300 ease-out
              ${colorClass}
              ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:-translate-x-2 hover:shadow-sketch"}
              ${isActive ? "shadow-sketch-sm ring-2 ring-on-surface" : "opacity-90 hover:opacity-100"}
            `}
            style={{
              transform: `rotate(${rotation}deg)`,
            }}
          >
            <span className="material-symbols-outlined text-xl shrink-0">{tab.icon}</span>
            <span className="font-headline text-xs font-bold whitespace-nowrap max-w-0 opacity-0 group-hover:max-w-[160px] group-hover:opacity-100 group-hover:pr-1 transition-all duration-300 ease-out overflow-hidden">
              {tab.label}
            </span>
          </div>
        );

        if (tab.isAction) {
          return (
            <button
              key={tab.key}
              onClick={tab.key === "search" ? onSearchClick : onHeatmapClick}
              disabled={disabled}
              className="appearance-none border-0 bg-transparent p-0 outline-none"
            >
              {content}
            </button>
          );
        }

        if (disabled) {
          return <div key={tab.key}>{content}</div>;
        }

        return (
          <Link key={tab.key} to={`${basePath}${tab.path}`} className="outline-none">
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

