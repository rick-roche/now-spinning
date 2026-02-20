interface NavItem {
  label: string;
  icon: string;
  to: string;
  match?: (path: string) => boolean;
}

export const navItems: NavItem[] = [
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

export function isNavItemActive(item: NavItem, path: string): boolean {
  if (item.match) return item.match(path);
  return path === item.to;
}
