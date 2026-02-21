import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { OnboardingTab } from '@/components/resource/OnboardingTab';

export default function Onboarding() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Client Onboarding"
          description="Complete this survey to set up your client profile and enrich the dashboard"
        />
        <OnboardingTab />
      </div>
    </AppLayout>
  );
}
