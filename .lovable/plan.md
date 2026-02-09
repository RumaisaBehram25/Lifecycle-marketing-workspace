

# Structural Changes Plan

## 1. Hide Analytics Tab

Remove the Analytics nav item from the sidebar and its route. The page file stays but becomes inaccessible.

**Changes:**
- `src/components/layout/AppSidebar.tsx` -- Remove the Analytics entry from `navItems`
- `src/App.tsx` -- Remove the Analytics route (or keep it but redirect; simplest to just remove)

## 2. Move Settings into User Profile Dropdown

Instead of a separate sidebar nav item, Settings becomes accessible only via the user avatar dropdown in the sidebar footer (which already has a "Settings" link). We just remove it from the main nav list.

**Changes:**
- `src/components/layout/AppSidebar.tsx` -- Remove the Settings entry from `navItems` (the dropdown menu in the footer already links to `/settings`)

## 3. Move User Management into Settings

Embed the User Management content as a tab within the Settings page, visible only to admins. Remove it from the sidebar.

**Changes:**
- `src/components/layout/AppSidebar.tsx` -- Remove the User Management entry from `navItems`
- `src/pages/Settings.tsx` -- Add a new "Users" tab (admin-only) that renders the user management table/logic currently in `UserManagement.tsx`. Extract the core content from `UserManagement.tsx` into a reusable component (e.g., `src/components/settings/UserManagementPanel.tsx`) and import it in Settings.
- `src/pages/UserManagement.tsx` -- Refactor to export its inner content as a component, or keep the page as a redirect to `/settings?tab=users`
- `src/App.tsx` -- Redirect `/users` to `/settings` (or keep route but it can stay for backwards compat)

## 4. Restructure Knowledge Base

Remove the stats cards at the top (Total Documents, Platform Docs, Custom Docs, Total Words). Reorganize tabs:

- **Integrations** (default) -- Shows connected platforms, ability to connect more, and links to platform docs for each connected integration
- **Code Generator** -- Stays as-is
- Move "Platform Docs" content into the Integrations tab (shown per-integration)
- Move "Add New" button into the Integrations tab header area

**Changes:**
- `src/pages/KnowledgeBase.tsx`:
  - Remove the 4 stats cards section
  - Remove the separate "Platform Docs" and "Add New" tabs
  - Keep only 2 tabs: "Integrations" and "Code Generator"
  - On the Integrations tab, add an "Add New" button in the card header
  - Show platform docs inline under each connected platform (expandable/collapsible)
  - Rename page title to "Integrations" or keep "Knowledge Base" with updated description

## 5. Lifecycle -- Add Splits and Time Delay Visualization

Enhance the `HorizontalFlowChart` component to better visualize:

- **Time delays**: Render as a slim vertical bar between touchpoints with the delay duration (e.g., "24h", "3d") displayed in the center
- **Audience splits**: Add a placeholder/module showing split paths with percentage labels branching from a decision node

**Changes:**
- `src/components/creative/HorizontalFlowChart.tsx`:
  - For delay/wait steps: render a thin vertical bar (narrow width, taller height) with the delay text centered, instead of a full card
  - For split/branch steps (decision_split, audience_paths, etc.): render a branching visual showing path names and percentages
  - These are currently likely skipped or rendered as regular cards; update to use distinct visual treatments

---

## Technical Details

### Sidebar changes (items 1-3)
The `navItems` array in `AppSidebar.tsx` currently has 11 items. After changes it will have 8:
- Dashboard, Briefs, Campaigns, Lifecycle, Audience, Brand, AI Chat, Knowledge Base

### Settings page (item 3)
Add a `TabsTrigger` for "Users" with `ShieldCheck` icon, only shown when `isAdmin`. The `TabsContent` renders `UserManagementPanel` -- a new component extracted from the existing `UserManagement.tsx` page logic (the table, approval flow, role management).

### Knowledge Base restructure (item 4)
Reduce from 4 tabs to 2. The "Add New" URL ingestion form moves into a dialog triggered by a button on the Integrations tab. Platform docs are shown as an expandable section under each connected platform card.

### Lifecycle flow visualization (item 5)
In `HorizontalFlowChart.tsx`, delay steps will render as:
- A narrow vertical bar (w-8, h-20 or similar) with a `Timer` icon and text like "24h" or "3 days"
- Positioned inline in the horizontal flow between message cards

Split/branch steps will render as:
- A card showing the split type (e.g., "Audience Split") with path names and percentages listed
- Visual connectors branching to show multiple paths
