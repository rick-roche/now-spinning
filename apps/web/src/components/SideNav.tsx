import { Link, useLocation } from "react-router-dom";
import { Icon } from "./Icon";

interface NavItem {
  label: string;
  icon: string;
  to: string;
  match?: (path: string) => boolean;
}

export function SideNav() {
  const location = useLocation();
  const path = location.pathname;

  const navItems: NavItem[] = [
    {
      label: "Collection",
      icon: "library_music",
      to: "/collection",
      match: (p) =>
        p === "/" ||
        p.startsWith("/collection") ||
        p.startsWith("/search") ||
        p.startsWith("/release"),
    },
    {
      label: "Player",
      icon: "album",
      to: "/session",
      match: (p) => p.startsWith("/session"),
    },
    {
      label: "Settings",
      icon: "settings",
      to: "/settings",
    },
  ];

  const isActive = (item: NavItem) => {
    if (item.match) return item.match(path);
    return path === item.to;
  };

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-surface-dark border-r border-border-dark z-40">
      {/* Logo / branding */}
      <div className="px-5 py-6 border-b border-border-dark">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary">
            <Icon name="album" className="text-xl" />
          </div>
          <div>
            <p className="font-bold text-sm tracking-tight leading-tight">Now Spinning</p>
            <p className="text-[10px] text-text-muted uppercase tracking-widest">Vinyl Scrobbler</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon name={item.icon} filled={active} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border-dark">
        <p className="text-[10px] text-text-muted leading-relaxed">
          Playing vinyl, scrobbling life.
        </p>
      </div>
    </aside>
  );
}
