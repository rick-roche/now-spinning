import { Link, useLocation } from "react-router-dom";
import { Icon } from "./Icon";

interface NavItem {
  label: string;
  icon: string;
  to: string;
  match?: (path: string) => boolean;
}

export function BottomNav() {
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
    if (item.match) {
      return item.match(path);
    }
    return path === item.to;
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-white/10 px-6 pb-8 pt-4 z-50">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 transition-colors ${
                active ? "text-primary" : "text-white/40 hover:text-primary"
              }`}
            >
              <Icon name={item.icon} filled={active} />
              <span className="text-[10px] font-bold uppercase tracking-tighter">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
