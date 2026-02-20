import { Link, useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import { navItems, isNavItemActive } from "./nav-config";

export function BottomNav() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-white/10 px-6 pb-8 pt-4 z-50">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const active = isNavItemActive(item, path);
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
