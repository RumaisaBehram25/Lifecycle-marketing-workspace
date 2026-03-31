import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { AudienceTab } from '@/components/lifecycle/AudienceTab';

export default function Audience() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Audience"
          description="Starred segments for campaign targeting"
        />
        <AudienceTab />
      </div>
    </AppLayout>
  );
}
