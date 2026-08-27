import { Link } from "react-router-dom";
import Logo from "./Logo";

interface SketchHeaderProps {
  /** Show user menu */
  showUser?: boolean;
  /** Callback for user icon click */
  onUserClick?: () => void;
  /** Callback for logout */
  onLogout?: () => void;
  /** User email to display */
  userEmail?: string;
}

export default function SketchHeader({
  showUser = true,
  onLogout,
  userEmail,
}: SketchHeaderProps) {
  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-surface px-6 md:px-8 border-b-2 border-on-surface flex items-center justify-between h-16 md:h-20">
      <Link to="/dashboard" className="hover:opacity-80 transition-opacity">
        <Logo size="md" />
      </Link>

      {showUser && (
        <div className="flex items-center gap-4">
          {userEmail && (
            <span className="hidden md:block font-body text-sm text-on-surface-variant">
              {userEmail}
            </span>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="hand-drawn-border-thin bg-white px-3 py-1.5 font-label-caps text-label-caps text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors"
            >
              Log Out
            </button>
          )}
          <span className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer text-2xl hand-drawn-border-thin p-1 bg-white">
            account_circle
          </span>
        </div>
      )}
    </header>
  );
}
