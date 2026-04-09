import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  LogOut,
  Send,
  Workflow,
  User,
  BookOpen,
  Volume2,
  Palette,
  Ruler,
  Users,
  Route,
  Database,
  BarChart3,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { BRCGIcon } from '@/components/BRCGLogo';

const resourceSubItems = [
  { name: 'Brand Voice', href: '/resources?tab=voice', icon: Volume2 },
  { name: 'Design', href: '/resources?tab=design', icon: Palette },
  { name: 'Rules', href: '/resources?tab=rules', icon: Ruler },
  { name: 'Audience', href: '/resources?tab=audience', icon: Users },
  { name: 'User Journeys', href: '/resources?tab=journeys', icon: Route },
  { name: 'Events & Attributes', href: '/resources?tab=events', icon: Database },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Campaigns', href: '/campaigns', icon: Send },
    { name: 'Lifecycle', href: '/lifecycle', icon: Workflow },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'AI Chat', href: '/chat', icon: MessageSquare },
  ];

  const isResourcesActive = location.pathname === '/resources' || location.pathname.startsWith('/resources');

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className={`border-b border-sidebar-border ${isCollapsed ? 'p-1' : ''}`}>
        <Link to="/dashboard" className={`flex items-center gap-3 ${isCollapsed ? 'justify-center p-1' : 'px-2 py-3'}`}>
          <div className={`flex items-center justify-center rounded-xl bg-primary flex-shrink-0 transition-all ${isCollapsed ? 'h-9 w-9' : 'h-10 w-10'}`}>
            <BRCGIcon className={`text-primary-foreground ${isCollapsed ? 'h-5 w-5' : 'h-6 w-6'}`} />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-xl font-bold text-sidebar-foreground tracking-tight">
                BRCG
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/50">
                CRM Copilot
              </span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.href || 
                  (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.name}
                    >
                      <Link to={item.href}>
                        <item.icon className="h-5 w-5" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Resource Center with nested sub-items */}
              <Collapsible defaultOpen={isResourcesActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={isResourcesActive}
                      tooltip="Resource Center"
                      onClick={() => navigate('/resources')}
                    >
                      <BookOpen className="h-5 w-5" />
                      <span className="flex-1">Resource Center</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  {!isCollapsed && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {resourceSubItems.map((sub) => {
                          const tabParam = new URL(sub.href, 'http://x').searchParams.get('tab');
                          const currentTab = new URLSearchParams(location.search).get('tab');
                          const isSubActive = location.pathname === '/resources' && currentTab === tabParam;
                          return (
                            <SidebarMenuSubItem key={sub.name}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isSubActive}
                              >
                                <Link to={sub.href}>
                                  <sub.icon className="h-4 w-4" />
                                  <span>{sub.name}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* User section */}
      <SidebarFooter className="border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors">
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">
                    {profile?.full_name || 'User'}
                  </p>
                  <p className="text-xs text-sidebar-foreground/60 truncate">
                    {profile?.email}
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
