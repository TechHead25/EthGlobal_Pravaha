import { can, type Permission, type Principal } from "../../lib/auth/roles";

export type NavIconName =
  | "home"
  | "hand-coins"
  | "building"
  | "truck"
  | "scale"
  | "shield"
  | "inbox"
  | "users"
  | "scroll"
  | "terminal"
  | "key"
  | "globe"
  | "eye";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  permission: Permission;
  external?: boolean;
  /** Role-specific sub-navigation, shown when the section is active. Same permission as the parent. */
  children?: { href: string; label: string }[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { href: "/app/dashboard", label: "Overview", icon: "home", permission: "dashboard:view" },
      { href: "/app/access", label: "Access & roles", icon: "key", permission: "role:request" },
    ],
  },
  {
    title: "Roles",
    items: [
      {
        href: "/app/donor",
        label: "Donor",
        icon: "hand-coins",
        permission: "donor:view",
        children: [
          { href: "/app/donor", label: "Overview" },
          { href: "/app/donor/campaigns", label: "Discover campaigns" },
          { href: "/app/donor/donations", label: "My donations" },
          { href: "/app/donor/flow", label: "Live fund flow" },
        ],
      },
      {
        href: "/app/ngo",
        label: "NGO",
        icon: "building",
        permission: "ngo:view",
        children: [
          { href: "/app/ngo", label: "Overview" },
          { href: "/app/ngo/campaigns", label: "Campaigns" },
          { href: "/app/ngo/campaigns/new", label: "New campaign" },
          { href: "/app/ngo/procurement", label: "Procurement" },
          { href: "/app/ngo/delivery", label: "Delivery & release" },
        ],
      },
      {
        href: "/app/vendor",
        label: "Vendor",
        icon: "truck",
        permission: "vendor:view",
        children: [
          { href: "/app/vendor", label: "Overview" },
          { href: "/app/vendor/opportunities", label: "Opportunities" },
          { href: "/app/vendor/bids", label: "My bids" },
          { href: "/app/vendor/contracts", label: "Contracts & payments" },
          { href: "/app/vendor/profile", label: "Profile" },
        ],
      },
      {
        href: "/app/validator",
        label: "Validator",
        icon: "scale",
        permission: "validator:view",
        children: [
          { href: "/app/validator", label: "Overview" },
          { href: "/app/validator/reviews", label: "Motions & review" },
          { href: "/app/validator/history", label: "Decision history" },
        ],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/app/admin", label: "Admin overview", icon: "shield", permission: "admin:view" },
      { href: "/app/admin/requests", label: "Approvals", icon: "inbox", permission: "admin:review_requests" },
      { href: "/app/admin/users", label: "Users & roles", icon: "users", permission: "admin:manage_roles" },
      { href: "/app/admin/audit", label: "Audit log", icon: "scroll", permission: "admin:view_audit" },
      { href: "/app/console", label: "Integration console", icon: "terminal", permission: "admin:view_health" },
    ],
  },
  {
    title: "Public",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: "globe", permission: "dashboard:view" },
      { href: "/transparency", label: "Transparency", icon: "eye", permission: "dashboard:view" },
    ],
  },
];

/** Filters navigation by server-resolved permissions. UI-only; pages re-check on the server. */
export function navFor(principal: Principal): NavSection[] {
  return SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => can(principal, i.permission)) })).filter((s) => s.items.length > 0);
}

export const BREADCRUMB_LABELS: Record<string, string> = {
  app: "Workspace",
  dashboard: "Overview",
  access: "Access & roles",
  donor: "Donor",
  ngo: "NGO",
  vendor: "Vendor",
  validator: "Validator",
  admin: "Admin",
  requests: "Approvals",
  users: "Users & roles",
  audit: "Audit log",
  console: "Integration console",
  forbidden: "Access required",
  new: "New campaign",
  campaigns: "Campaigns",
  donations: "My donations",
  flow: "Live fund flow",
  procurement: "Procurement",
  delivery: "Delivery & release",
  opportunities: "Opportunities",
  bids: "My bids",
  contracts: "Contracts & payments",
  profile: "Profile",
  reviews: "Motions & review",
  history: "Decision history",
};

/** Longest-prefix active match among a section's children. */
export function activeChild(children: { href: string }[], pathname: string): string | null {
  const hits = children.filter((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0]?.href ?? null;
}
