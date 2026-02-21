import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { BriefTab } from '@/components/lifecycle/BriefTab';

export default function Briefs() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Action Center"
          description="Manage campaign and lifecycle briefs with progress tracking"
        />
        <BriefTab />
      </div>
    </AppLayout>
  );
}
